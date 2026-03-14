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
import {
  InMemoryUserRepository,
  InMemoryAcademyRepository,
  InMemorySubscriptionRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { AUDIT_RECORDER_PORT } from '../src/application/audit/ports/audit-recorder.port';
import type { AuditRecorderPort } from '../src/application/audit/ports/audit-recorder.port';
import { TRANSACTION_PORT } from '../src/application/common/transaction.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

const WEBHOOK_SECRET = 'test-webhook-secret-for-e2e';
const WEBHOOK_SIGNATURE_VERIFIER = Symbol('WEBHOOK_SIGNATURE_VERIFIER');
const DAY_MS = 24 * 60 * 60 * 1000;

class InMemoryPaymentRepo {
  private payments: Map<string, SubscriptionPayment> = new Map();

  async save(payment: SubscriptionPayment): Promise<void> {
    this.payments.set(payment.id.toString(), payment);
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

  async saveWithStatusPrecondition(payment: SubscriptionPayment, expectedStatus: string): Promise<boolean> {
    const existing = this.payments.get(payment.id.toString());
    if (!existing || existing.status !== expectedStatus) return false;
    this.payments.set(payment.id.toString(), payment);
    return true;
  }

  clear(): void {
    this.payments.clear();
  }
}

function signPayload(rawBody: string, timestamp: string): string {
  return createHmac('sha256', WEBHOOK_SECRET)
    .update(timestamp + rawBody)
    .digest('base64');
}

describe('Subscription Payments — Webhook Security (e2e)', () => {
  let app: INestApplication;
  let paymentRepo: InMemoryPaymentRepo;
  let subscriptionRepo: InMemorySubscriptionRepository;

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '3001';
    process.env['TZ'] = 'Asia/Kolkata';
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-that-is-at-least-32-characters-long';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-that-is-at-least-32-characters-long';
    process.env['BCRYPT_COST'] = '4';

    const userRepo = new InMemoryUserRepository();
    const academyRepo = new InMemoryAcademyRepository();
    subscriptionRepo = new InMemorySubscriptionRepository();
    paymentRepo = new InMemoryPaymentRepo();
    const jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const clock = { now: () => new Date() };

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
        { provide: CASHFREE_GATEWAY, useValue: { createOrder: jest.fn(), getOrder: jest.fn() } },
        { provide: ACTIVE_STUDENT_COUNTER, useValue: { countActiveStudents: jest.fn().mockResolvedValue(0) } },
        { provide: CLOCK_PORT, useValue: clock },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        { provide: AUDIT_RECORDER_PORT, useValue: mockAuditRecorder },
        { provide: TRANSACTION_PORT, useValue: { run: (fn: () => Promise<void>) => fn() } },
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
          useFactory: (pr: any, sr: any, sv: any, c: any, l: any, audit: any, tx: any) =>
            new HandleCashfreeWebhookUseCase(pr, sr, sv, c, l, audit, tx),
          inject: [
            SUBSCRIPTION_PAYMENT_REPOSITORY, SUBSCRIPTION_REPOSITORY,
            WEBHOOK_SIGNATURE_VERIFIER, CLOCK_PORT, LOGGER_PORT, AUDIT_RECORDER_PORT, TRANSACTION_PORT,
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
    paymentRepo.clear();
    subscriptionRepo.clear();
  });

  it('rejects webhook with missing signature headers', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/cashfree/webhook')
      .send({ data: {} })
      .expect(400);
  });

  it('rejects webhook with invalid signature', async () => {
    const body = JSON.stringify({ data: { order: { order_id: 'test' }, payment: { payment_status: 'SUCCESS' } } });
    const timestamp = String(Date.now());

    await request(app.getHttpServer())
      .post('/api/v1/subscription-payments/cashfree/webhook')
      .set('x-webhook-signature', 'invalid-signature')
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(401);
  });

  it('accepts webhook with valid signature and activates subscription', async () => {
    // Seed payment + subscription
    const payment = SubscriptionPayment.create({
      id: 'pay-1',
      academyId: 'academy-1',
      ownerUserId: 'user-1',
      orderId: 'pc_sub_test_order',
      paymentSessionId: 'session_test',
      tierKey: 'TIER_0_50',
      amountInr: 299,
      activeStudentCountAtPurchase: 30,
    });
    await paymentRepo.save(payment);

    const sub = Subscription.createTrial({
      id: 'sub-1',
      academyId: 'academy-1',
      trialStartAt: new Date(Date.now() - 15 * DAY_MS),
      trialEndAt: new Date(Date.now() + 15 * DAY_MS),
    });
    await subscriptionRepo.save(sub);

    const body = JSON.stringify({
      data: {
        order: { order_id: 'pc_sub_test_order', order_amount: 299 },
        payment: { payment_status: 'SUCCESS', cf_payment_id: 'cf_pay_123' },
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
    const updatedPayment = await paymentRepo.findByOrderId('pc_sub_test_order');
    expect(updatedPayment?.status).toBe('SUCCESS');

    // Verify subscription was activated
    const updatedSub = await subscriptionRepo.findByAcademyId('academy-1');
    expect(updatedSub?.tierKey).toBe('TIER_0_50');
    expect(updatedSub?.paidStartAt).not.toBeNull();
    expect(updatedSub?.paidEndAt).not.toBeNull();
  });

  it('replay webhook does not double-activate', async () => {
    // Seed payment already SUCCESS
    const payment = SubscriptionPayment.create({
      id: 'pay-2',
      academyId: 'academy-2',
      ownerUserId: 'user-2',
      orderId: 'pc_sub_replay_order',
      paymentSessionId: 'session_test2',
      tierKey: 'TIER_0_50',
      amountInr: 299,
      activeStudentCountAtPurchase: 30,
    }).markSuccess('cf_pay_old', new Date());
    await paymentRepo.save(payment);

    const body = JSON.stringify({
      data: {
        order: { order_id: 'pc_sub_replay_order' },
        payment: { payment_status: 'SUCCESS', cf_payment_id: 'cf_pay_new' },
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

    // Payment should still have old provider ID (not overwritten)
    const savedPayment = await paymentRepo.findByOrderId('pc_sub_replay_order');
    expect(savedPayment?.providerPaymentId).toBe('cf_pay_old');
  });
});
