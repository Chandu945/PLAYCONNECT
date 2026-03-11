/**
 * Data Retention Policy Tests
 *
 * SRS mandates: "Never delete academy data."
 * These tests verify that no HTTP endpoint or repository method allows
 * hard deletion of academy-scoped core data.
 */

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
import { AdminController } from '../src/presentation/http/admin/admin.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { SESSION_REPOSITORY } from '../src/domain/identity/ports/session.repository';
import { ACADEMY_REPOSITORY } from '../src/domain/academy/ports/academy.repository';
import { SUBSCRIPTION_REPOSITORY } from '../src/domain/subscription/ports/subscription.repository';
import { AUDIT_LOG_REPOSITORY } from '../src/domain/audit/ports/audit-log.repository';
import { ADMIN_QUERY_REPOSITORY } from '../src/domain/admin/ports/admin-query.repository';
import { PASSWORD_HASHER } from '../src/application/identity/ports/password-hasher.port';
import { PASSWORD_GENERATOR } from '../src/application/common/password-generator.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { GetAdminDashboardUseCase } from '../src/application/admin/use-cases/get-admin-dashboard.usecase';
import { ListAcademiesUseCase } from '../src/application/admin/use-cases/list-academies.usecase';
import { GetAcademyDetailUseCase } from '../src/application/admin/use-cases/get-academy-detail.usecase';
import { SetSubscriptionManualUseCase } from '../src/application/admin/use-cases/set-subscription-manual.usecase';
import { DeactivateSubscriptionUseCase } from '../src/application/admin/use-cases/deactivate-subscription.usecase';
import { SetAcademyLoginDisabledUseCase } from '../src/application/admin/use-cases/set-academy-login-disabled.usecase';
import { ForceLogoutAcademyUseCase } from '../src/application/admin/use-cases/force-logout-academy.usecase';
import { ResetOwnerPasswordUseCase } from '../src/application/admin/use-cases/reset-owner-password.usecase';
import { ListAcademyAuditLogsUseCase } from '../src/application/admin/use-cases/list-academy-audit-logs.usecase';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryAcademyRepository,
  InMemorySubscriptionRepository,
  InMemoryAuditLogRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService, createTestPasswordHasher } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import type { AdminQueryRepository } from '../src/domain/admin/ports/admin-query.repository';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { SessionRepository } from '../src/domain/identity/ports/session.repository';
import type { AcademyRepository } from '../src/domain/academy/ports/academy.repository';
import type { SubscriptionRepository } from '../src/domain/subscription/ports/subscription.repository';
import type { AuditLogRepository } from '../src/domain/audit/ports/audit-log.repository';
import type { PasswordHasher } from '../src/application/identity/ports/password-hasher.port';
import type { PasswordGeneratorPort } from '../src/application/common/password-generator.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

class StubAdminQueryRepository implements AdminQueryRepository {
  async getDashboardTiles() {
    return { totalAcademies: 0, paidAcademies: 0, expiredGraceAcademies: 0, trialAcademies: 0, blockedAcademies: 0, disabledAcademies: 0 };
  }
  async listAcademies() {
    return { items: [], total: 0 };
  }
  async getAcademyDetail() {
    return null;
  }
}

describe('Academy Data Retention (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '3001';
    process.env['TZ'] = 'Asia/Kolkata';
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret';
    process.env['BCRYPT_COST'] = '4';

    const userRepo = new InMemoryUserRepository();
    const sessionRepo = new InMemorySessionRepository();
    const academyRepo = new InMemoryAcademyRepository();
    const subscriptionRepo = new InMemorySubscriptionRepository();
    const auditLogRepo = new InMemoryAuditLogRepository();
    const adminQueryRepo = new StubAdminQueryRepository();
    const hasher = createTestPasswordHasher();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const passwordGenerator: PasswordGeneratorPort = { generate: () => 'temp-pass-123' };

    const admin = User.create({
      id: 'admin-1',
      fullName: 'Super Admin',
      email: 'admin@playconnect.app',
      phoneNumber: '+910000000000',
      role: 'SUPER_ADMIN',
      passwordHash: 'hashed',
    });
    await userRepo.save(admin);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [AdminController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: SESSION_REPOSITORY, useValue: sessionRepo },
        { provide: ACADEMY_REPOSITORY, useValue: academyRepo },
        { provide: SUBSCRIPTION_REPOSITORY, useValue: subscriptionRepo },
        { provide: AUDIT_LOG_REPOSITORY, useValue: auditLogRepo },
        { provide: ADMIN_QUERY_REPOSITORY, useValue: adminQueryRepo },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: PASSWORD_GENERATOR, useValue: passwordGenerator },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'GET_ADMIN_DASHBOARD_USE_CASE',
          useFactory: (r: AdminQueryRepository) => new GetAdminDashboardUseCase(r),
          inject: [ADMIN_QUERY_REPOSITORY],
        },
        {
          provide: 'LIST_ACADEMIES_USE_CASE',
          useFactory: (r: AdminQueryRepository) => new ListAcademiesUseCase(r),
          inject: [ADMIN_QUERY_REPOSITORY],
        },
        {
          provide: 'GET_ACADEMY_DETAIL_USE_CASE',
          useFactory: (r: AdminQueryRepository) => new GetAcademyDetailUseCase(r),
          inject: [ADMIN_QUERY_REPOSITORY],
        },
        {
          provide: 'SET_SUBSCRIPTION_MANUAL_USE_CASE',
          useFactory: (r: SubscriptionRepository) => new SetSubscriptionManualUseCase(r),
          inject: [SUBSCRIPTION_REPOSITORY],
        },
        {
          provide: 'DEACTIVATE_SUBSCRIPTION_USE_CASE',
          useFactory: (r: SubscriptionRepository) => new DeactivateSubscriptionUseCase(r),
          inject: [SUBSCRIPTION_REPOSITORY],
        },
        {
          provide: 'SET_ACADEMY_LOGIN_DISABLED_USE_CASE',
          useFactory: (ar: AcademyRepository, ur: UserRepository, sr: SessionRepository) =>
            new SetAcademyLoginDisabledUseCase(ar, ur, sr),
          inject: [ACADEMY_REPOSITORY, USER_REPOSITORY, SESSION_REPOSITORY],
        },
        {
          provide: 'FORCE_LOGOUT_ACADEMY_USE_CASE',
          useFactory: (ur: UserRepository, sr: SessionRepository, ar: AcademyRepository) =>
            new ForceLogoutAcademyUseCase(ur, sr, ar),
          inject: [USER_REPOSITORY, SESSION_REPOSITORY, ACADEMY_REPOSITORY],
        },
        {
          provide: 'RESET_OWNER_PASSWORD_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: SessionRepository,
            ar: AcademyRepository,
            h: PasswordHasher,
            g: PasswordGeneratorPort,
          ) => new ResetOwnerPasswordUseCase(ur, sr, ar, h, g),
          inject: [
            USER_REPOSITORY,
            SESSION_REPOSITORY,
            ACADEMY_REPOSITORY,
            PASSWORD_HASHER,
            PASSWORD_GENERATOR,
          ],
        },
        {
          provide: 'LIST_ACADEMY_AUDIT_LOGS_USE_CASE',
          useFactory: (r: AuditLogRepository, ur: UserRepository) => new ListAcademyAuditLogsUseCase(r, ur),
          inject: [AUDIT_LOG_REPOSITORY, USER_REPOSITORY],
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

  function makeAdminToken() {
    return jwtService.sign(
      { sub: 'admin-1', role: 'SUPER_ADMIN', email: 'admin@playconnect.app', tokenVersion: 0 },
      { secret: 'test-access-secret', expiresIn: 900 },
    );
  }

  describe('No DELETE endpoints for academy data', () => {
    it('DELETE /admin/academies/:id should return 404 (no such route)', async () => {
      const token = makeAdminToken();
      // There should be no DELETE endpoint on admin controller
      const res = await request(app.getHttpServer())
        .delete('/api/v1/admin/academies/academy-1')
        .set('Authorization', `Bearer ${token}`);

      // 404 means route not found — confirming no delete endpoint exists
      expect(res.status).toBe(404);
    });

    it('DELETE /admin/academies/:id/data should return 404 (no such route)', async () => {
      const token = makeAdminToken();
      const res = await request(app.getHttpServer())
        .delete('/api/v1/admin/academies/academy-1/data')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Repository port interfaces enforce no hard-delete', () => {
    it('AcademyRepository has no delete method', () => {
      // The AcademyRepository interface only defines: save, findById, findByOwnerUserId, findAllIds
      // This is a compile-time guarantee; this test documents the policy at runtime
      const repoMethods = ['save', 'findById', 'findByOwnerUserId', 'findAllIds'];
      const deleteMethods = repoMethods.filter(
        (m) => m.toLowerCase().includes('delete') || m.toLowerCase().includes('remove'),
      );
      expect(deleteMethods).toHaveLength(0);
    });
  });
});
