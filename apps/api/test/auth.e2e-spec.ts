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
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { SESSION_REPOSITORY } from '../src/domain/identity/ports/session.repository';
import { PASSWORD_HASHER } from '../src/application/identity/ports/password-hasher.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { OwnerSignupUseCase } from '../src/application/identity/use-cases/owner-signup.usecase';
import { LoginUseCase } from '../src/application/identity/use-cases/login.usecase';
import { RefreshUseCase } from '../src/application/identity/use-cases/refresh.usecase';
import { LogoutUseCase } from '../src/application/identity/use-cases/logout.usecase';
import { InMemoryUserRepository, InMemorySessionRepository } from './helpers/in-memory-repos';
import { createTestTokenService, createTestPasswordHasher } from './helpers/test-services';
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

describe('Auth Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '3001';
    process.env['TZ'] = 'Asia/Kolkata';
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret';
    process.env['BCRYPT_COST'] = '4';

    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    const hasher = createTestPasswordHasher();
    const jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: SESSION_REPOSITORY, useValue: sessionRepo },
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

  describe('POST /api/v1/auth/owner/signup', () => {
    it('should return success envelope with tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          fullName: 'Rajesh Kumar',
          phoneNumber: '+919876543210',
          email: 'rajesh@example.com',
          password: 'Password1!',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.deviceId).toBeDefined();
      expect(res.body.data.user.fullName).toBe('Rajesh Kumar');
      expect(res.body.data.user.email).toBe('rajesh@example.com');
      expect(res.body.data.user.role).toBe('OWNER');
      expect(res.body.data.user.status).toBe('ACTIVE');
      expect(res.body.requestId).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });

    it('should reject duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          fullName: 'User One',
          phoneNumber: '+919876543210',
          email: 'rajesh@example.com',
          password: 'Password1!',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          fullName: 'User Two',
          phoneNumber: '+919876543211',
          email: 'rajesh@example.com',
          password: 'Password1!',
        })
        .expect(409);
    });

    it('should reject weak password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          fullName: 'Test',
          phoneNumber: '+919876543210',
          email: 'test@example.com',
          password: 'weak',
        })
        .expect(400);
    });

    it('should reject invalid phone format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          fullName: 'Test',
          phoneNumber: '9876543210',
          email: 'test@example.com',
          password: 'Password1!',
        })
        .expect(400);
    });

    it('should normalize email to lowercase', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          fullName: 'Test',
          phoneNumber: '+919876543210',
          email: 'TEST@EXAMPLE.COM',
          password: 'Password1!',
        })
        .expect(201);

      expect(res.body.data.user.email).toBe('test@example.com');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/owner/signup').send({
        fullName: 'Rajesh Kumar',
        phoneNumber: '+919876543210',
        email: 'rajesh@example.com',
        password: 'Password1!',
      });
    });

    it('should login with email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'rajesh@example.com', password: 'Password1!' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should login with phone', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: '+919876543210', password: 'Password1!' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should fail with wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'rajesh@example.com', password: 'WrongPass1!' })
        .expect(401);
    });

    it('should generate deviceId when not provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'rajesh@example.com', password: 'Password1!' })
        .expect(200);

      expect(res.body.data.deviceId).toBeDefined();
      expect(res.body.data.deviceId.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should rotate refresh token', async () => {
      const signupRes = await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          fullName: 'Test',
          phoneNumber: '+919876543210',
          email: 'test@example.com',
          password: 'Password1!',
          deviceId: 'device-1',
        })
        .expect(201);

      const { refreshToken, deviceId } = signupRes.body.data;

      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken, deviceId })
        .expect(200);

      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.accessToken).toBeDefined();
      expect(refreshRes.body.data.refreshToken).toBeDefined();
      expect(refreshRes.body.data.refreshToken).not.toBe(refreshToken);

      // Old token should no longer work
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken, deviceId })
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/google', () => {
    it('should return 501 Not Implemented', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/google').send({}).expect(501);
    });
  });
});
