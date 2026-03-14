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
import { AuthController } from '../src/presentation/http/auth/auth.controller';
import { StaffController } from '../src/presentation/http/staff/staff.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { SESSION_REPOSITORY } from '../src/domain/identity/ports/session.repository';
import { PASSWORD_HASHER } from '../src/application/identity/ports/password-hasher.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { OwnerSignupUseCase } from '../src/application/identity/use-cases/owner-signup.usecase';
import { LoginUseCase } from '../src/application/identity/use-cases/login.usecase';
import { RefreshUseCase } from '../src/application/identity/use-cases/refresh.usecase';
import { LogoutUseCase } from '../src/application/identity/use-cases/logout.usecase';
import { CreateStaffUseCase } from '../src/application/staff/use-cases/create-staff.usecase';
import { ListStaffUseCase } from '../src/application/staff/use-cases/list-staff.usecase';
import { UpdateStaffUseCase } from '../src/application/staff/use-cases/update-staff.usecase';
import { SetStaffStatusUseCase } from '../src/application/staff/use-cases/set-staff-status.usecase';
import { InMemoryUserRepository, InMemorySessionRepository } from './helpers/in-memory-repos';
import { createTestTokenService, createTestPasswordHasher } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { SessionRepository } from '../src/domain/identity/ports/session.repository';
import type { PasswordHasher } from '../src/application/identity/ports/password-hasher.port';
import type { TokenService } from '../src/application/identity/ports/token-service.port';
import { PASSWORD_RESET_CHALLENGE_REPOSITORY } from '../src/domain/identity/ports/password-reset-challenge.repository';
import { OTP_GENERATOR } from '../src/application/identity/ports/otp-generator.port';
import { OTP_HASHER } from '../src/application/identity/ports/otp-hasher.port';
import { EMAIL_SENDER_PORT } from '../src/application/notifications/ports/email-sender.port';
import { RequestPasswordResetUseCase } from '../src/application/identity/use-cases/request-password-reset.usecase';
import { ConfirmPasswordResetUseCase } from '../src/application/identity/use-cases/confirm-password-reset.usecase';
import { InMemoryPasswordResetChallengeRepository } from './helpers/in-memory-repos';
import type { PasswordResetChallengeRepository } from '../src/domain/identity/ports/password-reset-challenge.repository';
import type { OtpGenerator } from '../src/application/identity/ports/otp-generator.port';
import type { OtpHasher } from '../src/application/identity/ports/otp-hasher.port';
import type { EmailSenderPort } from '../src/application/notifications/ports/email-sender.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Inactive Staff Login Enforcement (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '3001';
    process.env['TZ'] = 'Asia/Kolkata';
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-that-is-at-least-32-characters-long';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-that-is-at-least-32-characters-long';
    process.env['BCRYPT_COST'] = '4';

    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    const hasher = createTestPasswordHasher();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [AuthController, StaffController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: SESSION_REPOSITORY, useValue: sessionRepo },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        // Auth use-cases
        {
          provide: 'OWNER_SIGNUP_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: SessionRepository,
            h: PasswordHasher,
            ts: TokenService,
          ) => new OwnerSignupUseCase(ur, sr, h, ts),
          inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE],
        },
        {
          provide: 'LOGIN_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: SessionRepository,
            h: PasswordHasher,
            ts: TokenService,
          ) => new LoginUseCase(ur, sr, h, ts),
          inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE],
        },
        {
          provide: 'REFRESH_USE_CASE',
          useFactory: (sr: SessionRepository, ur: UserRepository, ts: TokenService) =>
            new RefreshUseCase(sr, ur, ts),
          inject: [SESSION_REPOSITORY, USER_REPOSITORY, TOKEN_SERVICE],
        },
        {
          provide: 'LOGOUT_USE_CASE',
          useFactory: (sr: SessionRepository) => new LogoutUseCase(sr),
          inject: [SESSION_REPOSITORY],
        },
        { provide: PASSWORD_RESET_CHALLENGE_REPOSITORY, useValue: new InMemoryPasswordResetChallengeRepository() },
        { provide: OTP_GENERATOR, useValue: { generate: () => '000000' } },
        { provide: OTP_HASHER, useValue: { hash: async () => 'h', compare: async () => false } },
        { provide: EMAIL_SENDER_PORT, useValue: { send: async () => true } },
        {
          provide: 'REQUEST_PASSWORD_RESET_USE_CASE',
          useFactory: (
            ur: UserRepository,
            cr: PasswordResetChallengeRepository,
            og: OtpGenerator,
            oh: OtpHasher,
            es: EmailSenderPort,
          ) => new RequestPasswordResetUseCase(ur, cr, og, oh, es),
          inject: [USER_REPOSITORY, PASSWORD_RESET_CHALLENGE_REPOSITORY, OTP_GENERATOR, OTP_HASHER, EMAIL_SENDER_PORT],
        },
        {
          provide: 'CONFIRM_PASSWORD_RESET_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: SessionRepository,
            cr: PasswordResetChallengeRepository,
            oh: OtpHasher,
            ph: PasswordHasher,
          ) => new ConfirmPasswordResetUseCase(ur, sr, cr, oh, ph),
          inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_RESET_CHALLENGE_REPOSITORY, OTP_HASHER, PASSWORD_HASHER],
        },
        // Staff use-cases
        {
          provide: 'CREATE_STAFF_USE_CASE',
          useFactory: (ur: UserRepository, h: PasswordHasher) => new CreateStaffUseCase(ur, h),
          inject: [USER_REPOSITORY, PASSWORD_HASHER],
        },
        {
          provide: 'LIST_STAFF_USE_CASE',
          useFactory: (ur: UserRepository) => new ListStaffUseCase(ur),
          inject: [USER_REPOSITORY],
        },
        {
          provide: 'UPDATE_STAFF_USE_CASE',
          useFactory: (ur: UserRepository, h: PasswordHasher) => new UpdateStaffUseCase(ur, h),
          inject: [USER_REPOSITORY, PASSWORD_HASHER],
        },
        {
          provide: 'SET_STAFF_STATUS_USE_CASE',
          useFactory: (ur: UserRepository, sr: SessionRepository) =>
            new SetStaffStatusUseCase(ur, sr),
          inject: [USER_REPOSITORY, SESSION_REPOSITORY],
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
    sessionRepo.clear();
  });

  it('should block inactive staff login, then allow after reactivation', async () => {
    // 1. Owner signs up
    const signupRes = await request(app.getHttpServer())
      .post('/api/v1/auth/owner/signup')
      .send({
        fullName: 'Owner User',
        phoneNumber: '+919876543210',
        email: 'owner@example.com',
        password: 'Password1!',
      })
      .expect(201);

    const ownerId = signupRes.body.data.user.id;

    // 2. Set up academy for owner (seed directly since we don't have academy controller wired)
    const owner = await userRepo.findById(ownerId);
    const ownerWithAcademy = User.reconstitute(ownerId, {
      ...owner!['props'],
      academyId: 'academy-1',
    });
    await userRepo.save(ownerWithAcademy);

    // Re-create token with updated state (same user ID)
    const freshOwnerToken = jwtService.sign(
      { sub: ownerId, role: 'OWNER', email: 'owner@example.com', tokenVersion: 0 },
      { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
    );

    // 3. Owner creates staff
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${freshOwnerToken}`)
      .send({
        fullName: 'Staff User',
        phoneNumber: '+919876543211',
        email: 'staff@example.com',
        password: 'StaffPass1!',
      })
      .expect(201);

    const staffId = createRes.body.data.id;
    expect(createRes.body.data.status).toBe('ACTIVE');

    // 4. Staff logs in successfully
    const loginRes1 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'staff@example.com', password: 'StaffPass1!' })
      .expect(200);

    expect(loginRes1.body.success).toBe(true);
    expect(loginRes1.body.data.user.role).toBe('STAFF');

    // 5. Owner deactivates staff
    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${staffId}/status`)
      .set('Authorization', `Bearer ${freshOwnerToken}`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    // 6. Staff login attempt should fail (403)
    const loginRes2 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'staff@example.com', password: 'StaffPass1!' })
      .expect(403);

    expect(loginRes2.body.message).toContain('Inactive');

    // 7. Owner reactivates staff
    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${staffId}/status`)
      .set('Authorization', `Bearer ${freshOwnerToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    // 8. Staff logs in again successfully
    const loginRes3 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'staff@example.com', password: 'StaffPass1!' })
      .expect(200);

    expect(loginRes3.body.success).toBe(true);
    expect(loginRes3.body.data.user.role).toBe('STAFF');
  });
});
