import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { GlobalExceptionFilter } from '../src/shared/errors/global-exception.filter';
import { RequestIdInterceptor } from '../src/shared/logging/request-id.interceptor';
import { createGlobalValidationPipe } from '../src/shared/validation/validation.pipe';
import { AppConfigModule } from '../src/shared/config/config.module';
import { LoggingModule } from '../src/shared/logging/logging.module';
import { AdminAuthController } from '../src/presentation/http/admin-auth/admin-auth.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { SESSION_REPOSITORY } from '../src/domain/identity/ports/session.repository';
import { PASSWORD_HASHER } from '../src/application/identity/ports/password-hasher.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { AdminLoginUseCase } from '../src/application/admin-auth/use-cases/admin-login.usecase';
import { RefreshUseCase } from '../src/application/identity/use-cases/refresh.usecase';
import { LogoutUseCase } from '../src/application/identity/use-cases/logout.usecase';
import { InMemoryUserRepository, InMemorySessionRepository } from './helpers/in-memory-repos';
import { createTestTokenService, createTestPasswordHasher } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { SessionRepository } from '../src/domain/identity/ports/session.repository';
import type { PasswordHasher } from '../src/application/identity/ports/password-hasher.port';
import type { TokenService } from '../src/application/identity/ports/token-service.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Admin Auth (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let jwtService: JwtService;
  let hasher: PasswordHasher;

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '3001';
    process.env['TZ'] = 'Asia/Kolkata';
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret';
    process.env['BCRYPT_COST'] = '4';

    userRepo = new InMemoryUserRepository();
    const sessionRepo = new InMemorySessionRepository();
    hasher = createTestPasswordHasher();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [AdminAuthController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: SESSION_REPOSITORY, useValue: sessionRepo },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'ADMIN_LOGIN_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: SessionRepository,
            h: PasswordHasher,
            ts: TokenService,
          ) => new AdminLoginUseCase(ur, sr, h, ts),
          inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE],
        },
        {
          provide: 'ADMIN_REFRESH_USE_CASE',
          useFactory: (sr: SessionRepository, ur: UserRepository, ts: TokenService) =>
            new RefreshUseCase(sr, ur, ts),
          inject: [SESSION_REPOSITORY, USER_REPOSITORY, TOKEN_SERVICE],
        },
        {
          provide: 'ADMIN_LOGOUT_USE_CASE',
          useFactory: (sr: SessionRepository) => new LogoutUseCase(sr),
          inject: [SESSION_REPOSITORY],
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApiVersioning(app);
    app.useGlobalInterceptors(new RequestIdInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(createGlobalValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    userRepo.clear();
  });

  async function seedAdmin(email = 'admin@playconnect.app', password = 'admin-pass') {
    const hash = await hasher.hash(password);
    const user = User.create({
      id: 'admin-1',
      fullName: 'Super Admin',
      email,
      phoneNumber: '+910000000000',
      role: 'SUPER_ADMIN',
      passwordHash: hash,
    });
    await userRepo.save(user);
    return user;
  }

  async function seedOwner(email = 'owner@test.com', password = 'owner-pass') {
    const hash = await hasher.hash(password);
    const user = User.create({
      id: 'owner-1',
      fullName: 'Test Owner',
      email,
      phoneNumber: '+919876543210',
      role: 'OWNER',
      passwordHash: hash,
    });
    await userRepo.save(user);
    return user;
  }

  it('should login as SUPER_ADMIN', async () => {
    await seedAdmin();
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@playconnect.app', password: 'admin-pass' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.role).toBe('SUPER_ADMIN');
  });

  it('should reject non-admin login', async () => {
    await seedOwner();
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ email: 'owner@test.com', password: 'owner-pass' })
      .expect(403);

    expect(res.body.error).toBeDefined();
  });

  it('should reject invalid credentials', async () => {
    await seedAdmin();
    await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@playconnect.app', password: 'wrong' })
      .expect(401);
  });

  it('should reject non-existent email', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ email: 'nobody@example.com', password: 'test' })
      .expect(401);
  });

  it('should refresh admin token', async () => {
    await seedAdmin();
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@playconnect.app', password: 'admin-pass' })
      .expect(200);

    const { refreshToken, deviceId } = loginRes.body.data;

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken, deviceId })
      .expect(200);

    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    expect(refreshRes.body.data.refreshToken).toBeDefined();
  });

  it('should logout admin', async () => {
    await seedAdmin();
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@playconnect.app', password: 'admin-pass' })
      .expect(200);

    const { accessToken, deviceId, refreshToken } = loginRes.body.data;

    await request(app.getHttpServer())
      .post('/api/v1/admin/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken, deviceId })
      .expect(200);
  });
});
