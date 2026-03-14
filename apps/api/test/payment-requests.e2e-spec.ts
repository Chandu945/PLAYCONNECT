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
import { PaymentRequestsController } from '../src/presentation/http/fees/payment-requests.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { STUDENT_REPOSITORY } from '../src/domain/student/ports/student.repository';
import { ACADEMY_REPOSITORY } from '../src/domain/academy/ports/academy.repository';
import { FEE_DUE_REPOSITORY } from '../src/domain/fee/ports/fee-due.repository';
import { PAYMENT_REQUEST_REPOSITORY } from '../src/domain/fee/ports/payment-request.repository';
import { TRANSACTION_LOG_REPOSITORY } from '../src/domain/fee/ports/transaction-log.repository';
import { CLOCK_PORT } from '../src/application/common/clock.port';
import { TRANSACTION_PORT } from '../src/application/common/transaction.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { CreatePaymentRequestUseCase } from '../src/application/fee/use-cases/create-payment-request.usecase';
import { ListPaymentRequestsUseCase } from '../src/application/fee/use-cases/list-payment-requests.usecase';
import { CancelPaymentRequestUseCase } from '../src/application/fee/use-cases/cancel-payment-request.usecase';
import { EditPaymentRequestUseCase } from '../src/application/fee/use-cases/edit-payment-request.usecase';
import { ApprovePaymentRequestUseCase } from '../src/application/fee/use-cases/approve-payment-request.usecase';
import { RejectPaymentRequestUseCase } from '../src/application/fee/use-cases/reject-payment-request.usecase';
import { ListTransactionLogsUseCase } from '../src/application/fee/use-cases/list-transaction-logs.usecase';
import { RunMonthlyDuesEngineUseCase } from '../src/application/fee/use-cases/run-monthly-dues-engine.usecase';
import { PUSH_NOTIFICATION_SERVICE } from '../src/presentation/http/device-tokens/device-tokens.module';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
  InMemoryAcademyRepository,
  InMemoryFeeDueRepository,
  InMemoryPaymentRequestRepository,
  InMemoryTransactionLogRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import { Student } from '../src/domain/student/entities/student.entity';
import { Academy } from '../src/domain/academy/entities/academy.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { StudentRepository } from '../src/domain/student/ports/student.repository';
import type { FeeDueRepository } from '../src/domain/fee/ports/fee-due.repository';
import type { PaymentRequestRepository } from '../src/domain/fee/ports/payment-request.repository';
import type { TransactionLogRepository } from '../src/domain/fee/ports/transaction-log.repository';
import type { AcademyRepository } from '../src/domain/academy/ports/academy.repository';
import type { ClockPort } from '../src/application/common/clock.port';
import type { TransactionPort } from '../src/application/common/transaction.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Payment Requests Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let studentRepo: InMemoryStudentRepository;
  let academyRepo: InMemoryAcademyRepository;
  let feeDueRepo: InMemoryFeeDueRepository;
  let prRepo: InMemoryPaymentRequestRepository;
  let txLogRepo: InMemoryTransactionLogRepository;
  let jwtService: JwtService;
  let engine: RunMonthlyDuesEngineUseCase;

  const fixedClock: ClockPort = {
    now: () => new Date('2024-03-10T10:00:00.000Z'),
  };

  const noopTx: TransactionPort = {
    run: async <T>(fn: () => Promise<T>) => fn(),
  };

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '3001';
    process.env['TZ'] = 'Asia/Kolkata';
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-that-is-at-least-32-characters-long';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-that-is-at-least-32-characters-long';
    process.env['BCRYPT_COST'] = '4';

    userRepo = new InMemoryUserRepository();
    studentRepo = new InMemoryStudentRepository();
    academyRepo = new InMemoryAcademyRepository();
    feeDueRepo = new InMemoryFeeDueRepository();
    prRepo = new InMemoryPaymentRequestRepository();
    txLogRepo = new InMemoryTransactionLogRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const noOpAuditRecorder = { record: async () => {} };
    const noOpAuditLogRepo = {
      save: async () => {},
      listByAcademy: async () => ({
        items: [],
        meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      }),
    };

    engine = new RunMonthlyDuesEngineUseCase(academyRepo, studentRepo, feeDueRepo);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [PaymentRequestsController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: ACADEMY_REPOSITORY, useValue: academyRepo },
        { provide: FEE_DUE_REPOSITORY, useValue: feeDueRepo },
        { provide: PAYMENT_REQUEST_REPOSITORY, useValue: prRepo },
        { provide: TRANSACTION_LOG_REPOSITORY, useValue: txLogRepo },
        { provide: CLOCK_PORT, useValue: fixedClock },
        { provide: TRANSACTION_PORT, useValue: noopTx },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'CREATE_PAYMENT_REQUEST_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            fdr: FeeDueRepository,
            prr: PaymentRequestRepository,
          ) => new CreatePaymentRequestUseCase(ur, sr, fdr, prr, noOpAuditRecorder),
          inject: [
            USER_REPOSITORY,
            STUDENT_REPOSITORY,
            FEE_DUE_REPOSITORY,
            PAYMENT_REQUEST_REPOSITORY,
          ],
        },
        {
          provide: 'LIST_PAYMENT_REQUESTS_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, prr: PaymentRequestRepository) =>
            new ListPaymentRequestsUseCase(ur, sr, prr),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, PAYMENT_REQUEST_REPOSITORY],
        },
        {
          provide: 'CANCEL_PAYMENT_REQUEST_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, prr: PaymentRequestRepository) =>
            new CancelPaymentRequestUseCase(ur, sr, prr, noOpAuditRecorder),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, PAYMENT_REQUEST_REPOSITORY],
        },
        {
          provide: 'EDIT_PAYMENT_REQUEST_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, prr: PaymentRequestRepository) =>
            new EditPaymentRequestUseCase(ur, sr, prr, noOpAuditRecorder),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, PAYMENT_REQUEST_REPOSITORY],
        },
        {
          provide: 'APPROVE_PAYMENT_REQUEST_USE_CASE',
          useFactory: (
            ur: UserRepository,
            ar: AcademyRepository,
            fdr: FeeDueRepository,
            prr: PaymentRequestRepository,
            tlr: TransactionLogRepository,
            sr: StudentRepository,
            clock: ClockPort,
            tx: TransactionPort,
          ) => new ApprovePaymentRequestUseCase(ur, ar, fdr, prr, tlr, sr, clock, tx, noOpAuditLogRepo),
          inject: [
            USER_REPOSITORY,
            ACADEMY_REPOSITORY,
            FEE_DUE_REPOSITORY,
            PAYMENT_REQUEST_REPOSITORY,
            TRANSACTION_LOG_REPOSITORY,
            STUDENT_REPOSITORY,
            CLOCK_PORT,
            TRANSACTION_PORT,
          ],
        },
        {
          provide: PUSH_NOTIFICATION_SERVICE,
          useValue: { sendToUser: async () => {}, sendToUsers: async () => {} },
        },
        {
          provide: 'REJECT_PAYMENT_REQUEST_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, prr: PaymentRequestRepository, fdr: FeeDueRepository, clock: ClockPort) =>
            new RejectPaymentRequestUseCase(ur, sr, prr, fdr, clock, noOpAuditRecorder),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, PAYMENT_REQUEST_REPOSITORY, FEE_DUE_REPOSITORY, CLOCK_PORT],
        },
        {
          provide: 'LIST_TRANSACTION_LOGS_USE_CASE',
          useFactory: (ur: UserRepository, tlr: TransactionLogRepository) =>
            new ListTransactionLogsUseCase(ur, tlr),
          inject: [USER_REPOSITORY, TRANSACTION_LOG_REPOSITORY],
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
    studentRepo.clear();
    academyRepo.clear();
    feeDueRepo.clear();
    prRepo.clear();
    txLogRepo.clear();
  });

  function makeToken(sub = 'owner-1', role = 'OWNER') {
    return jwtService.sign(
      { sub, role, email: `${sub}@test.com`, tokenVersion: 0 },
      { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
    );
  }

  async function seedOwner(id = 'owner-1', academyId = 'academy-1') {
    const user = User.create({
      id,
      fullName: 'Test Owner',
      email: `${id}@test.com`,
      phoneNumber: '+919876543210',
      role: 'OWNER',
      passwordHash: 'hashed',
    });
    await userRepo.save(User.reconstitute(id, { ...user['props'], academyId }));
  }

  async function seedStaff(id = 'staff-1', academyId = 'academy-1') {
    const user = User.create({
      id,
      fullName: 'Test Staff',
      email: `${id}@test.com`,
      phoneNumber: '+919876543211',
      role: 'STAFF',
      passwordHash: 'hashed',
    });
    await userRepo.save(User.reconstitute(id, { ...user['props'], academyId }));
  }

  async function seedAcademy(id = 'academy-1') {
    const academy = Academy.create({
      id,
      ownerUserId: 'owner-1',
      academyName: 'Test Academy',
      address: { line1: '1 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
    });
    const withSettings = academy.updateSettings({ defaultDueDateDay: 5 });
    await academyRepo.save(withSettings);
  }

  async function seedStudent(id: string, academyId = 'academy-1') {
    const student = Student.create({
      id,
      academyId,
      fullName: `Student ${id}`,
      dateOfBirth: new Date('2010-01-01'),
      gender: 'MALE',
      address: { line1: '123 St', city: 'City', state: 'ST', pincode: '400001' },
      guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
      joiningDate: new Date('2024-01-01'),
      monthlyFee: 500,
    });
    await studentRepo.save(student);
  }

  async function seedDuesForMonth() {
    await engine.execute({ academyId: 'academy-1', now: new Date('2024-03-10') });
  }

  describe('POST /fees/payment-requests', () => {
    it('should create a payment request as staff', async () => {
      await seedOwner();
      await seedStaff();
      await seedAcademy();
      await seedStudent('s1');
      await seedDuesForMonth();

      const token = makeToken('staff-1', 'STAFF');
      const res = await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Collected cash from parent' })
        .expect(201);

      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.staffUserId).toBe('staff-1');
      expect(res.body.data.amount).toBe(500);
    });

    it('should reject duplicate pending request (409)', async () => {
      await seedOwner();
      await seedStaff();
      await seedAcademy();
      await seedStudent('s1');
      await seedDuesForMonth();

      const token = makeToken('staff-1', 'STAFF');
      await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Collected cash' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Another attempt' })
        .expect(409);
    });

    it('should reject owner creating request (403)', async () => {
      await seedOwner();
      await seedAcademy();
      await seedStudent('s1');
      await seedDuesForMonth();

      const token = makeToken('owner-1', 'OWNER');
      await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Collected cash' })
        .expect(403);
    });
  });

  describe('PUT /fees/payment-requests/:id/approve', () => {
    it('should approve and mark due as PAID', async () => {
      await seedOwner();
      await seedStaff();
      await seedAcademy();
      await seedStudent('s1');
      await seedDuesForMonth();

      // Staff creates request
      const staffToken = makeToken('staff-1', 'STAFF');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Collected cash' })
        .expect(201);

      const prId = createRes.body.data.id;

      // Owner approves
      const ownerToken = makeToken('owner-1', 'OWNER');
      const approveRes = await request(app.getHttpServer())
        .put(`/api/v1/fees/payment-requests/${prId}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(approveRes.body.data.status).toBe('APPROVED');
      expect(approveRes.body.data.reviewedByUserId).toBe('owner-1');
    });

    it('should reject staff approving (403)', async () => {
      await seedOwner();
      await seedStaff();
      await seedAcademy();
      await seedStudent('s1');
      await seedDuesForMonth();

      const staffToken = makeToken('staff-1', 'STAFF');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Collected cash' })
        .expect(201);

      await request(app.getHttpServer())
        .put(`/api/v1/fees/payment-requests/${createRes.body.data.id}/approve`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });
  });

  describe('PUT /fees/payment-requests/:id/reject', () => {
    it('should reject a payment request with reason', async () => {
      await seedOwner();
      await seedStaff();
      await seedAcademy();
      await seedStudent('s1');
      await seedDuesForMonth();

      const staffToken = makeToken('staff-1', 'STAFF');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Collected cash' })
        .expect(201);

      const ownerToken = makeToken('owner-1', 'OWNER');
      const rejectRes = await request(app.getHttpServer())
        .put(`/api/v1/fees/payment-requests/${createRes.body.data.id}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Amount does not match' })
        .expect(200);

      expect(rejectRes.body.data.status).toBe('REJECTED');
      expect(rejectRes.body.data.rejectionReason).toBe('Amount does not match');
    });

    it('should reject without reason (400)', async () => {
      await seedOwner();
      await seedStaff();
      await seedAcademy();
      await seedStudent('s1');
      await seedDuesForMonth();

      const staffToken = makeToken('staff-1', 'STAFF');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Collected cash' })
        .expect(201);

      const ownerToken = makeToken('owner-1', 'OWNER');
      await request(app.getHttpServer())
        .put(`/api/v1/fees/payment-requests/${createRes.body.data.id}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('PUT /fees/payment-requests/:id/cancel', () => {
    it('should cancel own pending request', async () => {
      await seedOwner();
      await seedStaff();
      await seedAcademy();
      await seedStudent('s1');
      await seedDuesForMonth();

      const staffToken = makeToken('staff-1', 'STAFF');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Collected cash' })
        .expect(201);

      const cancelRes = await request(app.getHttpServer())
        .put(`/api/v1/fees/payment-requests/${createRes.body.data.id}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(cancelRes.body.data.status).toBe('CANCELLED');
    });

    it('should reject cancelling already approved request (409)', async () => {
      await seedOwner();
      await seedStaff();
      await seedAcademy();
      await seedStudent('s1');
      await seedDuesForMonth();

      const staffToken = makeToken('staff-1', 'STAFF');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Collected cash' })
        .expect(201);

      // Owner approves first
      const ownerToken = makeToken('owner-1', 'OWNER');
      await request(app.getHttpServer())
        .put(`/api/v1/fees/payment-requests/${createRes.body.data.id}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // Staff tries to cancel
      await request(app.getHttpServer())
        .put(`/api/v1/fees/payment-requests/${createRes.body.data.id}/cancel`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(409);
    });
  });

  describe('GET /fees/payment-requests', () => {
    it('should list all requests for owner', async () => {
      await seedOwner();
      await seedStaff();
      await seedAcademy();
      await seedStudent('s1');
      await seedDuesForMonth();

      const staffToken = makeToken('staff-1', 'STAFF');
      await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Collected cash' })
        .expect(201);

      const ownerToken = makeToken('owner-1', 'OWNER');
      const res = await request(app.getHttpServer())
        .get('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.data[0].status).toBe('PENDING');
      expect(res.body.data.meta.totalItems).toBe(1);
    });

    it('should list only own requests for staff', async () => {
      await seedOwner();
      await seedStaff();
      await seedAcademy();
      await seedStudent('s1');
      await seedDuesForMonth();

      const staffToken = makeToken('staff-1', 'STAFF');
      await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Collected cash' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.meta.totalItems).toBe(1);
    });
  });

  describe('GET /fees/payment-requests/transactions', () => {
    it('should list transaction logs after approval', async () => {
      await seedOwner();
      await seedStaff();
      await seedAcademy();
      await seedStudent('s1');
      await seedDuesForMonth();

      const staffToken = makeToken('staff-1', 'STAFF');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'Collected cash' })
        .expect(201);

      const ownerToken = makeToken('owner-1', 'OWNER');
      await request(app.getHttpServer())
        .put(`/api/v1/fees/payment-requests/${createRes.body.data.id}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/fees/payment-requests/transactions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].receiptNumber).toMatch(/^PC-/);
    });

    it('should reject staff viewing transactions (403)', async () => {
      await seedOwner();
      await seedStaff();
      await seedAcademy();

      const staffToken = makeToken('staff-1', 'STAFF');
      await request(app.getHttpServer())
        .get('/api/v1/fees/payment-requests/transactions')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });
  });
});
