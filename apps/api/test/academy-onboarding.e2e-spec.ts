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
import { AcademyOnboardingController } from '../src/presentation/http/academy-onboarding/academy-onboarding.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { SESSION_REPOSITORY } from '../src/domain/identity/ports/session.repository';
import { ACADEMY_REPOSITORY } from '../src/domain/academy/ports/academy.repository';
import { PASSWORD_HASHER } from '../src/application/identity/ports/password-hasher.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { OwnerSignupUseCase } from '../src/application/identity/use-cases/owner-signup.usecase';
import { LoginUseCase } from '../src/application/identity/use-cases/login.usecase';
import { RefreshUseCase } from '../src/application/identity/use-cases/refresh.usecase';
import { LogoutUseCase } from '../src/application/identity/use-cases/logout.usecase';
import { SetupAcademyUseCase } from '../src/application/academy/use-cases/setup-academy.usecase';
import { SUBSCRIPTION_REPOSITORY } from '../src/domain/subscription/ports/subscription.repository';
import { CLOCK_PORT } from '../src/application/common/clock.port';
import { CreateTrialSubscriptionUseCase } from '../src/application/subscription/use-cases/create-trial-subscription.usecase';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryAcademyRepository,
  InMemorySubscriptionRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService, createTestPasswordHasher } from './helpers/test-services';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { SessionRepository } from '../src/domain/identity/ports/session.repository';
import type { PasswordHasher } from '../src/application/identity/ports/password-hasher.port';
import type { TokenService } from '../src/application/identity/ports/token-service.port';
import type { AcademyRepository } from '../src/domain/academy/ports/academy.repository';
import type { SubscriptionRepository } from '../src/domain/subscription/ports/subscription.repository';
import type { ClockPort } from '../src/application/common/clock.port';
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

describe('Academy Onboarding (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let academyRepo: InMemoryAcademyRepository;
  let subscriptionRepo: InMemorySubscriptionRepository;

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
    academyRepo = new InMemoryAcademyRepository();
    subscriptionRepo = new InMemorySubscriptionRepository();
    const hasher = createTestPasswordHasher();
    const jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const clock: ClockPort = { now: () => new Date() };

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [AuthController, AcademyOnboardingController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: SESSION_REPOSITORY, useValue: sessionRepo },
        { provide: ACADEMY_REPOSITORY, useValue: academyRepo },
        { provide: SUBSCRIPTION_REPOSITORY, useValue: subscriptionRepo },
        { provide: CLOCK_PORT, useValue: clock },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: TOKEN_SERVICE, useValue: tokenService },
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
    userRepo.clear();
    sessionRepo.clear();
    academyRepo.clear();
    subscriptionRepo.clear();
  });

  async function signupOwner() {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/owner/signup')
      .send({
        fullName: 'Rajesh Kumar',
        phoneNumber: '+919876543210',
        email: 'rajesh@example.com',
        password: 'Password1!',
      })
      .expect(201);
    return res.body.data;
  }

  describe('POST /api/v1/academy/setup', () => {
    it('should require bearer token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/academy/setup')
        .send({
          academyName: 'Test Academy',
          address: {
            line1: '123 Main St',
            city: 'Hyderabad',
            state: 'Telangana',
            pincode: '500001',
            country: 'India',
          },
        })
        .expect(401);
    });

    it('should create academy for owner', async () => {
      const { accessToken } = await signupOwner();

      const res = await request(app.getHttpServer())
        .post('/api/v1/academy/setup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          academyName: 'Sunrise Dance Academy',
          address: {
            line1: '123 Main St',
            line2: 'Floor 2',
            city: 'Hyderabad',
            state: 'Telangana',
            pincode: '500001',
            country: 'India',
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.academyName).toBe('Sunrise Dance Academy');
      expect(res.body.data.address.city).toBe('Hyderabad');
    });

    it('should block second academy setup (409)', async () => {
      const { accessToken } = await signupOwner();

      await request(app.getHttpServer())
        .post('/api/v1/academy/setup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          academyName: 'First Academy',
          address: { line1: '1 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/academy/setup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          academyName: 'Second Academy',
          address: { line1: '2 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
        })
        .expect(409);
    });
  });
});
