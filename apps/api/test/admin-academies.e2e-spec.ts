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

/** In-memory AdminQueryRepository that composes from individual repos */
class InMemoryAdminQueryRepository implements AdminQueryRepository {
  constructor(
    private readonly academyRepo: InMemoryAcademyRepository,
    private readonly userRepo: InMemoryUserRepository,
    private readonly subscriptionRepo: InMemorySubscriptionRepository,
  ) {}

  async getDashboardTiles() {
    // Simplified for tests
    return { totalAcademies: 1, paidAcademies: 0, expiredGraceAcademies: 0, trialAcademies: 1, blockedAcademies: 0, disabledAcademies: 0 };
  }

  async listAcademies() {
    return { items: [], total: 0 };
  }

  async getAcademyDetail(academyId: string) {
    const academy = await this.academyRepo.findById(academyId);
    if (!academy) return null;
    const owner = await this.userRepo.findById(academy.ownerUserId);
    if (!owner) return null;
    const sub = await this.subscriptionRepo.findByAcademyId(academyId);

    return {
      academyId,
      academyName: academy.academyName,
      address: academy.address,
      loginDisabled: academy.loginDisabled,
      ownerUserId: owner.id.toString(),
      ownerName: owner.fullName,
      ownerEmail: owner.emailNormalized,
      ownerPhone: owner.phoneE164,
      ownerProfilePhotoUrl: owner.profilePhotoUrl,
      subscription: sub
        ? {
            id: sub.id.toString(),
            status: 'TRIAL' as const,
            trialStartAt: sub.trialStartAt,
            trialEndAt: sub.trialEndAt,
            paidStartAt: sub.paidStartAt,
            paidEndAt: sub.paidEndAt,
            tierKey: sub.tierKey,
            pendingTierKey: sub.pendingTierKey,
            pendingTierEffectiveAt: sub.pendingTierEffectiveAt,
            manualNotes: sub.manualNotes,
            paymentReference: sub.paymentReference,
          }
        : null,
      studentCount: 0,
      staffCount: 0,
      revenueThisMonth: 0,
      createdAt: academy.audit.createdAt,
    };
  }
}

describe('Admin Academies (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let academyRepo: InMemoryAcademyRepository;
  let subscriptionRepo: InMemorySubscriptionRepository;
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
    const sessionRepo = new InMemorySessionRepository();
    academyRepo = new InMemoryAcademyRepository();
    subscriptionRepo = new InMemorySubscriptionRepository();
    const auditLogRepo = new InMemoryAuditLogRepository();
    const adminQueryRepo = new InMemoryAdminQueryRepository(
      academyRepo,
      userRepo,
      subscriptionRepo,
    );
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
    academyRepo.clear();
    subscriptionRepo.clear();
  });

  function makeToken(sub = 'admin-1', role = 'SUPER_ADMIN') {
    return jwtService.sign(
      { sub, role, email: 'admin@playconnect.app', tokenVersion: 0 },
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

  async function seedAcademyWithOwner() {
    const owner = User.create({
      id: 'owner-1',
      fullName: 'Test Owner',
      email: 'owner@test.com',
      phoneNumber: '+919876543210',
      role: 'OWNER',
      passwordHash: 'hashed',
    });
    const ownerWithAcademy = User.reconstitute('owner-1', {
      ...owner['props'],
      academyId: 'academy-1',
    });
    await userRepo.save(ownerWithAcademy);

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

    const sub = Subscription.createTrial({
      id: 'sub-1',
      academyId: 'academy-1',
      trialStartAt: new Date(),
      trialEndAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await subscriptionRepo.save(sub);
  }

  // ── Dashboard ──

  it('GET /admin/dashboard should return tiles', async () => {
    await seedAdmin();
    const token = makeToken();
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totalAcademies).toBeDefined();
  });

  // ── Academy Detail ──

  it('GET /admin/academies/:id should return detail', async () => {
    await seedAdmin();
    await seedAcademyWithOwner();
    const token = makeToken();
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/academies/academy-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.academyId).toBe('academy-1');
    expect(res.body.data.ownerName).toBe('Test Owner');
  });

  it('GET /admin/academies/:id should 404 for missing academy', async () => {
    await seedAdmin();
    const token = makeToken();
    await request(app.getHttpServer())
      .get('/api/v1/admin/academies/missing')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  // ── Set Subscription Manual ──

  it('PUT /admin/academies/:id/subscription should set paid subscription', async () => {
    await seedAdmin();
    await seedAcademyWithOwner();
    const token = makeToken();
    await request(app.getHttpServer())
      .put('/api/v1/admin/academies/academy-1/subscription')
      .set('Authorization', `Bearer ${token}`)
      .send({
        paidStartAt: '2024-04-01T00:00:00.000Z',
        paidEndAt: '2025-04-01T00:00:00.000Z',
        tierKey: 'TIER_0_50',
      })
      .expect(200);
  });

  // ── Login Disabled ──

  it('PUT /admin/academies/:id/login-disabled should toggle', async () => {
    await seedAdmin();
    await seedAcademyWithOwner();
    const token = makeToken();
    await request(app.getHttpServer())
      .put('/api/v1/admin/academies/academy-1/login-disabled')
      .set('Authorization', `Bearer ${token}`)
      .send({ disabled: true })
      .expect(200);

    const updated = await academyRepo.findById('academy-1');
    expect(updated?.loginDisabled).toBe(true);
  });

  // ── Force Logout ──

  it('POST /admin/academies/:id/force-logout should return affected count', async () => {
    await seedAdmin();
    await seedAcademyWithOwner();
    const token = makeToken();
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/academies/academy-1/force-logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.affectedUsers).toBeDefined();
  });

  // ── Reset Password ──

  it('POST /admin/academies/:id/reset-password should return temp password', async () => {
    await seedAdmin();
    await seedAcademyWithOwner();
    const token = makeToken();
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/academies/academy-1/reset-password')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.temporaryPassword).toBe('temp-pass-123');
    expect(res.body.data.ownerEmail).toBe('owner@test.com');
  });

  // ── Audit Logs ──

  it('GET /admin/academies/:id/audit-logs should return paginated logs', async () => {
    await seedAdmin();
    const token = makeToken();
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/academies/academy-1/audit-logs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toBeDefined();
    expect(res.body.data.meta).toBeDefined();
  });
});
