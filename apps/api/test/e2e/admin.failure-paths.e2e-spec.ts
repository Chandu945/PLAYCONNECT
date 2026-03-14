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
import { AdminController } from '../../src/presentation/http/admin/admin.controller';
import { USER_REPOSITORY } from '../../src/domain/identity/ports/user.repository';
import { SESSION_REPOSITORY } from '../../src/domain/identity/ports/session.repository';
import { ACADEMY_REPOSITORY } from '../../src/domain/academy/ports/academy.repository';
import { SUBSCRIPTION_REPOSITORY } from '../../src/domain/subscription/ports/subscription.repository';
import { AUDIT_LOG_REPOSITORY } from '../../src/domain/audit/ports/audit-log.repository';
import { ADMIN_QUERY_REPOSITORY } from '../../src/domain/admin/ports/admin-query.repository';
import { PASSWORD_HASHER } from '../../src/application/identity/ports/password-hasher.port';
import { PASSWORD_GENERATOR } from '../../src/application/common/password-generator.port';
import { TOKEN_SERVICE } from '../../src/application/identity/ports/token-service.port';
import { GetAdminDashboardUseCase } from '../../src/application/admin/use-cases/get-admin-dashboard.usecase';
import { ListAcademiesUseCase } from '../../src/application/admin/use-cases/list-academies.usecase';
import { GetAcademyDetailUseCase } from '../../src/application/admin/use-cases/get-academy-detail.usecase';
import { ForceLogoutAcademyUseCase } from '../../src/application/admin/use-cases/force-logout-academy.usecase';
import { ResetOwnerPasswordUseCase } from '../../src/application/admin/use-cases/reset-owner-password.usecase';
import { SetSubscriptionManualUseCase } from '../../src/application/admin/use-cases/set-subscription-manual.usecase';
import { DeactivateSubscriptionUseCase } from '../../src/application/admin/use-cases/deactivate-subscription.usecase';
import { SetAcademyLoginDisabledUseCase } from '../../src/application/admin/use-cases/set-academy-login-disabled.usecase';
import { ListAcademyAuditLogsUseCase } from '../../src/application/admin/use-cases/list-academy-audit-logs.usecase';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryAcademyRepository,
  InMemorySubscriptionRepository,
  InMemoryAuditLogRepository,
} from '../helpers/in-memory-repos';
import { createTestTokenService, createTestPasswordHasher } from '../helpers/test-services';
import { User } from '../../src/domain/identity/entities/user.entity';
import type { AdminQueryRepository } from '../../src/domain/admin/ports/admin-query.repository';
import type { UserRepository } from '../../src/domain/identity/ports/user.repository';
import type { SessionRepository } from '../../src/domain/identity/ports/session.repository';
import type { AcademyRepository } from '../../src/domain/academy/ports/academy.repository';
import type { SubscriptionRepository } from '../../src/domain/subscription/ports/subscription.repository';
import type { AuditLogRepository } from '../../src/domain/audit/ports/audit-log.repository';
import type { PasswordHasher } from '../../src/application/identity/ports/password-hasher.port';
import type { PasswordGeneratorPort } from '../../src/application/common/password-generator.port';
import { configureApiVersioning } from '../../src/shared/config/api-versioning';

/** In-memory AdminQueryRepository for tests */
class InMemoryAdminQueryRepository implements AdminQueryRepository {
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

describe('Admin Failure Paths (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let academyRepo: InMemoryAcademyRepository;
  let subscriptionRepo: InMemorySubscriptionRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
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
    academyRepo = new InMemoryAcademyRepository();
    subscriptionRepo = new InMemorySubscriptionRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const hasher = createTestPasswordHasher();
    const adminQueryRepo = new InMemoryAdminQueryRepository();
    const passGenerator: PasswordGeneratorPort = { generate: () => 'TempPass1!' };

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
        { provide: PASSWORD_GENERATOR, useValue: passGenerator },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'GET_ADMIN_DASHBOARD_USE_CASE',
          useFactory: (repo: AdminQueryRepository) => new GetAdminDashboardUseCase(repo),
          inject: [ADMIN_QUERY_REPOSITORY],
        },
        {
          provide: 'LIST_ACADEMIES_USE_CASE',
          useFactory: (repo: AdminQueryRepository) => new ListAcademiesUseCase(repo),
          inject: [ADMIN_QUERY_REPOSITORY],
        },
        {
          provide: 'GET_ACADEMY_DETAIL_USE_CASE',
          useFactory: (repo: AdminQueryRepository) => new GetAcademyDetailUseCase(repo),
          inject: [ADMIN_QUERY_REPOSITORY],
        },
        {
          provide: 'SET_SUBSCRIPTION_MANUAL_USE_CASE',
          useFactory: (sr: SubscriptionRepository) => new SetSubscriptionManualUseCase(sr),
          inject: [SUBSCRIPTION_REPOSITORY],
        },
        {
          provide: 'DEACTIVATE_SUBSCRIPTION_USE_CASE',
          useFactory: (sr: SubscriptionRepository) => new DeactivateSubscriptionUseCase(sr),
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
            pg: PasswordGeneratorPort,
          ) => new ResetOwnerPasswordUseCase(ur, sr, ar, h, pg),
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
          useFactory: (alr: AuditLogRepository, ur: UserRepository) => new ListAcademyAuditLogsUseCase(alr, ur),
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

  beforeEach(() => {
    userRepo.clear();
    sessionRepo.clear();
    academyRepo.clear();
    subscriptionRepo.clear();
    auditLogRepo.clear();
  });

  function makeToken(sub = 'admin-1', role = 'SUPER_ADMIN') {
    return jwtService.sign(
      { sub, role, email: `${sub}@test.com`, tokenVersion: 0 },
      { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
    );
  }

  function seedAdmin(id = 'admin-1') {
    const user = User.create({
      id,
      fullName: 'Super Admin',
      email: `${id}@test.com`,
      phoneNumber: '+919876543299',
      role: 'SUPER_ADMIN',
      passwordHash: 'hashed',
    });
    return userRepo.save(user);
  }

  function seedOwner(id = 'owner-1') {
    const user = User.create({
      id,
      fullName: 'Test Owner',
      email: `${id}@test.com`,
      phoneNumber: '+919876543210',
      role: 'OWNER',
      passwordHash: 'hashed',
    });
    return userRepo.save(user);
  }

  describe('Admin endpoints — forbidden for non-admin roles (403)', () => {
    it('should return 403 for OWNER role accessing admin dashboard', async () => {
      await seedOwner();
      const token = makeToken('owner-1', 'OWNER');

      await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 403 for STAFF role accessing admin academies', async () => {
      const staffUser = User.create({
        id: 'staff-1',
        fullName: 'Staff',
        email: 'staff-1@test.com',
        phoneNumber: '+919876543211',
        role: 'STAFF',
        passwordHash: 'hashed',
      });
      await userRepo.save(staffUser);

      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .get('/api/v1/admin/academies')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('Admin endpoints — unauthenticated (401)', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/admin/dashboard').expect(401);
    });
  });

  describe('GET /admin/academies/:id — not found (404)', () => {
    it('should return 404 for non-existent academy', async () => {
      await seedAdmin();
      const token = makeToken();

      await request(app.getHttpServer())
        .get('/api/v1/admin/academies/nonexistent')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('POST /admin/academies/:id/force-logout — not found (404)', () => {
    it('should return 404 for non-existent academy', async () => {
      await seedAdmin();
      const token = makeToken();

      await request(app.getHttpServer())
        .post('/api/v1/admin/academies/nonexistent/force-logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('POST /admin/academies/:id/reset-owner-password — not found (404)', () => {
    it('should return 404 for non-existent academy', async () => {
      await seedAdmin();
      const token = makeToken();

      await request(app.getHttpServer())
        .post('/api/v1/admin/academies/nonexistent/reset-owner-password')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
