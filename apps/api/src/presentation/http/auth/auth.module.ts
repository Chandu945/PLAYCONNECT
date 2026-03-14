import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { UserModel, UserSchema } from '@infrastructure/database/schemas/user.schema';
import { SessionModel, SessionSchema } from '@infrastructure/database/schemas/session.schema';
import {
  PasswordResetChallengeModel,
  PasswordResetChallengeSchema,
} from '@infrastructure/database/schemas/password-reset-challenge.schema';
import { MongoUserRepository } from '@infrastructure/repositories/mongo-user.repository';
import { MongoSessionRepository } from '@infrastructure/repositories/mongo-session.repository';
import { MongoPasswordResetChallengeRepository } from '@infrastructure/repositories/mongo-password-reset-challenge.repository';
import { BcryptPasswordHasher } from '@infrastructure/security/bcrypt-password-hasher';
import { JwtTokenService } from '@infrastructure/security/jwt-token.service';
import { CryptoOtpGenerator } from '@infrastructure/security/crypto-otp-generator';
import { BcryptOtpHasher } from '@infrastructure/security/bcrypt-otp-hasher';
import { NodemailerEmailSender } from '@infrastructure/notifications/nodemailer-email-sender';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { SESSION_REPOSITORY } from '@domain/identity/ports/session.repository';
import { PASSWORD_RESET_CHALLENGE_REPOSITORY } from '@domain/identity/ports/password-reset-challenge.repository';
import { PASSWORD_HASHER } from '@application/identity/ports/password-hasher.port';
import { TOKEN_SERVICE } from '@application/identity/ports/token-service.port';
import { OTP_GENERATOR } from '@application/identity/ports/otp-generator.port';
import { OTP_HASHER } from '@application/identity/ports/otp-hasher.port';
import { EMAIL_SENDER_PORT } from '@application/notifications/ports/email-sender.port';
import { OwnerSignupUseCase } from '@application/identity/use-cases/owner-signup.usecase';
import { LoginUseCase } from '@application/identity/use-cases/login.usecase';
import { LoginAttemptTracker, LOGIN_ATTEMPT_TRACKER } from '@application/identity/services/login-attempt-tracker';
import { RefreshUseCase } from '@application/identity/use-cases/refresh.usecase';
import { LogoutUseCase } from '@application/identity/use-cases/logout.usecase';
import { LogoutAllUseCase } from '@application/identity/use-cases/logout-all.usecase';
import { RequestPasswordResetUseCase } from '@application/identity/use-cases/request-password-reset.usecase';
import { ConfirmPasswordResetUseCase } from '@application/identity/use-cases/confirm-password-reset.usecase';
import { GoogleLoginUseCase } from '@application/identity/use-cases/google-login.usecase';
import { GOOGLE_TOKEN_VERIFIER } from '@application/identity/ports/google-token-verifier.port';
import type { GoogleTokenVerifierPort } from '@application/identity/ports/google-token-verifier.port';
import { GoogleTokenVerifier } from '@infrastructure/security/google-token-verifier';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { PasswordResetChallengeRepository } from '@domain/identity/ports/password-reset-challenge.repository';
import type { PasswordHasher } from '@application/identity/ports/password-hasher.port';
import type { TokenService } from '@application/identity/ports/token-service.port';
import type { OtpGenerator } from '@application/identity/ports/otp-generator.port';
import type { OtpHasher } from '@application/identity/ports/otp-hasher.port';
import type { EmailSenderPort } from '@application/notifications/ports/email-sender.port';
import { MongoDbModule } from '@infrastructure/database/mongodb.module';
import { AppConfigService } from '@shared/config/config.service';

@Module({
  imports: [
    MongoDbModule.register(),
    MongooseModule.forFeature([
      { name: UserModel.name, schema: UserSchema },
      { name: SessionModel.name, schema: SessionSchema },
      { name: PasswordResetChallengeModel.name, schema: PasswordResetChallengeSchema },
    ]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    // Infrastructure bindings
    { provide: USER_REPOSITORY, useClass: MongoUserRepository },
    { provide: SESSION_REPOSITORY, useClass: MongoSessionRepository },
    { provide: PASSWORD_RESET_CHALLENGE_REPOSITORY, useClass: MongoPasswordResetChallengeRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: OTP_GENERATOR, useClass: CryptoOtpGenerator },
    { provide: OTP_HASHER, useClass: BcryptOtpHasher },
    { provide: EMAIL_SENDER_PORT, useClass: NodemailerEmailSender },
    { provide: GOOGLE_TOKEN_VERIFIER, useClass: GoogleTokenVerifier },
    { provide: LOGIN_ATTEMPT_TRACKER, useClass: LoginAttemptTracker },

    // Use-case factories
    {
      provide: 'OWNER_SIGNUP_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        sessionRepo: SessionRepository,
        hasher: PasswordHasher,
        tokenSvc: TokenService,
        config: AppConfigService,
      ) => new OwnerSignupUseCase(userRepo, sessionRepo, hasher, tokenSvc, config.jwtRefreshTtl),
      inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE, AppConfigService],
    },
    {
      provide: 'LOGIN_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        sessionRepo: SessionRepository,
        hasher: PasswordHasher,
        tokenSvc: TokenService,
        config: AppConfigService,
        tracker: LoginAttemptTracker,
      ) => new LoginUseCase(userRepo, sessionRepo, hasher, tokenSvc, config.jwtRefreshTtl, tracker),
      inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE, AppConfigService, LOGIN_ATTEMPT_TRACKER],
    },
    {
      provide: 'REFRESH_USE_CASE',
      useFactory: (
        sessionRepo: SessionRepository,
        userRepo: UserRepository,
        tokenSvc: TokenService,
        config: AppConfigService,
      ) => new RefreshUseCase(sessionRepo, userRepo, tokenSvc, config.jwtRefreshTtl),
      inject: [SESSION_REPOSITORY, USER_REPOSITORY, TOKEN_SERVICE, AppConfigService],
    },
    {
      provide: 'LOGOUT_USE_CASE',
      useFactory: (sessionRepo: SessionRepository) => new LogoutUseCase(sessionRepo),
      inject: [SESSION_REPOSITORY],
    },
    {
      provide: 'LOGOUT_ALL_USE_CASE',
      useFactory: (sessionRepo: SessionRepository) => new LogoutAllUseCase(sessionRepo),
      inject: [SESSION_REPOSITORY],
    },
    {
      provide: 'REQUEST_PASSWORD_RESET_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        challengeRepo: PasswordResetChallengeRepository,
        otpGen: OtpGenerator,
        otpHasher: OtpHasher,
        emailSender: EmailSenderPort,
        config: AppConfigService,
      ) =>
        new RequestPasswordResetUseCase(
          userRepo,
          challengeRepo,
          otpGen,
          otpHasher,
          emailSender,
          config.otpExpiryMinutes,
          config.otpMaxAttempts,
          config.otpCooldownSeconds,
        ),
      inject: [
        USER_REPOSITORY,
        PASSWORD_RESET_CHALLENGE_REPOSITORY,
        OTP_GENERATOR,
        OTP_HASHER,
        EMAIL_SENDER_PORT,
        AppConfigService,
      ],
    },
    {
      provide: 'CONFIRM_PASSWORD_RESET_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        sessionRepo: SessionRepository,
        challengeRepo: PasswordResetChallengeRepository,
        otpHasher: OtpHasher,
        passwordHasher: PasswordHasher,
      ) =>
        new ConfirmPasswordResetUseCase(
          userRepo,
          sessionRepo,
          challengeRepo,
          otpHasher,
          passwordHasher,
        ),
      inject: [
        USER_REPOSITORY,
        SESSION_REPOSITORY,
        PASSWORD_RESET_CHALLENGE_REPOSITORY,
        OTP_HASHER,
        PASSWORD_HASHER,
      ],
    },
    {
      provide: 'GOOGLE_LOGIN_USE_CASE',
      useFactory: (
        googleVerifier: GoogleTokenVerifierPort,
        userRepo: UserRepository,
        sessionRepo: SessionRepository,
        tokenSvc: TokenService,
        config: AppConfigService,
      ) => new GoogleLoginUseCase(googleVerifier, userRepo, sessionRepo, tokenSvc, config.jwtRefreshTtl),
      inject: [GOOGLE_TOKEN_VERIFIER, USER_REPOSITORY, SESSION_REPOSITORY, TOKEN_SERVICE, AppConfigService],
    },
  ],
  exports: [TOKEN_SERVICE, USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, LOGIN_ATTEMPT_TRACKER],
})
export class AuthModule {}
