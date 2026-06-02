import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthController } from './auth.controller';
import { UserModel, UserSchema } from '@infrastructure/database/schemas/user.schema';
import { SessionModel, SessionSchema } from '@infrastructure/database/schemas/session.schema';
import {
  PasswordResetChallengeModel,
  PasswordResetChallengeSchema,
} from '@infrastructure/database/schemas/password-reset-challenge.schema';
import {
  DeviceTokenModel,
  DeviceTokenSchema,
} from '@infrastructure/database/schemas/device-token.schema';
import { MongoUserRepository } from '@infrastructure/repositories/mongo-user.repository';
import { MongoSessionRepository } from '@infrastructure/repositories/mongo-session.repository';
import { MongoPasswordResetChallengeRepository } from '@infrastructure/repositories/mongo-password-reset-challenge.repository';
import { MongoDeviceTokenRepository } from '@infrastructure/repositories/mongo-device-token.repository';
import { BcryptPasswordHasher } from '@infrastructure/security/bcrypt-password-hasher';
import { JwtTokenService } from '@infrastructure/security/jwt-token.service';
import { CryptoOtpGenerator } from '@infrastructure/security/crypto-otp-generator';
import { BcryptOtpHasher } from '@infrastructure/security/bcrypt-otp-hasher';
import { NodemailerEmailSender } from '@infrastructure/notifications/nodemailer-email-sender';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { SESSION_REPOSITORY } from '@domain/identity/ports/session.repository';
import { PASSWORD_RESET_CHALLENGE_REPOSITORY } from '@domain/identity/ports/password-reset-challenge.repository';
import { DEVICE_TOKEN_REPOSITORY } from '@domain/notification/ports/device-token.repository';
import type { DeviceTokenRepository } from '@domain/notification/ports/device-token.repository';
import { PASSWORD_HASHER } from '@application/identity/ports/password-hasher.port';
import { TOKEN_SERVICE } from '@application/identity/ports/token-service.port';
import { OTP_GENERATOR } from '@application/identity/ports/otp-generator.port';
import { OTP_HASHER } from '@application/identity/ports/otp-hasher.port';
import { EMAIL_SENDER_PORT } from '@application/notifications/ports/email-sender.port';
import { AUDIT_RECORDER_PORT } from '@application/audit/ports/audit-recorder.port';
import type { AuditRecorderPort } from '@application/audit/ports/audit-recorder.port';
import { USER_AUTH_CACHE_PORT } from '@application/identity/ports/user-auth-cache.port';
import type { UserAuthCachePort } from '@application/identity/ports/user-auth-cache.port';
import { OwnerSignupUseCase } from '@application/identity/use-cases/owner-signup.usecase';
import { LoginUseCase } from '@application/identity/use-cases/login.usecase';
import {
  LoginAttemptTracker,
  LOGIN_ATTEMPT_TRACKER,
} from '@application/identity/services/login-attempt-tracker';
import type { LoginAttemptTrackerPort } from '@application/identity/services/login-attempt-tracker';
import {
  OtpAttemptTracker,
  OTP_ATTEMPT_TRACKER,
} from '@application/identity/services/otp-attempt-tracker';
import type { OtpAttemptTrackerPort } from '@application/identity/services/otp-attempt-tracker';
import { RefreshUseCase } from '@application/identity/use-cases/refresh.usecase';
import { LogoutUseCase } from '@application/identity/use-cases/logout.usecase';
import { LogoutAllUseCase } from '@application/identity/use-cases/logout-all.usecase';
import { RequestPasswordResetUseCase } from '@application/identity/use-cases/request-password-reset.usecase';
import { VerifyPasswordResetUseCase } from '@application/identity/use-cases/verify-password-reset.usecase';
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
      { name: DeviceTokenModel.name, schema: DeviceTokenSchema },
    ]),
    JwtModule.register({}),
    forwardRef(() => AuditLogsModule),
  ],
  controllers: [AuthController],
  providers: [
    // Infrastructure bindings
    { provide: USER_REPOSITORY, useClass: MongoUserRepository },
    { provide: SESSION_REPOSITORY, useClass: MongoSessionRepository },
    {
      provide: PASSWORD_RESET_CHALLENGE_REPOSITORY,
      useClass: MongoPasswordResetChallengeRepository,
    },
    { provide: DEVICE_TOKEN_REPOSITORY, useClass: MongoDeviceTokenRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: OTP_GENERATOR, useClass: CryptoOtpGenerator },
    { provide: OTP_HASHER, useClass: BcryptOtpHasher },
    { provide: EMAIL_SENDER_PORT, useClass: NodemailerEmailSender },
    { provide: GOOGLE_TOKEN_VERIFIER, useClass: GoogleTokenVerifier },
    { provide: LOGIN_ATTEMPT_TRACKER, useClass: LoginAttemptTracker },
    { provide: OTP_ATTEMPT_TRACKER, useClass: OtpAttemptTracker },

    // Use-case factories
    {
      provide: 'OWNER_SIGNUP_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        sessionRepo: SessionRepository,
        hasher: PasswordHasher,
        tokenSvc: TokenService,
        config: AppConfigService,
        emailSender: EmailSenderPort,
      ) =>
        new OwnerSignupUseCase(
          userRepo,
          sessionRepo,
          hasher,
          tokenSvc,
          config.jwtRefreshTtl,
          emailSender,
        ),
      inject: [
        USER_REPOSITORY,
        SESSION_REPOSITORY,
        PASSWORD_HASHER,
        TOKEN_SERVICE,
        AppConfigService,
        EMAIL_SENDER_PORT,
      ],
    },
    {
      provide: 'LOGIN_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        sessionRepo: SessionRepository,
        hasher: PasswordHasher,
        tokenSvc: TokenService,
        config: AppConfigService,
        tracker: LoginAttemptTrackerPort,
        audit: AuditRecorderPort,
      ) =>
        new LoginUseCase(
          userRepo,
          sessionRepo,
          hasher,
          tokenSvc,
          config.jwtRefreshTtl,
          tracker,
          audit,
        ),
      inject: [
        USER_REPOSITORY,
        SESSION_REPOSITORY,
        PASSWORD_HASHER,
        TOKEN_SERVICE,
        AppConfigService,
        LOGIN_ATTEMPT_TRACKER,
        AUDIT_RECORDER_PORT,
      ],
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
      useFactory: (
        sessionRepo: SessionRepository,
        deviceTokenRepo: DeviceTokenRepository,
        userRepo: UserRepository,
        audit: AuditRecorderPort,
      ) => new LogoutUseCase(sessionRepo, deviceTokenRepo, userRepo, audit),
      inject: [SESSION_REPOSITORY, DEVICE_TOKEN_REPOSITORY, USER_REPOSITORY, AUDIT_RECORDER_PORT],
    },
    {
      provide: 'LOGOUT_ALL_USE_CASE',
      useFactory: (
        sessionRepo: SessionRepository,
        deviceTokenRepo: DeviceTokenRepository,
        userRepo: UserRepository,
        audit: AuditRecorderPort,
        userAuthCache: UserAuthCachePort,
      ) => new LogoutAllUseCase(sessionRepo, deviceTokenRepo, userRepo, audit, userAuthCache),
      inject: [
        SESSION_REPOSITORY,
        DEVICE_TOKEN_REPOSITORY,
        USER_REPOSITORY,
        AUDIT_RECORDER_PORT,
        USER_AUTH_CACHE_PORT,
      ],
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
        audit: AuditRecorderPort,
        otpTracker: OtpAttemptTrackerPort,
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
          audit,
          otpTracker,
        ),
      inject: [
        USER_REPOSITORY,
        PASSWORD_RESET_CHALLENGE_REPOSITORY,
        OTP_GENERATOR,
        OTP_HASHER,
        EMAIL_SENDER_PORT,
        AppConfigService,
        AUDIT_RECORDER_PORT,
        OTP_ATTEMPT_TRACKER,
      ],
    },
    {
      provide: 'VERIFY_PASSWORD_RESET_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        challengeRepo: PasswordResetChallengeRepository,
        otpHasher: OtpHasher,
        otpTracker: OtpAttemptTrackerPort,
      ) =>
        new VerifyPasswordResetUseCase(
          userRepo,
          challengeRepo,
          otpHasher,
          otpTracker,
        ),
      inject: [
        USER_REPOSITORY,
        PASSWORD_RESET_CHALLENGE_REPOSITORY,
        OTP_HASHER,
        OTP_ATTEMPT_TRACKER,
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
        deviceTokenRepo: DeviceTokenRepository,
        otpTracker: OtpAttemptTrackerPort,
        emailSender: EmailSenderPort,
        audit: AuditRecorderPort,
        userAuthCache: UserAuthCachePort,
      ) =>
        new ConfirmPasswordResetUseCase(
          userRepo,
          sessionRepo,
          challengeRepo,
          otpHasher,
          passwordHasher,
          deviceTokenRepo,
          otpTracker,
          emailSender,
          audit,
          userAuthCache,
        ),
      inject: [
        USER_REPOSITORY,
        SESSION_REPOSITORY,
        PASSWORD_RESET_CHALLENGE_REPOSITORY,
        OTP_HASHER,
        PASSWORD_HASHER,
        DEVICE_TOKEN_REPOSITORY,
        OTP_ATTEMPT_TRACKER,
        EMAIL_SENDER_PORT,
        AUDIT_RECORDER_PORT,
        USER_AUTH_CACHE_PORT,
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
        audit: AuditRecorderPort,
      ) =>
        new GoogleLoginUseCase(
          googleVerifier,
          userRepo,
          sessionRepo,
          tokenSvc,
          config.jwtRefreshTtl,
          audit,
        ),
      inject: [
        GOOGLE_TOKEN_VERIFIER,
        USER_REPOSITORY,
        SESSION_REPOSITORY,
        TOKEN_SERVICE,
        AppConfigService,
        AUDIT_RECORDER_PORT,
      ],
    },
  ],
  exports: [
    TOKEN_SERVICE,
    USER_REPOSITORY,
    SESSION_REPOSITORY,
    PASSWORD_HASHER,
    LOGIN_ATTEMPT_TRACKER,
    DEVICE_TOKEN_REPOSITORY,
  ],
})
export class AuthModule {}
