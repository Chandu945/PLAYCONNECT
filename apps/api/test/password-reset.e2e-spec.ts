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
import { PASSWORD_RESET_CHALLENGE_REPOSITORY } from '../src/domain/identity/ports/password-reset-challenge.repository';
import { OTP_GENERATOR } from '../src/application/identity/ports/otp-generator.port';
import { OTP_HASHER } from '../src/application/identity/ports/otp-hasher.port';
import { EMAIL_SENDER_PORT } from '../src/application/notifications/ports/email-sender.port';
import { OwnerSignupUseCase } from '../src/application/identity/use-cases/owner-signup.usecase';
import { LoginUseCase } from '../src/application/identity/use-cases/login.usecase';
import { RefreshUseCase } from '../src/application/identity/use-cases/refresh.usecase';
import { LogoutUseCase } from '../src/application/identity/use-cases/logout.usecase';
import { RequestPasswordResetUseCase } from '../src/application/identity/use-cases/request-password-reset.usecase';
import { ConfirmPasswordResetUseCase } from '../src/application/identity/use-cases/confirm-password-reset.usecase';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryPasswordResetChallengeRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService, createTestPasswordHasher } from './helpers/test-services';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { SessionRepository } from '../src/domain/identity/ports/session.repository';
import type { PasswordHasher } from '../src/application/identity/ports/password-hasher.port';
import type { TokenService } from '../src/application/identity/ports/token-service.port';
import type { PasswordResetChallengeRepository } from '../src/domain/identity/ports/password-reset-challenge.repository';
import type { OtpGenerator } from '../src/application/identity/ports/otp-generator.port';
import type { OtpHasher } from '../src/application/identity/ports/otp-hasher.port';
import type { EmailSenderPort } from '../src/application/notifications/ports/email-sender.port';
import { hashSync, compareSync } from 'bcryptjs';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Password Reset (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let challengeRepo: InMemoryPasswordResetChallengeRepository;
  let capturedOtp: string;
  let emailsSent: Array<{ to: string; subject: string; html: string }>;

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
    challengeRepo = new InMemoryPasswordResetChallengeRepository();
    const hasher = createTestPasswordHasher();
    const jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    capturedOtp = '';
    emailsSent = [];

    const otpGenerator: OtpGenerator = {
      generate: () => {
        capturedOtp = '654321';
        return capturedOtp;
      },
    };

    const otpHasher: OtpHasher = {
      hash: async (otp: string) => hashSync(otp, 4),
      compare: async (otp: string, hash: string) => compareSync(otp, hash),
    };

    const emailSender: EmailSenderPort = {
      send: async (msg) => {
        emailsSent.push(msg);
        return true;
      },
    };

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
        { provide: PASSWORD_RESET_CHALLENGE_REPOSITORY, useValue: challengeRepo },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        { provide: OTP_GENERATOR, useValue: otpGenerator },
        { provide: OTP_HASHER, useValue: otpHasher },
        { provide: EMAIL_SENDER_PORT, useValue: emailSender },
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
        {
          provide: 'REQUEST_PASSWORD_RESET_USE_CASE',
          useFactory: (
            ur: UserRepository,
            cr: PasswordResetChallengeRepository,
            og: OtpGenerator,
            oh: OtpHasher,
            es: EmailSenderPort,
          ) => new RequestPasswordResetUseCase(ur, cr, og, oh, es),
          inject: [
            USER_REPOSITORY,
            PASSWORD_RESET_CHALLENGE_REPOSITORY,
            OTP_GENERATOR,
            OTP_HASHER,
            EMAIL_SENDER_PORT,
          ],
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
          inject: [
            USER_REPOSITORY,
            SESSION_REPOSITORY,
            PASSWORD_RESET_CHALLENGE_REPOSITORY,
            OTP_HASHER,
            PASSWORD_HASHER,
          ],
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
    challengeRepo.clear();
    emailsSent = [];
    capturedOtp = '';
  });

  async function signupUser() {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/owner/signup')
      .send({
        fullName: 'Rajesh Kumar',
        phoneNumber: '+919876543210',
        email: 'rajesh@example.com',
        password: 'OldPassword1!',
        deviceId: 'device-1',
      })
      .expect(201);
    return res.body.data;
  }

  describe('POST /api/v1/auth/password-reset/request', () => {
    it('should return 200 for existing user and send email', async () => {
      await signupUser();

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'rajesh@example.com' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('If an account exists');
      expect(emailsSent).toHaveLength(1);
      expect(emailsSent[0]!.to).toBe('rajesh@example.com');
    });

    it('should return 200 for non-existent email (no enumeration)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'noone@example.com' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('If an account exists');
      expect(emailsSent).toHaveLength(0);
    });

    it('should reject invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/password-reset/confirm', () => {
    it('should reset password and allow login with new password', async () => {
      await signupUser();

      // Request OTP
      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'rajesh@example.com' })
        .expect(200);

      // Confirm reset
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          email: 'rajesh@example.com',
          otp: capturedOtp,
          newPassword: 'NewPassword1!',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Password reset successful.');

      // Should login with new password
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'rajesh@example.com', password: 'NewPassword1!' })
        .expect(200);

      expect(loginRes.body.success).toBe(true);

      // Old password should fail
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'rajesh@example.com', password: 'OldPassword1!' })
        .expect(401);
    });

    it('should return 401 for wrong OTP', async () => {
      await signupUser();

      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'rajesh@example.com' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          email: 'rajesh@example.com',
          otp: '000000',
          newPassword: 'NewPassword1!',
        })
        .expect(401);
    });

    it('should return 401 when no challenge exists', async () => {
      await signupUser();

      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          email: 'rajesh@example.com',
          otp: '123456',
          newPassword: 'NewPassword1!',
        })
        .expect(401);
    });

    it('should revoke existing sessions after reset', async () => {
      const signup = await signupUser();

      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'rajesh@example.com' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          email: 'rajesh@example.com',
          otp: capturedOtp,
          newPassword: 'NewPassword1!',
        })
        .expect(200);

      // Old refresh token should be invalid
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: signup.refreshToken, deviceId: signup.deviceId })
        .expect(401);
    });

    it('should reject short OTP', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          email: 'rajesh@example.com',
          otp: '123',
          newPassword: 'NewPassword1!',
        })
        .expect(400);
    });

    it('should reject short password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({
          email: 'rajesh@example.com',
          otp: '123456',
          newPassword: 'short',
        })
        .expect(400);
    });
  });
});
