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
import { Academy } from '../src/domain/academy/entities/academy.entity';
import { Subscription } from '../src/domain/subscription/entities/subscription.entity';
import { createAuditFields, initSoftDelete } from '../src/shared/kernel';
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

describe('Academy Disable Login + Force Logout (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let academyRepo: InMemoryAcademyRepository;
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
    const subscriptionRepo = new InMemorySubscriptionRepository();
    const auditLogRepo = new InMemoryAuditLogRepository();
    const adminQueryRepo = new StubAdminQueryRepository();
    const hasher = createTestPasswordHasher();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const passwordGenerator: PasswordGeneratorPort = { generate: () => 'temp-pass-123' };

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

  beforeEach(() => {
    userRepo.clear();
    sessionRepo.clear();
    academyRepo.clear();
  });

  function makeToken(sub: string, role: string) {
    return jwtService.sign(
      { sub, role, email: `${role.toLowerCase()}@test.com`, tokenVersion: 0 },
      { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
    );
  }

  async function seedAdmin() {
    const user = User.create({
      id: 'admin-1',
      fullName: 'Super Admin',
      email: 'admin@playconnect.app',
      phoneNumber: '+910000000000',
      role: 'SUPER_ADMIN',
      passwordHash: 'hashed',
    });
    await userRepo.save(user);
  }

  async function seedAcademyWithOwnerAndStaff() {
    const owner = User.create({
      id: 'owner-1',
      fullName: 'Test Owner',
      email: 'owner@test.com',
      phoneNumber: '+919876543210',
      role: 'OWNER',
      passwordHash: 'hashed',
    });
    await userRepo.save(
      User.reconstitute('owner-1', { ...owner['props'], academyId: 'academy-1' }),
    );

    const staff = User.create({
      id: 'staff-1',
      fullName: 'Test Staff',
      email: 'staff@test.com',
      phoneNumber: '+919876543211',
      role: 'STAFF',
      passwordHash: 'hashed',
    });
    await userRepo.save(
      User.reconstitute('staff-1', { ...staff['props'], academyId: 'academy-1' }),
    );

    const academy = Academy.reconstitute('academy-1', {
      ownerUserId: 'owner-1',
      academyName: 'Test Academy',
      address: { line1: '1 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
      loginDisabled: false,
      deactivatedAt: null,
      defaultDueDateDay: null,
      receiptPrefix: null,
      lateFeeEnabled: false,
      gracePeriodDays: 5,
      lateFeeAmountInr: 0,
      lateFeeRepeatIntervalDays: 5,
      audit: createAuditFields(),
      softDelete: initSoftDelete(),
    });
    await academyRepo.save(academy);
  }

  describe('Disable login triggers force logout', () => {
    it('should disable login and force logout all academy users atomically', async () => {
      await seedAdmin();
      await seedAcademyWithOwnerAndStaff();

      const adminToken = makeToken('admin-1', 'SUPER_ADMIN');

      const res = await request(app.getHttpServer())
        .put('/api/v1/admin/academies/academy-1/login-disabled')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ disabled: true })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.loginDisabled).toBe(true);
      expect(res.body.data.affectedUsers).toBe(2); // owner + staff

      // Verify academy is disabled
      const academy = await academyRepo.findById('academy-1');
      expect(academy?.loginDisabled).toBe(true);
      expect(academy?.deactivatedAt).toBeInstanceOf(Date);

      // Verify tokenVersions were bumped
      const owner = await userRepo.findById('owner-1');
      expect(owner?.tokenVersion).toBe(1);
      const staff = await userRepo.findById('staff-1');
      expect(staff?.tokenVersion).toBe(1);
    });

    it('should re-enable login and clear deactivatedAt', async () => {
      await seedAdmin();
      await seedAcademyWithOwnerAndStaff();

      const adminToken = makeToken('admin-1', 'SUPER_ADMIN');

      // First disable
      await request(app.getHttpServer())
        .put('/api/v1/admin/academies/academy-1/login-disabled')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ disabled: true })
        .expect(200);

      // Then enable
      const res = await request(app.getHttpServer())
        .put('/api/v1/admin/academies/academy-1/login-disabled')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ disabled: false })
        .expect(200);

      expect(res.body.data.loginDisabled).toBe(false);
      expect(res.body.data.affectedUsers).toBe(0); // no force logout on enable

      const academy = await academyRepo.findById('academy-1');
      expect(academy?.loginDisabled).toBe(false);
      expect(academy?.deactivatedAt).toBeNull();
    });

    it('should not allow non-admin to disable login', async () => {
      await seedAcademyWithOwnerAndStaff();
      const ownerToken = makeToken('owner-1', 'OWNER');

      await request(app.getHttpServer())
        .put('/api/v1/admin/academies/academy-1/login-disabled')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ disabled: true })
        .expect(403);
    });

    it('should return 404 for non-existent academy', async () => {
      await seedAdmin();
      const adminToken = makeToken('admin-1', 'SUPER_ADMIN');

      await request(app.getHttpServer())
        .put('/api/v1/admin/academies/non-existent/login-disabled')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ disabled: true })
        .expect(404);
    });
  });
});
