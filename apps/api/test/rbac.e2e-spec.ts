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
import { AcademyOnboardingController } from '../src/presentation/http/academy-onboarding/academy-onboarding.controller';
import { ACADEMY_REPOSITORY } from '../src/domain/academy/ports/academy.repository';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { SUBSCRIPTION_REPOSITORY } from '../src/domain/subscription/ports/subscription.repository';
import { CLOCK_PORT } from '../src/application/common/clock.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { SetupAcademyUseCase } from '../src/application/academy/use-cases/setup-academy.usecase';
import { CreateTrialSubscriptionUseCase } from '../src/application/subscription/use-cases/create-trial-subscription.usecase';
import {
  InMemoryAcademyRepository,
  InMemoryUserRepository,
  InMemorySubscriptionRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import type { AcademyRepository } from '../src/domain/academy/ports/academy.repository';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { SubscriptionRepository } from '../src/domain/subscription/ports/subscription.repository';
import type { ClockPort } from '../src/application/common/clock.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('RBAC (e2e)', () => {
  let app: INestApplication;
  let academyRepo: InMemoryAcademyRepository;
  let userRepo: InMemoryUserRepository;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '3001';
    process.env['TZ'] = 'Asia/Kolkata';
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-that-is-at-least-32-characters-long';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-that-is-at-least-32-characters-long';
    process.env['BCRYPT_COST'] = '4';

    academyRepo = new InMemoryAcademyRepository();
    userRepo = new InMemoryUserRepository();
    const subscriptionRepo = new InMemorySubscriptionRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const clock: ClockPort = { now: () => new Date() };

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [AcademyOnboardingController],
      providers: [
        { provide: ACADEMY_REPOSITORY, useValue: academyRepo },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: SUBSCRIPTION_REPOSITORY, useValue: subscriptionRepo },
        { provide: CLOCK_PORT, useValue: clock },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'CREATE_TRIAL_SUBSCRIPTION_USE_CASE',
          useFactory: (repo: SubscriptionRepository, c: ClockPort) =>
            new CreateTrialSubscriptionUseCase(repo, c),
          inject: [SUBSCRIPTION_REPOSITORY, CLOCK_PORT],
        },
        {
          provide: 'SETUP_ACADEMY_USE_CASE',
          useFactory: (
            ar: AcademyRepository,
            ur: UserRepository,
            ct: CreateTrialSubscriptionUseCase,
          ) => new SetupAcademyUseCase(ar, ur, ct),
          inject: [ACADEMY_REPOSITORY, USER_REPOSITORY, 'CREATE_TRIAL_SUBSCRIPTION_USE_CASE'],
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
    academyRepo.clear();
    userRepo.clear();
  });

  function makeToken(role: string, sub = 'user-1') {
    return jwtService.sign(
      { sub, role, email: 'test@example.com', tokenVersion: 0 },
      { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
    );
  }

  function seedUser(id: string, role: string, email = 'test@example.com') {
    const user = User.create({
      id,
      fullName: 'Test User',
      email,
      phoneNumber:
        '+91' +
        id
          .replace(/[^0-9]/g, '')
          .padEnd(10, '0')
          .slice(0, 10),
      role: role as any,
      passwordHash: 'hashed',
    });
    userRepo.save(user);
  }

  const academyPayload = {
    academyName: 'Test Academy',
    address: { line1: '1 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
  };

  it('should allow OWNER to setup academy', async () => {
    seedUser('user-1', 'OWNER');
    const token = makeToken('OWNER');
    await request(app.getHttpServer())
      .post('/api/v1/academy/setup')
      .set('Authorization', `Bearer ${token}`)
      .send(academyPayload)
      .expect(201);
  });

  it('should reject STAFF from academy setup (403)', async () => {
    seedUser('user-1', 'STAFF');
    const token = makeToken('STAFF');
    await request(app.getHttpServer())
      .post('/api/v1/academy/setup')
      .set('Authorization', `Bearer ${token}`)
      .send(academyPayload)
      .expect(403);
  });

  it('should reject SUPER_ADMIN from academy setup (403)', async () => {
    seedUser('user-1', 'SUPER_ADMIN');
    const token = makeToken('SUPER_ADMIN');
    await request(app.getHttpServer())
      .post('/api/v1/academy/setup')
      .set('Authorization', `Bearer ${token}`)
      .send(academyPayload)
      .expect(403);
  });

  it('should reject missing token (401)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/academy/setup')
      .send(academyPayload)
      .expect(401);
  });

  it('should reject invalid token (401)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/academy/setup')
      .set('Authorization', 'Bearer invalid-token')
      .send(academyPayload)
      .expect(401);
  });
});
