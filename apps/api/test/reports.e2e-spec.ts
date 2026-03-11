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
import { ReportsController } from '../src/presentation/http/reports/reports.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { STUDENT_REPOSITORY } from '../src/domain/student/ports/student.repository';
import { FEE_DUE_REPOSITORY } from '../src/domain/fee/ports/fee-due.repository';
import { TRANSACTION_LOG_REPOSITORY } from '../src/domain/fee/ports/transaction-log.repository';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { GetStudentWiseDuesReportUseCase } from '../src/application/reports/use-cases/get-student-wise-dues-report.usecase';
import { GetMonthWiseDuesReportUseCase } from '../src/application/reports/use-cases/get-month-wise-dues-report.usecase';
import { GetMonthlyRevenueReportUseCase } from '../src/application/reports/use-cases/get-monthly-revenue-report.usecase';
import { ExportMonthlyRevenuePdfUseCase } from '../src/application/reports/use-cases/export-monthly-revenue-pdf.usecase';
import { ExportPendingDuesPdfUseCase } from '../src/application/reports/use-cases/export-pending-dues-pdf.usecase';
import { PdfkitRenderer } from '../src/infrastructure/reports/pdfkit-renderer';
import { PDF_RENDERER } from '../src/application/reports/ports/pdf-renderer.port';
import type { PdfRenderer } from '../src/application/reports/ports/pdf-renderer.port';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
  InMemoryFeeDueRepository,
  InMemoryTransactionLogRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import { Student } from '../src/domain/student/entities/student.entity';
import { FeeDue } from '../src/domain/fee/entities/fee-due.entity';
import { TransactionLog } from '../src/domain/fee/entities/transaction-log.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { StudentRepository } from '../src/domain/student/ports/student.repository';
import type { FeeDueRepository } from '../src/domain/fee/ports/fee-due.repository';
import type { TransactionLogRepository } from '../src/domain/fee/ports/transaction-log.repository';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Reports (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let studentRepo: InMemoryStudentRepository;
  let feeDueRepo: InMemoryFeeDueRepository;
  let tlRepo: InMemoryTransactionLogRepository;
  let jwtService: JwtService;

  // Use current monthKey for all tests
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '3001';
    process.env['TZ'] = 'Asia/Kolkata';
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret';
    process.env['BCRYPT_COST'] = '4';

    userRepo = new InMemoryUserRepository();
    studentRepo = new InMemoryStudentRepository();
    feeDueRepo = new InMemoryFeeDueRepository();
    tlRepo = new InMemoryTransactionLogRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [ReportsController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: FEE_DUE_REPOSITORY, useValue: feeDueRepo },
        { provide: TRANSACTION_LOG_REPOSITORY, useValue: tlRepo },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'GET_STUDENT_WISE_DUES_REPORT_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, fdr: FeeDueRepository) =>
            new GetStudentWiseDuesReportUseCase(ur, sr, fdr),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, FEE_DUE_REPOSITORY],
        },
        {
          provide: 'GET_MONTH_WISE_DUES_REPORT_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, fdr: FeeDueRepository) =>
            new GetMonthWiseDuesReportUseCase(ur, sr, fdr),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, FEE_DUE_REPOSITORY],
        },
        {
          provide: 'GET_MONTHLY_REVENUE_REPORT_USE_CASE',
          useFactory: (ur: UserRepository, tlr: TransactionLogRepository) =>
            new GetMonthlyRevenueReportUseCase(ur, tlr),
          inject: [USER_REPOSITORY, TRANSACTION_LOG_REPOSITORY],
        },
        { provide: PDF_RENDERER, useClass: PdfkitRenderer },
        {
          provide: 'EXPORT_MONTHLY_REVENUE_PDF_USE_CASE',
          useFactory: (ur: UserRepository, tlr: TransactionLogRepository, pdf: PdfRenderer) =>
            new ExportMonthlyRevenuePdfUseCase(ur, tlr, pdf),
          inject: [USER_REPOSITORY, TRANSACTION_LOG_REPOSITORY, PDF_RENDERER],
        },
        {
          provide: 'EXPORT_PENDING_DUES_PDF_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            fdr: FeeDueRepository,
            pdf: PdfRenderer,
          ) => new ExportPendingDuesPdfUseCase(ur, sr, fdr, pdf),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, FEE_DUE_REPOSITORY, PDF_RENDERER],
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
    feeDueRepo.clear();
    tlRepo.clear();
  });

  function makeToken(sub = 'owner-1', role = 'OWNER') {
    return jwtService.sign(
      { sub, role, email: `${sub}@test.com`, tokenVersion: 0 },
      { secret: 'test-access-secret', expiresIn: 900 },
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

  async function seedStudentWithDue(
    studentId: string,
    academyId = 'academy-1',
    mk = monthKey,
    amount = 500,
  ) {
    const student = Student.create({
      id: studentId,
      academyId,
      fullName: `Student ${studentId}`,
      dateOfBirth: new Date('2010-01-01'),
      gender: 'MALE',
      address: { line1: '123 St', city: 'City', state: 'ST', pincode: '400001' },
      guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
      joiningDate: new Date('2024-01-01'),
      monthlyFee: amount,
    });
    await studentRepo.save(student);

    const due = FeeDue.create({
      id: `${studentId}-${mk}`,
      academyId,
      studentId,
      monthKey: mk,
      dueDate: `${mk}-05`,
      amount,
    });
    await feeDueRepo.save(due);
    return due;
  }

  describe('GET /reports/student-wise-dues', () => {
    it('should return student-wise dues report', async () => {
      await seedOwner();
      await seedStudentWithDue('s1');
      await seedStudentWithDue('s2');

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/student-wise-dues?month=${monthKey}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].studentId).toBeDefined();
      expect(res.body.data[0].amount).toBe(500);
      expect(res.body.data[0].pendingMonthsCount).toBe(1);
      expect(res.body.data[0].totalPendingAmount).toBe(500);
    });

    it('should reject unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/reports/student-wise-dues?month=${monthKey}`)
        .expect(401);
    });

    it('should reject staff (403)', async () => {
      const staffId = 'staff-1';
      const staff = User.create({
        id: staffId,
        fullName: 'Staff',
        email: 'staff@test.com',
        phoneNumber: '+919900000003',
        passwordHash: 'hash',
        role: 'STAFF',
      });
      await userRepo.save(
        User.reconstitute(staffId, { ...staff['props'], academyId: 'academy-1' }),
      );

      const token = makeToken(staffId, 'STAFF');
      await request(app.getHttpServer())
        .get(`/api/v1/reports/student-wise-dues?month=${monthKey}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('GET /reports/month-wise-dues', () => {
    it('should return month-wise dues summary', async () => {
      await seedOwner();
      await seedStudentWithDue('s1');
      const due = await seedStudentWithDue('s2');
      // Mark one as paid
      const paid = due.markPaid('owner-1', new Date());
      await feeDueRepo.save(paid);

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/month-wise-dues?month=${monthKey}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.month).toBe(monthKey);
      expect(res.body.data.totalDues).toBe(2);
      expect(res.body.data.paidCount).toBe(1);
      expect(res.body.data.unpaidCount).toBe(1);
      expect(res.body.data.paidAmount).toBe(500);
      expect(res.body.data.unpaidAmount).toBe(500);
      expect(res.body.data.dues).toHaveLength(2);
    });

    it('should validate month format', async () => {
      await seedOwner();
      const token = makeToken();
      await request(app.getHttpServer())
        .get('/api/v1/reports/month-wise-dues?month=invalid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('GET /reports/monthly-revenue', () => {
    it('should return monthly revenue from transaction logs', async () => {
      await seedOwner();

      const tx1 = TransactionLog.create({
        id: 'tx-1',
        academyId: 'academy-1',
        feeDueId: 'due-1',
        paymentRequestId: null,
        studentId: 's1',
        monthKey,
        amount: 500,
        source: 'OWNER_DIRECT',
        collectedByUserId: 'owner-1',
        approvedByUserId: 'owner-1',
        receiptNumber: 'PC-000001',
      });
      await tlRepo.save(tx1);

      const tx2 = TransactionLog.create({
        id: 'tx-2',
        academyId: 'academy-1',
        feeDueId: 'due-2',
        paymentRequestId: 'pr-1',
        studentId: 's2',
        monthKey,
        amount: 300,
        source: 'STAFF_APPROVED',
        collectedByUserId: 'staff-1',
        approvedByUserId: 'owner-1',
        receiptNumber: 'PC-000002',
      });
      await tlRepo.save(tx2);

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/monthly-revenue?month=${monthKey}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.totalAmount).toBe(800);
      expect(res.body.data.transactionCount).toBe(2);
      expect(res.body.data.transactions).toHaveLength(2);
      expect(res.body.data.transactions[0].source).toBeDefined();
      expect(res.body.data.transactions[0].receiptNumber).toBeDefined();
    });

    it('should return empty when no transactions', async () => {
      await seedOwner();
      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/monthly-revenue?month=${monthKey}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.totalAmount).toBe(0);
      expect(res.body.data.transactionCount).toBe(0);
      expect(res.body.data.transactions).toHaveLength(0);
    });
  });

  describe('GET /reports/revenue/export.pdf', () => {
    it('should return a PDF file', async () => {
      await seedOwner();

      const tx = TransactionLog.create({
        id: 'tx-pdf-1',
        academyId: 'academy-1',
        feeDueId: 'due-1',
        paymentRequestId: null,
        studentId: 's1',
        monthKey,
        amount: 500,
        source: 'OWNER_DIRECT',
        collectedByUserId: 'owner-1',
        approvedByUserId: 'owner-1',
        receiptNumber: 'PC-000001',
      });
      await tlRepo.save(tx);

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/revenue/export.pdf?month=${monthKey}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain(`revenue-${monthKey}.pdf`);
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should reject staff (403)', async () => {
      await seedOwner();
      const staffId = 'staff-pdf';
      const staff = User.create({
        id: staffId,
        fullName: 'Staff',
        email: 'staff-pdf@test.com',
        phoneNumber: '+919900000099',
        passwordHash: 'hash',
        role: 'STAFF',
      });
      await userRepo.save(
        User.reconstitute(staffId, { ...staff['props'], academyId: 'academy-1' }),
      );
      const token = makeToken(staffId, 'STAFF');
      await request(app.getHttpServer())
        .get(`/api/v1/reports/revenue/export.pdf?month=${monthKey}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('GET /reports/dues/pending/export.pdf', () => {
    it('should return a PDF file for pending dues', async () => {
      await seedOwner();
      await seedStudentWithDue('s-pdf-1');

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/dues/pending/export.pdf?month=${monthKey}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain(`pending-dues-${monthKey}.pdf`);
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should reject unauthenticated (401)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/reports/dues/pending/export.pdf?month=${monthKey}`)
        .expect(401);
    });
  });
});
