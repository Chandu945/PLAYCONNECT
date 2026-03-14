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
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { StudentRepository } from '../src/domain/student/ports/student.repository';
import type { FeeDueRepository } from '../src/domain/fee/ports/fee-due.repository';
import type { PaymentRequestRepository } from '../src/domain/fee/ports/payment-request.repository';
import type { TransactionLogRepository } from '../src/domain/fee/ports/transaction-log.repository';
import type { AcademyRepository } from '../src/domain/academy/ports/academy.repository';
import type { ClockPort } from '../src/application/common/clock.port';
import type { TransactionPort } from '../src/application/common/transaction.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Payment Requests RBAC (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let userRepo: InMemoryUserRepository;

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
    const studentRepo = new InMemoryStudentRepository();
    const academyRepo = new InMemoryAcademyRepository();
    const feeDueRepo = new InMemoryFeeDueRepository();
    const prRepo = new InMemoryPaymentRequestRepository();
    const txLogRepo = new InMemoryTransactionLogRepository();
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

  describe('Unauthenticated requests', () => {
    it('POST /fees/payment-requests → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'test' })
        .expect(401);
    });

    it('GET /fees/payment-requests → 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/fees/payment-requests').expect(401);
    });

    it('PUT /fees/payment-requests/:id/approve → 401', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/fees/payment-requests/some-id/approve')
        .expect(401);
    });

    it('PUT /fees/payment-requests/:id/reject → 401', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/fees/payment-requests/some-id/reject')
        .send({ reason: 'test' })
        .expect(401);
    });

    it('PUT /fees/payment-requests/:id/cancel → 401', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/fees/payment-requests/some-id/cancel')
        .expect(401);
    });

    it('GET /fees/payment-requests/transactions → 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/fees/payment-requests/transactions')
        .expect(401);
    });
  });

  function seedUser(id: string, role: string, email: string) {
    const user = User.create({
      id,
      fullName: 'Test User',
      email,
      phoneNumber:
        '+91' +
        id
          .replace(/[^0-9]/g, '')
          .padEnd(10, '0')
          .slice(0, 10),
      role: role as any,
      passwordHash: 'hashed',
    });
    userRepo.save(user);
  }

  describe('Role-based access', () => {
    it('Owner cannot create payment request (403)', async () => {
      seedUser('owner-1', 'OWNER', 'owner@test.com');
      const token = jwtService.sign(
        { sub: 'owner-1', role: 'OWNER', email: 'owner@test.com', tokenVersion: 0 },
        { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
      );
      await request(app.getHttpServer())
        .post('/api/v1/fees/payment-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ studentId: 's1', monthKey: '2024-03', staffNotes: 'test notes' })
        .expect(403);
    });

    it('Staff cannot approve payment request (403)', async () => {
      seedUser('staff-1', 'STAFF', 'staff@test.com');
      const token = jwtService.sign(
        { sub: 'staff-1', role: 'STAFF', email: 'staff@test.com', tokenVersion: 0 },
        { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
      );
      await request(app.getHttpServer())
        .put('/api/v1/fees/payment-requests/some-id/approve')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('Staff cannot reject payment request (403)', async () => {
      seedUser('staff-1', 'STAFF', 'staff@test.com');
      const token = jwtService.sign(
        { sub: 'staff-1', role: 'STAFF', email: 'staff@test.com', tokenVersion: 0 },
        { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
      );
      await request(app.getHttpServer())
        .put('/api/v1/fees/payment-requests/some-id/reject')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'test' })
        .expect(403);
    });

    it('Staff cannot view transaction logs (403)', async () => {
      seedUser('staff-1', 'STAFF', 'staff@test.com');
      const token = jwtService.sign(
        { sub: 'staff-1', role: 'STAFF', email: 'staff@test.com', tokenVersion: 0 },
        { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
      );
      await request(app.getHttpServer())
        .get('/api/v1/fees/payment-requests/transactions')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('Owner cannot cancel payment request (403)', async () => {
      seedUser('owner-1', 'OWNER', 'owner@test.com');
      const token = jwtService.sign(
        { sub: 'owner-1', role: 'OWNER', email: 'owner@test.com', tokenVersion: 0 },
        { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
      );
      await request(app.getHttpServer())
        .put('/api/v1/fees/payment-requests/some-id/cancel')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });
});
