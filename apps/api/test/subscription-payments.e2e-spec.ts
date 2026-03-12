import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { GlobalExceptionFilter } from '../src/shared/errors/global-exception.filter';
import { RequestIdInterceptor } from '../src/shared/logging/request-id.interceptor';
import { createGlobalValidationPipe } from '../src/shared/validation/validation.pipe';
import { AppConfigModule } from '../src/shared/config/config.module';
import { LoggingModule } from '../src/shared/logging/logging.module';
import { SubscriptionPaymentsController } from '../src/presentation/http/subscription-payments/subscription-payments.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { ACADEMY_REPOSITORY } from '../src/domain/academy/ports/academy.repository';
import { SUBSCRIPTION_REPOSITORY } from '../src/domain/subscription/ports/subscription.repository';
import { SUBSCRIPTION_PAYMENT_REPOSITORY } from '../src/domain/subscription-payments/ports/subscription-payment.repository';
import { CASHFREE_GATEWAY } from '../src/domain/subscription-payments/ports/cashfree-gateway.port';
import type { CashfreeGatewayPort } from '../src/domain/subscription-payments/ports/cashfree-gateway.port';
import type { SubscriptionPaymentRepository } from '../src/domain/subscription-payments/ports/subscription-payment.repository';
import { ACTIVE_STUDENT_COUNTER } from '../src/application/subscription/ports/active-student-counter.port';
import { CLOCK_PORT } from '../src/application/common/clock.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { LOGGER_PORT } from '../src/shared/logging/logger.port';
import { InitiateSubscriptionPaymentUseCase } from '../src/application/subscription-payments/use-cases/initiate-subscription-payment.usecase';
import { HandleCashfreeWebhookUseCase } from '../src/application/subscription-payments/use-cases/handle-cashfree-webhook.usecase';
import { GetSubscriptionPaymentStatusUseCase } from '../src/application/subscription-payments/use-cases/get-subscription-payment-status.usecase';
import { CashfreeSignatureVerifier } from '../src/infrastructure/payments/cashfree/cashfree.signature';
import { SubscriptionPayment } from '../src/domain/subscription-payments/entities/subscription-payment.entity';
import { Subscription } from '../src/domain/subscription/entities/subscription.entity';
import { User } from '../src/domain/identity/entities/user.entity';
import { Academy } from '../src/domain/academy/entities/academy.entity';
import {
  InMemoryUserRepository,
  InMemoryAcademyRepository,
  InMemorySubscriptionRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { AUDIT_RECORDER_PORT } from '../src/application/audit/ports/audit-recorder.port';
import type { AuditRecorderPort } from '../src/application/audit/ports/audit-recorder.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

const WEBHOOK_SECRET = 'test-webhook-secret-for-e2e';
const WEBHOOK_SIGNATURE_VERIFIER = Symbol('WEBHOOK_SIGNATURE_VERIFIER');
const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- In-memory payment repo ---------- */

class InMemorySubscriptionPaymentRepository implements SubscriptionPaymentRepository {
  private payments: Map<string, SubscriptionPayment> = new Map();

  async save(payment: SubscriptionPayment): Promise<void> {
    this.payments.set(payment.id.toString(), payment);
  }

  async saveWithStatusPrecondition(
    payment: SubscriptionPayment,
    expectedStatus: string,
  ): Promise<boolean> {
    const existing = this.payments.get(payment.id.toString());
    if (!existing || existing.status !== expectedStatus) return false;
    this.payments.set(payment.id.toString(), payment);
    return true;
  }

  async findByOrderId(orderId: string): Promise<SubscriptionPayment | null> {
    for (const p of this.payments.values()) {
      if (p.orderId === orderId) return p;
    }
    return null;
  }

  async findPendingByAcademyId(academyId: string): Promise<SubscriptionPayment | null> {
    for (const p of this.payments.values()) {
      if (p.academyId === academyId && p.status === 'PENDING') return p;
    }
    return null;
  }

  clear(): void {
    this.payments.clear();
  }
}

/* ---------- Helpers ---------- */

function signPayload(rawBody: string, timestamp: string): string {
  return createHmac('sha256', WEBHOOK_SECRET)
    .update(timestamp + rawBody)
    .digest('base64');
}

function seedOwnerUser(
  userRepo: InMemoryUserRepository,
  opts: { userId?: string; academyId?: string } = {},
): void {
  const userId = opts.userId ?? 'owner-1';
  const academyId = opts.academyId ?? 'academy-1';
  const user = User.create({
    id: userId,
    fullName: 'Test Owner',
    email: `${userId}@test.com`,
    phoneNumber: '+919876543210',
    role: 'OWNER',
    passwordHash: 'hashed',
  });
  userRepo.save(User.reconstitute(userId, { ...user['props'], academyId }));
}

function seedStaffUser(
  userRepo: InMemoryUserRepository,
  opts: { userId?: string; academyId?: string } = {},
): void {
  const userId = opts.userId ?? 'staff-1';
  const academyId = opts.academyId ?? 'academy-1';
  const user = User.create({
    id: userId,
    fullName: 'Test Staff',
    email: `${userId}@test.com`,
    phoneNumber: '+919876543211',
    role: 'STAFF',
    passwordHash: 'hashed',
  });
  userRepo.save(User.reconstitute(userId, { ...user['props'], academyId }));
}

function seedAcademy(
  academyRepo: InMemoryAcademyRepository,
  opts: { academyId?: string; ownerUserId?: string; loginDisabled?: boolean } = {},
): void {
  const academyId = opts.academyId ?? 'academy-1';
  const ownerUserId = opts.ownerUserId ?? 'owner-1';
  const academy = Academy.create({
    id: academyId,
    ownerUserId,
    academyName: 'Test Academy',
    address: { line1: '1 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
  });
  if (opts.loginDisabled) {
    academyRepo.save(academy.setLoginDisabled(true));
  } else {
    academyRepo.save(academy);
  }
}

function seedTrialSubscription(
  subscriptionRepo: InMemorySubscriptionRepository,
  opts: { id?: string; academyId?: string; trialDays?: number; now?: Date } = {},
): void {
  const id = opts.id ?? 'sub-1';
  const academyId = opts.academyId ?? 'academy-1';
  const now = opts.now ?? new Date();
  const trialDays = opts.trialDays ?? 30;
  const sub = Subscription.createTrial({
    id,
    academyId,
    trialStartAt: new Date(now.getTime() - 15 * DAY_MS),
    trialEndAt: new Date(now.getTime() + trialDays * DAY_MS),
  });
  subscriptionRepo.save(sub);
}

/* ---------- Test suite ---------- */

describe('Subscription Payments — Full Flow (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let academyRepo: InMemoryAcademyRepository;
  let subscriptionRepo: InMemorySubscriptionRepository;
  let paymentRepo: InMemorySubscriptionPaymentRepository;
  let jwtService: JwtService;
  let mockGateway: jest.Mocked<CashfreeGatewayPort>;
  let mockStudentCounter: { countActiveStudents: jest.Mock };
  let clockNow: Date;

  function makeToken(userId = 'owner-1', role = 'OWNER', academyId = 'academy-1'): string {
    return jwtService.sign(
      { sub: userId, role, email: `${userId}@test.com`, tokenVersion: 0 },
      { secret: 'test-access-secret', expiresIn: 900 },
    );
  }

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '3001';
    process.env['TZ'] = 'Asia/Kolkata';
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret';
    process.env['BCRYPT_COST'] = '4';

    userRepo = new InMemoryUserRepository();
    academyRepo = new InMemoryAcademyRepository();
    subscriptionRepo = new InMemorySubscriptionRepository();
    paymentRepo = new InMemorySubscriptionPaymentRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    clockNow = new Date('2025-06-15T10:00:00.000Z');
    const clock = { now: () => clockNow };

    mockGateway = {
      createOrder: jest.fn().mockResolvedValue({
        cfOrderId: 'cf_order_123',
        paymentSessionId: 'session_abc',
        orderExpiryTime: '2025-06-15T10:30:00.000Z',
      }),
      getOrder: jest.fn(),
    };

    mockStudentCounter = {
      countActiveStudents: jest.fn().mockResolvedValue(30),
    };

    const mockAuditRecorder: AuditRecorderPort = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [SubscriptionPaymentsController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: ACADEMY_REPOSITORY, useValue: academyRepo },
        { provide: SUBSCRIPTION_REPOSITORY, useValue: subscriptionRepo },
        { provide: SUBSCRIPTION_PAYMENT_REPOSITORY, useValue: paymentRepo },
        { provide: CASHFREE_GATEWAY, useValue: mockGateway },
        { provide: ACTIVE_STUDENT_COUNTER, useValue: mockStudentCounter },
        { provide: CLOCK_PORT, useValue: clock },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        { provide: AUDIT_RECORDER_PORT, useValue: mockAuditRecorder },
        {
          provide: WEBHOOK_SIGNATURE_VERIFIER,
          useValue: new CashfreeSignatureVerifier(WEBHOOK_SECRET),
        },
        {
          provide: 'INITIATE_SUBSCRIPTION_PAYMENT_USE_CASE',
          useFactory: (ur: any, ar: any, sr: any, pr: any, gw: any, sc: any, c: any, l: any, audit: any) =>
            new InitiateSubscriptionPaymentUseCase(ur, ar, sr, pr, gw, sc, c, l, audit),
          inject: [
            USER_REPOSITORY, ACADEMY_REPOSITORY, SUBSCRIPTION_REPOSITORY,
            SUBSCRIPTION_PAYMENT_REPOSITORY, CASHFREE_GATEWAY, ACTIVE_STUDENT_COUNTER,
            CLOCK_PORT, LOGGER_PORT, AUDIT_RECORDER_PORT,
          ],
        },
        {
          provide: 'HANDLE_CASHFREE_WEBHOOK_USE_CASE',
          useFactory: (pr: any, sr: any, sv: any, c: any, l: any, audit: any) =>
            new HandleCashfreeWebhookUseCase(pr, sr, sv, c, l, audit),
          inject: [
            SUBSCRIPTION_PAYMENT_REPOSITORY, SUBSCRIPTION_REPOSITORY,
            WEBHOOK_SIGNATURE_VERIFIER, CLOCK_PORT, LOGGER_PORT, AUDIT_RECORDER_PORT,
          ],
        },
        {
          provide: 'GET_SUBSCRIPTION_PAYMENT_STATUS_USE_CASE',
          useFactory: (ur: any, ar: any, sr: any, pr: any, c: any) =>
            new GetSubscriptionPaymentStatusUseCase(ur, ar, sr, pr, c),
          inject: [
            USER_REPOSITORY, ACADEMY_REPOSITORY, SUBSCRIPTION_REPOSITORY,
            SUBSCRIPTION_PAYMENT_REPOSITORY, CLOCK_PORT,
          ],
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
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
    paymentRepo.clear();
    jest.clearAllMocks();
    clockNow = new Date('2025-06-15T10:00:00.000Z');
  });

  /* -------------------------------------------------- */
  /*  Initiation                                        */
  /* -------------------------------------------------- */

  it('Owner initiates payment → returns orderId + paymentSessionId', async () => {
    seedOwnerUser(userRepo);
    seedAcademy(academyRepo);
    seedTrialSubscription(subscriptionRepo, { now: clockNow });

    const token = makeToken();

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.paymentSessionId).toBe('session_abc');
    expect(res.body.data.orderId).toMatch(/^pc_sub_/);
    expect(res.body.data.amountInr).toBe(299);
    expect(res.body.data.tierKey).toBe('TIER_0_50');
    expect(res.body.data.currency).toBe('INR');
    expect(mockGateway.createOrder).toHaveBeenCalledTimes(1);
  });

  it('Non-owner cannot initiate payment (403)', async () => {
    seedStaffUser(userRepo);
    seedAcademy(academyRepo);
    seedTrialSubscription(subscriptionRepo, { now: clockNow });

    const token = makeToken('staff-1', 'STAFF');

    await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('Disabled academy cannot initiate payment (403)', async () => {
    seedOwnerUser(userRepo);
    seedAcademy(academyRepo, { loginDisabled: true });
    seedTrialSubscription(subscriptionRepo, { now: clockNow });

    const token = makeToken();

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(res.body.statusCode).toBe(403);
  });

  it('Concurrent initiation returns conflict (409)', async () => {
    seedOwnerUser(userRepo);
    seedAcademy(academyRepo);
    seedTrialSubscription(subscriptionRepo, { now: clockNow });

    // Pre-seed a recent PENDING payment
    const existingPayment = SubscriptionPayment.create({
      id: 'pay-existing',
      academyId: 'academy-1',
      ownerUserId: 'owner-1',
      orderId: 'pc_sub_existing',
      paymentSessionId: 'session_old',
      tierKey: 'TIER_0_50',
      amountInr: 299,
      activeStudentCountAtPurchase: 30,
    });
    await paymentRepo.save(existingPayment);

    const token = makeToken();

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(res.body.statusCode).toBe(409);
  });

  it('Stale PENDING payment is auto-expired and new payment proceeds', async () => {
    seedOwnerUser(userRepo);
    seedAcademy(academyRepo);
    seedTrialSubscription(subscriptionRepo, { now: clockNow });

    // Pre-seed a stale PENDING payment (created > 30 mins ago)
    const staleTime = new Date(clockNow.getTime() - 31 * 60 * 1000);
    const stalePayment = SubscriptionPayment.create({
      id: 'pay-stale',
      academyId: 'academy-1',
      ownerUserId: 'owner-1',
      orderId: 'pc_sub_stale',
      paymentSessionId: 'session_stale',
      tierKey: 'TIER_0_50',
      amountInr: 299,
      activeStudentCountAtPurchase: 30,
    });
    const staleReconstituted = SubscriptionPayment.reconstitute('pay-stale', {
      ...(stalePayment as any).props,
      audit: { createdAt: staleTime, updatedAt: staleTime, version: 1 },
    });
    await paymentRepo.save(staleReconstituted);

    const token = makeToken();

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.paymentSessionId).toBe('session_abc');

    // Verify stale payment was marked FAILED
    const staleResult = await paymentRepo.findByOrderId('pc_sub_stale');
    expect(staleResult?.status).toBe('FAILED');
    expect(staleResult?.failureReason).toBe('EXPIRED_STALE');
  });

  /* -------------------------------------------------- */
  /*  Payment Status                                     */
  /* -------------------------------------------------- */

  it('Payment status returns correct data after initiation', async () => {
    seedOwnerUser(userRepo);
    seedAcademy(academyRepo);
    seedTrialSubscription(subscriptionRepo, { now: clockNow });

    const token = makeToken();

    const initRes = await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const orderId = initRes.body.data.orderId;

    const statusRes = await request(app.getHttpServer())
      .get(`/api/v1/subscription-payments/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(statusRes.body.success).toBe(true);
    expect(statusRes.body.data.orderId).toBe(orderId);
    expect(statusRes.body.data.status).toBe('PENDING');
    expect(statusRes.body.data.tierKey).toBe('TIER_0_50');
    expect(statusRes.body.data.amountInr).toBe(299);
  });

  it('Payment status for unknown orderId returns 404', async () => {
    seedOwnerUser(userRepo);
    seedAcademy(academyRepo);

    const token = makeToken();

    await request(app.getHttpServer())
      .get('/api/v1/subscription-payments/nonexistent_order/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  /* -------------------------------------------------- */
  /*  Webhook — SUCCESS                                  */
  /* -------------------------------------------------- */

  it('SUCCESS webhook activates subscription with correct tier and dates', async () => {
    const payment = SubscriptionPayment.create({
      id: 'pay-success',
      academyId: 'academy-1',
      ownerUserId: 'owner-1',
      orderId: 'pc_sub_success_order',
      paymentSessionId: 'session_test',
      tierKey: 'TIER_0_50',
      amountInr: 299,
      activeStudentCountAtPurchase: 30,
    });
    await paymentRepo.save(payment);

    const sub = Subscription.createTrial({
      id: 'sub-1',
      academyId: 'academy-1',
      trialStartAt: new Date(clockNow.getTime() - 15 * DAY_MS),
      trialEndAt: new Date(clockNow.getTime() + 15 * DAY_MS),
    });
    await subscriptionRepo.save(sub);

    const body = JSON.stringify({
      data: {
        order: { order_id: 'pc_sub_success_order', order_amount: 299 },
        payment: { payment_status: 'SUCCESS', cf_payment_id: 'cf_pay_abc' },
      },
    });
    const timestamp = String(Date.now());
    const signature = signPayload(body, timestamp);

    const res = await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/cashfree/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    expect(res.body.success).toBe(true);

    // Verify payment was updated
    const updatedPayment = await paymentRepo.findByOrderId('pc_sub_success_order');
    expect(updatedPayment?.status).toBe('SUCCESS');
    expect(updatedPayment?.providerPaymentId).toBe('cf_pay_abc');

    // Verify subscription was activated
    const updatedSub = await subscriptionRepo.findByAcademyId('academy-1');
    expect(updatedSub?.tierKey).toBe('TIER_0_50');
    expect(updatedSub?.paidStartAt).not.toBeNull();
    expect(updatedSub?.paidEndAt).not.toBeNull();
    expect(updatedSub?.paymentReference).toContain('pc_sub_success_order');
  });

  /* -------------------------------------------------- */
  /*  Webhook — FAILED                                   */
  /* -------------------------------------------------- */

  it('FAILED webhook marks payment as failed, subscription unchanged', async () => {
    const payment = SubscriptionPayment.create({
      id: 'pay-fail',
      academyId: 'academy-1',
      ownerUserId: 'owner-1',
      orderId: 'pc_sub_fail_order',
      paymentSessionId: 'session_fail',
      tierKey: 'TIER_0_50',
      amountInr: 299,
      activeStudentCountAtPurchase: 30,
    });
    await paymentRepo.save(payment);

    const sub = Subscription.createTrial({
      id: 'sub-1',
      academyId: 'academy-1',
      trialStartAt: new Date(clockNow.getTime() - 15 * DAY_MS),
      trialEndAt: new Date(clockNow.getTime() + 15 * DAY_MS),
    });
    await subscriptionRepo.save(sub);

    const body = JSON.stringify({
      data: {
        order: { order_id: 'pc_sub_fail_order' },
        payment: { payment_status: 'FAILED', cf_payment_id: 'cf_pay_fail' },
      },
    });
    const timestamp = String(Date.now());
    const signature = signPayload(body, timestamp);

    await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/cashfree/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    const updatedPayment = await paymentRepo.findByOrderId('pc_sub_fail_order');
    expect(updatedPayment?.status).toBe('FAILED');
    expect(updatedPayment?.failureReason).toBe('FAILED');

    // Subscription should remain in trial
    const updatedSub = await subscriptionRepo.findByAcademyId('academy-1');
    expect(updatedSub?.tierKey).toBeNull();
    expect(updatedSub?.paidStartAt).toBeNull();
    expect(updatedSub?.paidEndAt).toBeNull();
  });

  /* -------------------------------------------------- */
  /*  Webhook — USER_DROPPED                             */
  /* -------------------------------------------------- */

  it('USER_DROPPED webhook marks payment as failed', async () => {
    const payment = SubscriptionPayment.create({
      id: 'pay-dropped',
      academyId: 'academy-1',
      ownerUserId: 'owner-1',
      orderId: 'pc_sub_dropped_order',
      paymentSessionId: 'session_drop',
      tierKey: 'TIER_0_50',
      amountInr: 299,
      activeStudentCountAtPurchase: 30,
    });
    await paymentRepo.save(payment);

    const body = JSON.stringify({
      data: {
        order: { order_id: 'pc_sub_dropped_order' },
        payment: { payment_status: 'USER_DROPPED' },
      },
    });
    const timestamp = String(Date.now());
    const signature = signPayload(body, timestamp);

    await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/cashfree/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    const updatedPayment = await paymentRepo.findByOrderId('pc_sub_dropped_order');
    expect(updatedPayment?.status).toBe('FAILED');
    expect(updatedPayment?.failureReason).toBe('USER_DROPPED');
  });

  /* -------------------------------------------------- */
  /*  Early Renewal                                      */
  /* -------------------------------------------------- */

  it('Early renewal extends subscription (paidEndAt extended, not overwritten)', async () => {
    const payment = SubscriptionPayment.create({
      id: 'pay-renew',
      academyId: 'academy-1',
      ownerUserId: 'owner-1',
      orderId: 'pc_sub_renew_order',
      paymentSessionId: 'session_renew',
      tierKey: 'TIER_51_100',
      amountInr: 499,
      activeStudentCountAtPurchase: 75,
    });
    await paymentRepo.save(payment);

    // Subscription has an active paid period ending 10 days from now
    const existingPaidEndAt = new Date(clockNow.getTime() + 10 * DAY_MS);
    const existingPaidStartAt = new Date(clockNow.getTime() - 20 * DAY_MS);
    const sub = Subscription.reconstitute('sub-1', {
      academyId: 'academy-1',
      trialStartAt: new Date(clockNow.getTime() - 45 * DAY_MS),
      trialEndAt: new Date(clockNow.getTime() - 15 * DAY_MS),
      paidStartAt: existingPaidStartAt,
      paidEndAt: existingPaidEndAt,
      tierKey: 'TIER_0_50',
      pendingTierKey: null,
      pendingTierEffectiveAt: null,
      activeStudentCountSnapshot: 30,
      manualNotes: null,
      paymentReference: 'old_order/old_cf',
      audit: { createdAt: new Date(), updatedAt: new Date(), version: 1 },
    });
    await subscriptionRepo.save(sub);

    const body = JSON.stringify({
      data: {
        order: { order_id: 'pc_sub_renew_order', order_amount: 499 },
        payment: { payment_status: 'SUCCESS', cf_payment_id: 'cf_pay_renew' },
      },
    });
    const timestamp = String(Date.now());
    const signature = signPayload(body, timestamp);

    await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/cashfree/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    const updatedSub = await subscriptionRepo.findByAcademyId('academy-1');
    expect(updatedSub?.tierKey).toBe('TIER_51_100');
    // paidEndAt should be extended beyond the original end date
    expect(updatedSub!.paidEndAt!.getTime()).toBeGreaterThan(existingPaidEndAt.getTime());
    // paidStartAt should be computed from day after old paidEndAt
    expect(updatedSub!.paidStartAt!.getTime()).toBeGreaterThanOrEqual(existingPaidEndAt.getTime());
  });

  /* -------------------------------------------------- */
  /*  Tier Pricing                                       */
  /* -------------------------------------------------- */

  it('Tier pricing is correct (TIER_0_50=299, TIER_51_100=499, TIER_101_PLUS=699)', async () => {
    seedOwnerUser(userRepo);
    seedAcademy(academyRepo);
    seedTrialSubscription(subscriptionRepo, { now: clockNow });

    const token = makeToken();

    // TIER_0_50 (30 students)
    mockStudentCounter.countActiveStudents.mockResolvedValueOnce(30);
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res1.body.data.amountInr).toBe(299);
    expect(res1.body.data.tierKey).toBe('TIER_0_50');

    paymentRepo.clear();

    // TIER_51_100 (75 students)
    mockStudentCounter.countActiveStudents.mockResolvedValueOnce(75);
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res2.body.data.amountInr).toBe(499);
    expect(res2.body.data.tierKey).toBe('TIER_51_100');

    paymentRepo.clear();

    // TIER_101_PLUS (150 students)
    mockStudentCounter.countActiveStudents.mockResolvedValueOnce(150);
    const res3 = await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res3.body.data.amountInr).toBe(699);
    expect(res3.body.data.tierKey).toBe('TIER_101_PLUS');
  });
});
