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
import { ParentController } from '../src/presentation/http/parent/parent.controller';
import { FeePaymentWebhookController } from '../src/presentation/http/parent/fee-payment-webhook.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { ACADEMY_REPOSITORY } from '../src/domain/academy/ports/academy.repository';
import { CASHFREE_GATEWAY } from '../src/domain/subscription-payments/ports/cashfree-gateway.port';
import type { CashfreeGatewayPort } from '../src/domain/subscription-payments/ports/cashfree-gateway.port';
import { CLOCK_PORT } from '../src/application/common/clock.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { LOGGER_PORT } from '../src/shared/logging/logger.port';
import { FEE_DUE_REPOSITORY } from '../src/domain/fee/ports/fee-due.repository';
import { TRANSACTION_LOG_REPOSITORY } from '../src/domain/fee/ports/transaction-log.repository';
import { FEE_PAYMENT_REPOSITORY } from '../src/domain/parent/ports/fee-payment.repository';
import { PARENT_STUDENT_LINK_REPOSITORY } from '../src/domain/parent/ports/parent-student-link.repository';
import { InitiateFeePaymentUseCase } from '../src/application/parent/use-cases/initiate-fee-payment.usecase';
import { HandleFeePaymentWebhookUseCase } from '../src/application/parent/use-cases/handle-fee-payment-webhook.usecase';
import { GetFeePaymentStatusUseCase } from '../src/application/parent/use-cases/get-fee-payment-status.usecase';
import { CashfreeSignatureVerifier } from '../src/infrastructure/payments/cashfree/cashfree.signature';
import { FeePayment } from '../src/domain/parent/entities/fee-payment.entity';
import { FeeDue } from '../src/domain/fee/entities/fee-due.entity';
import { ParentStudentLink } from '../src/domain/parent/entities/parent-student-link.entity';
import { TransactionLog } from '../src/domain/fee/entities/transaction-log.entity';
import { User } from '../src/domain/identity/entities/user.entity';
import { Academy } from '../src/domain/academy/entities/academy.entity';
import type { FeePaymentRepository } from '../src/domain/parent/ports/fee-payment.repository';
import type { ParentStudentLinkRepository } from '../src/domain/parent/ports/parent-student-link.repository';
import type { FeeDueRepository } from '../src/domain/fee/ports/fee-due.repository';
import type { TransactionLogRepository } from '../src/domain/fee/ports/transaction-log.repository';
import type { TransactionPort } from '../src/application/common/transaction.port';
import {
  InMemoryUserRepository,
  InMemoryAcademyRepository,
  InMemoryFeeDueRepository,
  InMemoryTransactionLogRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { AUDIT_RECORDER_PORT } from '../src/application/audit/ports/audit-recorder.port';
import type { AuditRecorderPort } from '../src/application/audit/ports/audit-recorder.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

const WEBHOOK_SECRET = 'test-fee-webhook-secret';
const FEE_WEBHOOK_SIGNATURE_VERIFIER = Symbol('FEE_WEBHOOK_SIGNATURE_VERIFIER');

/* ---------- In-memory fee payment repo ---------- */

class InMemoryFeePaymentRepository implements FeePaymentRepository {
  private payments: Map<string, FeePayment> = new Map();

  async save(payment: FeePayment): Promise<void> {
    this.payments.set(payment.id.toString(), payment);
  }

  async findByOrderId(orderId: string): Promise<FeePayment | null> {
    for (const p of this.payments.values()) {
      if (p.orderId === orderId) return p;
    }
    return null;
  }

  async findPendingByFeeDueId(feeDueId: string): Promise<FeePayment | null> {
    for (const p of this.payments.values()) {
      if (p.feeDueId === feeDueId && p.status === 'PENDING') return p;
    }
    return null;
  }

  async findByParentAndAcademy(parentUserId: string, academyId: string): Promise<FeePayment[]> {
    const results: FeePayment[] = [];
    for (const p of this.payments.values()) {
      if (p.parentUserId === parentUserId && p.academyId === academyId) results.push(p);
    }
    return results;
  }

  async saveWithStatusPrecondition(payment: FeePayment, expectedStatus: string): Promise<boolean> {
    const existing = this.payments.get(payment.id.toString());
    if (!existing || existing.status !== expectedStatus) return false;
    this.payments.set(payment.id.toString(), payment);
    return true;
  }

  clear(): void {
    this.payments.clear();
  }
}

/* ---------- In-memory parent-student link repo ---------- */

class InMemoryParentStudentLinkRepository implements ParentStudentLinkRepository {
  private links: Map<string, ParentStudentLink> = new Map();

  async save(link: ParentStudentLink): Promise<void> {
    this.links.set(link.id.toString(), link);
  }

  async findByParentAndStudent(parentUserId: string, studentId: string): Promise<ParentStudentLink | null> {
    for (const l of this.links.values()) {
      if (l.parentUserId === parentUserId && l.studentId === studentId) return l;
    }
    return null;
  }

  async findByParentUserId(parentUserId: string): Promise<ParentStudentLink[]> {
    const results: ParentStudentLink[] = [];
    for (const l of this.links.values()) {
      if (l.parentUserId === parentUserId) results.push(l);
    }
    return results;
  }

  async findByStudentId(studentId: string): Promise<ParentStudentLink[]> {
    const results: ParentStudentLink[] = [];
    for (const l of this.links.values()) {
      if (l.studentId === studentId) results.push(l);
    }
    return results;
  }

  async findByAcademyId(academyId: string): Promise<ParentStudentLink[]> {
    const results: ParentStudentLink[] = [];
    for (const l of this.links.values()) {
      if (l.academyId === academyId) results.push(l);
    }
    return results;
  }

  async deleteByParentAndStudent(parentUserId: string, studentId: string): Promise<void> {
    for (const [key, l] of this.links.entries()) {
      if (l.parentUserId === parentUserId && l.studentId === studentId) {
        this.links.delete(key);
        break;
      }
    }
  }

  clear(): void {
    this.links.clear();
  }
}

/* ---------- Passthrough transaction port ---------- */

const passthroughTransaction: TransactionPort = {
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  },
};

/* ---------- Helpers ---------- */

function signPayload(rawBody: string, timestamp: string): string {
  return createHmac('sha256', WEBHOOK_SECRET)
    .update(timestamp + rawBody)
    .digest('base64');
}

function seedParentUser(
  userRepo: InMemoryUserRepository,
  opts: { userId?: string; academyId?: string } = {},
): void {
  const userId = opts.userId ?? 'parent-1';
  const academyId = opts.academyId ?? 'academy-1';
  const user = User.create({
    id: userId,
    fullName: 'Test Parent',
    email: `${userId}@test.com`,
    phoneNumber: '+919876543210',
    role: 'PARENT',
    passwordHash: 'hashed',
  });
  userRepo.save(User.reconstitute(userId, { ...user['props'], academyId }));
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
    phoneNumber: '+919876543211',
    role: 'OWNER',
    passwordHash: 'hashed',
  });
  userRepo.save(User.reconstitute(userId, { ...user['props'], academyId }));
}

function seedAcademy(academyRepo: InMemoryAcademyRepository): void {
  const academy = Academy.create({
    id: 'academy-1',
    ownerUserId: 'owner-1',
    academyName: 'Test Academy',
    address: { line1: '1 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
  });
  academyRepo.save(academy);
}

function seedLink(linkRepo: InMemoryParentStudentLinkRepository, opts: {
  id?: string;
  parentUserId?: string;
  studentId?: string;
  academyId?: string;
} = {}): void {
  const link = ParentStudentLink.create({
    id: opts.id ?? 'link-1',
    parentUserId: opts.parentUserId ?? 'parent-1',
    studentId: opts.studentId ?? 'student-1',
    academyId: opts.academyId ?? 'academy-1',
  });
  linkRepo.save(link);
}

function seedFeeDue(feeDueRepo: InMemoryFeeDueRepository, opts: {
  id?: string;
  academyId?: string;
  studentId?: string;
  monthKey?: string;
  amount?: number;
  status?: 'DUE' | 'PAID' | 'UPCOMING';
} = {}): void {
  const id = opts.id ?? 'fee-1';
  const due = FeeDue.create({
    id,
    academyId: opts.academyId ?? 'academy-1',
    studentId: opts.studentId ?? 'student-1',
    monthKey: opts.monthKey ?? '2025-06',
    dueDate: '2025-06-05',
    amount: opts.amount ?? 500,
  });
  // Default create gives UPCOMING status; flip to DUE for tests
  const asDue = due.flipToDue();
  if (opts.status === 'PAID') {
    feeDueRepo.save(asDue.markPaid('owner-1', new Date()));
  } else {
    feeDueRepo.save(asDue);
  }
}

/* ---------- Test suite ---------- */

describe('Fee Payments — Parent Flow (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let academyRepo: InMemoryAcademyRepository;
  let feeDueRepo: InMemoryFeeDueRepository;
  let feePaymentRepo: InMemoryFeePaymentRepository;
  let linkRepo: InMemoryParentStudentLinkRepository;
  let transactionLogRepo: InMemoryTransactionLogRepository;
  let jwtService: JwtService;
  let mockGateway: jest.Mocked<CashfreeGatewayPort>;
  let clockNow: Date;

  // Stub use cases that ParentController depends on but we don't test here
  const stubUseCase = { execute: jest.fn().mockResolvedValue({ ok: true, value: [] }) };

  function makeToken(userId = 'parent-1', role = 'PARENT'): string {
    return jwtService.sign(
      { sub: userId, role, email: `${userId}@test.com`, tokenVersion: 0 },
      { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
    );
  }

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '3001';
    process.env['TZ'] = 'Asia/Kolkata';
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-that-is-at-least-32-characters-long';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-that-is-at-least-32-characters-long';
    process.env['BCRYPT_COST'] = '4';

    userRepo = new InMemoryUserRepository();
    academyRepo = new InMemoryAcademyRepository();
    feeDueRepo = new InMemoryFeeDueRepository();
    feePaymentRepo = new InMemoryFeePaymentRepository();
    linkRepo = new InMemoryParentStudentLinkRepository();
    transactionLogRepo = new InMemoryTransactionLogRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    clockNow = new Date('2025-06-15T10:00:00.000Z');
    const clock = { now: () => clockNow };

    mockGateway = {
      createOrder: jest.fn().mockResolvedValue({
        cfOrderId: 'cf_fee_order_123',
        paymentSessionId: 'fee_session_abc',
        orderExpiryTime: '2025-06-15T10:30:00.000Z',
      }),
      getOrder: jest.fn(),
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
      controllers: [ParentController, FeePaymentWebhookController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: ACADEMY_REPOSITORY, useValue: academyRepo },
        { provide: FEE_DUE_REPOSITORY, useValue: feeDueRepo },
        { provide: FEE_PAYMENT_REPOSITORY, useValue: feePaymentRepo },
        { provide: PARENT_STUDENT_LINK_REPOSITORY, useValue: linkRepo },
        { provide: TRANSACTION_LOG_REPOSITORY, useValue: transactionLogRepo },
        { provide: CASHFREE_GATEWAY, useValue: mockGateway },
        { provide: CLOCK_PORT, useValue: clock },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        { provide: AUDIT_RECORDER_PORT, useValue: mockAuditRecorder },
        {
          provide: FEE_WEBHOOK_SIGNATURE_VERIFIER,
          useValue: new CashfreeSignatureVerifier(WEBHOOK_SECRET),
        },
        // Initiate fee payment use case
        {
          provide: 'INITIATE_FEE_PAYMENT_USE_CASE',
          useFactory: (ur: any, lr: any, fdr: any, fpr: any, ar: any, gw: any, c: any, l: any, audit: any) =>
            new InitiateFeePaymentUseCase(ur, lr, fdr, fpr, ar, gw, c, l, audit),
          inject: [
            USER_REPOSITORY, PARENT_STUDENT_LINK_REPOSITORY,
            FEE_DUE_REPOSITORY, FEE_PAYMENT_REPOSITORY,
            ACADEMY_REPOSITORY, CASHFREE_GATEWAY,
            CLOCK_PORT, LOGGER_PORT, AUDIT_RECORDER_PORT,
          ],
        },
        // Handle fee payment webhook use case
        {
          provide: 'HANDLE_FEE_PAYMENT_WEBHOOK_USE_CASE',
          useFactory: (fpr: any, fdr: any, tlr: any, ar: any, sv: any, c: any, tx: any, l: any, audit: any) =>
            new HandleFeePaymentWebhookUseCase(fpr, fdr, tlr, ar, sv, c, tx, l, audit),
          inject: [
            FEE_PAYMENT_REPOSITORY, FEE_DUE_REPOSITORY,
            TRANSACTION_LOG_REPOSITORY, ACADEMY_REPOSITORY,
            FEE_WEBHOOK_SIGNATURE_VERIFIER, CLOCK_PORT,
            'TRANSACTION_PORT', LOGGER_PORT, AUDIT_RECORDER_PORT,
          ],
        },
        // Get fee payment status use case
        {
          provide: 'GET_FEE_PAYMENT_STATUS_USE_CASE',
          useFactory: (fpr: any) => new GetFeePaymentStatusUseCase(fpr),
          inject: [FEE_PAYMENT_REPOSITORY],
        },
        // Passthrough transaction port
        { provide: 'TRANSACTION_PORT', useValue: passthroughTransaction },
        // Stub use cases that ParentController depends on but we are not testing
        { provide: 'GET_MY_CHILDREN_USE_CASE', useValue: stubUseCase },
        { provide: 'GET_CHILD_ATTENDANCE_USE_CASE', useValue: stubUseCase },
        { provide: 'GET_CHILD_FEES_USE_CASE', useValue: stubUseCase },
        { provide: 'GET_RECEIPT_USE_CASE', useValue: stubUseCase },
        { provide: 'UPDATE_PARENT_PROFILE_USE_CASE', useValue: stubUseCase },
        { provide: 'CHANGE_PASSWORD_USE_CASE', useValue: stubUseCase },
        { provide: 'GET_ACADEMY_INFO_USE_CASE', useValue: stubUseCase },
        { provide: 'GET_PAYMENT_HISTORY_USE_CASE', useValue: stubUseCase },
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
    feeDueRepo.clear();
    feePaymentRepo.clear();
    linkRepo.clear();
    transactionLogRepo.clear();
    jest.clearAllMocks();
    clockNow = new Date('2025-06-15T10:00:00.000Z');
  });

  /* -------------------------------------------------- */
  /*  Initiation                                        */
  /* -------------------------------------------------- */

  it('Parent initiates fee payment → returns orderId + paymentSessionId', async () => {
    seedParentUser(userRepo);
    seedAcademy(academyRepo);
    seedLink(linkRepo);
    seedFeeDue(feeDueRepo);

    const token = makeToken();

    const res = await request(app.getHttpServer())
      .post('/api/v1/parent/fee-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ feeDueId: 'fee-1' })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.paymentSessionId).toBe('fee_session_abc');
    expect(res.body.data.orderId).toBeDefined();
    expect(res.body.data.baseAmount).toBe(500);
    expect(res.body.data.convenienceFee).toBe(13);
    expect(res.body.data.totalAmount).toBe(513);
    expect(res.body.data.currency).toBe('INR');
    expect(mockGateway.createOrder).toHaveBeenCalledTimes(1);
  });

  it('Non-parent cannot pay (403)', async () => {
    seedOwnerUser(userRepo);
    seedAcademy(academyRepo);
    seedLink(linkRepo, { parentUserId: 'owner-1' });
    seedFeeDue(feeDueRepo);

    const token = makeToken('owner-1', 'OWNER');

    await request(app.getHttpServer())
      .post('/api/v1/parent/fee-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ feeDueId: 'fee-1' })
      .expect(403);
  });

  it('Parent cannot pay for unlinked student fee', async () => {
    seedParentUser(userRepo);
    seedAcademy(academyRepo);
    // Link to student-1, but fee is for student-2
    seedLink(linkRepo, { studentId: 'student-1' });
    seedFeeDue(feeDueRepo, { studentId: 'student-2' });

    const token = makeToken();

    const res = await request(app.getHttpServer())
      .post('/api/v1/parent/fee-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ feeDueId: 'fee-1' })
      .expect(404);

    expect(res.body.message).toBeDefined();
  });

  it('Already-paid fee cannot be paid again', async () => {
    seedParentUser(userRepo);
    seedAcademy(academyRepo);
    seedLink(linkRepo);
    seedFeeDue(feeDueRepo, { status: 'PAID' });

    const token = makeToken();

    const res = await request(app.getHttpServer())
      .post('/api/v1/parent/fee-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ feeDueId: 'fee-1' })
      .expect(409);

    expect(res.body.message).toBeDefined();
  });

  it('Concurrent payment returns conflict', async () => {
    seedParentUser(userRepo);
    seedAcademy(academyRepo);
    seedLink(linkRepo);
    seedFeeDue(feeDueRepo);

    // Pre-seed a pending fee payment
    const existingPayment = FeePayment.create({
      id: 'fp-existing',
      academyId: 'academy-1',
      parentUserId: 'parent-1',
      studentId: 'student-1',
      feeDueId: 'fee-1',
      monthKey: '2025-06',
      orderId: 'FEE_existing',
      paymentSessionId: 'session_old',
      baseAmount: 500,
      convenienceFee: 13,
      totalAmount: 513,
      lateFeeSnapshot: 0,
    });
    await feePaymentRepo.save(existingPayment);

    const token = makeToken();

    const res = await request(app.getHttpServer())
      .post('/api/v1/parent/fee-payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ feeDueId: 'fee-1' })
      .expect(409);

    expect(res.body.message).toBeDefined();
  });

  /* -------------------------------------------------- */
  /*  Webhook — SUCCESS                                  */
  /* -------------------------------------------------- */

  it('SUCCESS webhook marks fee as PAID, creates transaction log with receipt', async () => {
    seedAcademy(academyRepo);

    // Seed a fee due in DUE status
    seedFeeDue(feeDueRepo);

    // Seed a pending fee payment
    const payment = FeePayment.create({
      id: 'fp-success',
      academyId: 'academy-1',
      parentUserId: 'parent-1',
      studentId: 'student-1',
      feeDueId: 'fee-1',
      monthKey: '2025-06',
      orderId: 'FEE_success_order',
      paymentSessionId: 'session_success',
      baseAmount: 500,
      convenienceFee: 13,
      totalAmount: 513,
      lateFeeSnapshot: 0,
    });
    await feePaymentRepo.save(payment);

    const body = JSON.stringify({
      data: {
        order: { order_id: 'FEE_success_order', order_amount: 513 },
        payment: { payment_status: 'SUCCESS', cf_payment_id: 'cf_fee_pay_123' },
      },
    });
    const timestamp = String(Date.now());
    const signature = signPayload(body, timestamp);

    const res = await request(app.getHttpServer())
      .post('/api/v1/parent/fee-payments/cashfree/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    expect(res.body.success).toBe(true);

    // Verify payment was marked SUCCESS
    const updatedPayment = await feePaymentRepo.findByOrderId('FEE_success_order');
    expect(updatedPayment?.status).toBe('SUCCESS');
    expect(updatedPayment?.providerPaymentId).toBe('cf_fee_pay_123');

    // Verify fee due was marked PAID
    const updatedDue = await feeDueRepo.findById('fee-1');
    expect(updatedDue?.status).toBe('PAID');
    expect(updatedDue?.paidSource).toBe('PARENT_ONLINE');

    // Verify transaction log was created
    const txLog = await transactionLogRepo.findByFeeDueId('fee-1');
    expect(txLog).not.toBeNull();
    expect(txLog?.amount).toBe(500);
    expect(txLog?.source).toBe('PARENT_ONLINE');
    expect(txLog?.receiptNumber).toMatch(/^PC-/);
  });

  /* -------------------------------------------------- */
  /*  Webhook — FAILED                                   */
  /* -------------------------------------------------- */

  it('FAILED webhook marks payment as failed, fee stays DUE', async () => {
    seedFeeDue(feeDueRepo);

    const payment = FeePayment.create({
      id: 'fp-fail',
      academyId: 'academy-1',
      parentUserId: 'parent-1',
      studentId: 'student-1',
      feeDueId: 'fee-1',
      monthKey: '2025-06',
      orderId: 'FEE_fail_order',
      paymentSessionId: 'session_fail',
      baseAmount: 500,
      convenienceFee: 13,
      totalAmount: 513,
      lateFeeSnapshot: 0,
    });
    await feePaymentRepo.save(payment);

    const body = JSON.stringify({
      data: {
        order: { order_id: 'FEE_fail_order' },
        payment: { payment_status: 'FAILED', cf_payment_id: 'cf_fail' },
      },
    });
    const timestamp = String(Date.now());
    const signature = signPayload(body, timestamp);

    await request(app.getHttpServer())
      .post('/api/v1/parent/fee-payments/cashfree/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    const updatedPayment = await feePaymentRepo.findByOrderId('FEE_fail_order');
    expect(updatedPayment?.status).toBe('FAILED');
    expect(updatedPayment?.failureReason).toBe('FAILED');

    // Fee should still be DUE
    const updatedDue = await feeDueRepo.findById('fee-1');
    expect(updatedDue?.status).toBe('DUE');
  });

  /* -------------------------------------------------- */
  /*  Race condition: fee paid by owner while parent     */
  /*  payment pending → webhook returns gracefully       */
  /* -------------------------------------------------- */

  it('Race condition: fee paid by owner while parent payment pending → webhook returns gracefully', async () => {
    seedAcademy(academyRepo);

    // Fee was already paid by the owner
    seedFeeDue(feeDueRepo, { status: 'PAID' });

    // But there was a pending parent payment
    const payment = FeePayment.create({
      id: 'fp-race',
      academyId: 'academy-1',
      parentUserId: 'parent-1',
      studentId: 'student-1',
      feeDueId: 'fee-1',
      monthKey: '2025-06',
      orderId: 'FEE_race_order',
      paymentSessionId: 'session_race',
      baseAmount: 500,
      convenienceFee: 13,
      totalAmount: 513,
      lateFeeSnapshot: 0,
    });
    await feePaymentRepo.save(payment);

    const body = JSON.stringify({
      data: {
        order: { order_id: 'FEE_race_order', order_amount: 513 },
        payment: { payment_status: 'SUCCESS', cf_payment_id: 'cf_race_pay' },
      },
    });
    const timestamp = String(Date.now());
    const signature = signPayload(body, timestamp);

    // Should return 200 (graceful handling, not an error)
    const res = await request(app.getHttpServer())
      .post('/api/v1/parent/fee-payments/cashfree/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    expect(res.body.success).toBe(true);

    // Payment should be marked as FAILED with reason ALREADY_PAID
    const updatedPayment = await feePaymentRepo.findByOrderId('FEE_race_order');
    expect(updatedPayment?.status).toBe('FAILED');
    expect(updatedPayment?.failureReason).toBe('ALREADY_PAID');
  });
});
