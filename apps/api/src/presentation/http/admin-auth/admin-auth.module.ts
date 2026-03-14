import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminLoginUseCase } from '@application/admin-auth/use-cases/admin-login.usecase';
import { RefreshUseCase } from '@application/identity/use-cases/refresh.usecase';
import { LogoutUseCase } from '@application/identity/use-cases/logout.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import { SESSION_REPOSITORY } from '@domain/identity/ports/session.repository';
import type { PasswordHasher } from '@application/identity/ports/password-hasher.port';
import { PASSWORD_HASHER } from '@application/identity/ports/password-hasher.port';
import type { TokenService } from '@application/identity/ports/token-service.port';
import { TOKEN_SERVICE } from '@application/identity/ports/token-service.port';
import type { LoginAttemptTracker } from '@application/identity/services/login-attempt-tracker';
import { LOGIN_ATTEMPT_TRACKER } from '@application/identity/services/login-attempt-tracker';
import { AppConfigService } from '@shared/config/config.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminAuthController],
  providers: [
    {
      provide: 'ADMIN_LOGIN_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        sessionRepo: SessionRepository,
        hasher: PasswordHasher,
        tokenSvc: TokenService,
        config: AppConfigService,
        loginTracker: LoginAttemptTracker,
      ) => new AdminLoginUseCase(userRepo, sessionRepo, hasher, tokenSvc, config.jwtRefreshTtl, loginTracker),
      inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE, AppConfigService, LOGIN_ATTEMPT_TRACKER],
    },
    {
      provide: 'ADMIN_REFRESH_USE_CASE',
      useFactory: (
        sessionRepo: SessionRepository,
        userRepo: UserRepository,
        tokenSvc: TokenService,
        config: AppConfigService,
      ) => new RefreshUseCase(sessionRepo, userRepo, tokenSvc, config.jwtRefreshTtl),
      inject: [SESSION_REPOSITORY, USER_REPOSITORY, TOKEN_SERVICE, AppConfigService],
    },
    {
      provide: 'ADMIN_LOGOUT_USE_CASE',
      useFactory: (sessionRepo: SessionRepository) => new LogoutUseCase(sessionRepo),
      inject: [SESSION_REPOSITORY],
    },
  ],
})
export class AdminAuthModule {}
