import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { GlobalExceptionFilter } from '../../src/shared/errors/global-exception.filter';
import { RequestIdInterceptor } from '../../src/shared/logging/request-id.interceptor';
import { createGlobalValidationPipe } from '../../src/shared/validation/validation.pipe';
import { AppConfigModule } from '../../src/shared/config/config.module';
import { LoggingModule } from '../../src/shared/logging/logging.module';
import { AuthController } from '../../src/presentation/http/auth/auth.controller';
import { USER_REPOSITORY } from '../../src/domain/identity/ports/user.repository';
import { SESSION_REPOSITORY } from '../../src/domain/identity/ports/session.repository';
import { PASSWORD_HASHER } from '../../src/application/identity/ports/password-hasher.port';
import { TOKEN_SERVICE } from '../../src/application/identity/ports/token-service.port';
import { OwnerSignupUseCase } from '../../src/application/identity/use-cases/owner-signup.usecase';
import { LoginUseCase } from '../../src/application/identity/use-cases/login.usecase';
import { RefreshUseCase } from '../../src/application/identity/use-cases/refresh.usecase';
import { LogoutUseCase } from '../../src/application/identity/use-cases/logout.usecase';
import { InMemoryUserRepository, InMemorySessionRepository } from '../helpers/in-memory-repos';
import { createTestTokenService, createTestPasswordHasher } from '../helpers/test-services';
import type { UserRepository } from '../../src/domain/identity/ports/user.repository';
import type { SessionRepository } from '../../src/domain/identity/ports/session.repository';
import type { PasswordHasher } from '../../src/application/identity/ports/password-hasher.port';
import type { TokenService } from '../../src/application/identity/ports/token-service.port';
import { PASSWORD_RESET_CHALLENGE_REPOSITORY } from '../../src/domain/identity/ports/password-reset-challenge.repository';
import { OTP_GENERATOR } from '../../src/application/identity/ports/otp-generator.port';
import { OTP_HASHER } from '../../src/application/identity/ports/otp-hasher.port';
import { EMAIL_SENDER_PORT } from '../../src/application/notifications/ports/email-sender.port';
import { RequestPasswordResetUseCase } from '../../src/application/identity/use-cases/request-password-reset.usecase';
import { ConfirmPasswordResetUseCase } from '../../src/application/identity/use-cases/confirm-password-reset.usecase';
import { InMemoryPasswordResetChallengeRepository } from '../helpers/in-memory-repos';
import type { PasswordResetChallengeRepository } from '../../src/domain/identity/ports/password-reset-challenge.repository';
import type { OtpGenerator } from '../../src/application/identity/ports/otp-generator.port';
import type { OtpHasher } from '../../src/application/identity/ports/otp-hasher.port';
import type { EmailSenderPort } from '../../src/application/notifications/ports/email-sender.port';
import { configureApiVersioning } from '../../src/shared/config/api-versioning';

describe('Auth Failure Paths (e2e)', () => {
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

  describe('POST /auth/owner/signup — invalid inputs (400)', () => {
    it('should reject empty body', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/owner/signup').send({}).expect(400);
    });

    it('should reject missing fullName', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          phoneNumber: '+919876543210',
          email: 'test@example.com',
          password: 'Password1!',
        })
        .expect(400);
    });

    it('should reject invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          fullName: 'Test',
          phoneNumber: '+919876543210',
          email: 'not-an-email',
          password: 'Password1!',
        })
        .expect(400);
    });

    it('should reject password without uppercase', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          fullName: 'Test',
          phoneNumber: '+919876543210',
          email: 'test@example.com',
          password: 'password1!',
        })
        .expect(400);
    });
  });

  describe('POST /auth/owner/signup — conflict (409)', () => {
    it('should reject duplicate phone number', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          fullName: 'User One',
          phoneNumber: '+919876543210',
          email: 'one@example.com',
          password: 'Password1!',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          fullName: 'User Two',
          phoneNumber: '+919876543210',
          email: 'two@example.com',
          password: 'Password1!',
        })
        .expect(409);
    });
  });

  describe('POST /auth/login — failure paths', () => {
    it('should return 401 for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'nobody@test.com', password: 'Password1!' })
        .expect(401);
    });

    it('should return 400 for missing identifier', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ password: 'Password1!' })
        .expect(400);
    });

    it('should return 400 for missing password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'user@test.com' })
        .expect(400);
    });
  });

  describe('POST /auth/refresh — failure paths', () => {
    it('should return 400 for missing refreshToken', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ deviceId: 'device-1' })
        .expect(400);
    });

    it('should return 401 for invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token', deviceId: 'device-1' })
        .expect(401);
    });
  });

  describe('POST /auth/logout — failure paths', () => {
    it('should return 400 for missing deviceId', async () => {
      // Signup to get a token
      const signupRes = await request(app.getHttpServer())
        .post('/api/v1/auth/owner/signup')
        .send({
          fullName: 'Test',
          phoneNumber: '+919876543210',
          email: 'test@example.com',
          password: 'Password1!',
        })
        .expect(201);

      const token = signupRes.body.data.accessToken;

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });
  });

  describe('Expired / forged tokens', () => {
    it('should return 401 for expired token', async () => {
      const expiredToken = jwtService.sign(
        { sub: 'user-1', role: 'OWNER', email: 'x@test.com', tokenVersion: 0 },
        { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: -10 },
      );

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ deviceId: 'device-1' })
        .expect(401);
    });

    it('should return 401 for token signed with wrong secret', async () => {
      const forgedToken = jwtService.sign(
        { sub: 'user-1', role: 'OWNER', email: 'x@test.com', tokenVersion: 0 },
        { secret: 'wrong-secret', expiresIn: 900 },
      );

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${forgedToken}`)
        .send({ deviceId: 'device-1' })
        .expect(401);
    });
  });
});
