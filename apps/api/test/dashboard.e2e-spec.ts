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
import { DashboardController } from '../src/presentation/http/dashboard/dashboard.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { STUDENT_REPOSITORY } from '../src/domain/student/ports/student.repository';
import { FEE_DUE_REPOSITORY } from '../src/domain/fee/ports/fee-due.repository';
import { PAYMENT_REQUEST_REPOSITORY } from '../src/domain/fee/ports/payment-request.repository';
import { TRANSACTION_LOG_REPOSITORY } from '../src/domain/fee/ports/transaction-log.repository';
import { STUDENT_ATTENDANCE_REPOSITORY } from '../src/domain/attendance/ports/student-attendance.repository';
import { EXPENSE_REPOSITORY } from '../src/domain/expense/ports/expense.repository';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { GetOwnerDashboardKpisUseCase } from '../src/application/dashboard/use-cases/get-owner-dashboard-kpis.usecase';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
  InMemoryFeeDueRepository,
  InMemoryPaymentRequestRepository,
  InMemoryTransactionLogRepository,
  InMemoryStudentAttendanceRepository,
  InMemoryExpenseRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import { Student } from '../src/domain/student/entities/student.entity';
import { FeeDue } from '../src/domain/fee/entities/fee-due.entity';
import { TransactionLog } from '../src/domain/fee/entities/transaction-log.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { StudentRepository } from '../src/domain/student/ports/student.repository';
import type { FeeDueRepository } from '../src/domain/fee/ports/fee-due.repository';
import type { PaymentRequestRepository } from '../src/domain/fee/ports/payment-request.repository';
import type { TransactionLogRepository } from '../src/domain/fee/ports/transaction-log.repository';
import type { StudentAttendanceRepository } from '../src/domain/attendance/ports/student-attendance.repository';
import type { ExpenseRepository } from '../src/domain/expense/ports/expense.repository';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let studentRepo: InMemoryStudentRepository;
  let feeDueRepo: InMemoryFeeDueRepository;
  let prRepo: InMemoryPaymentRequestRepository;
  let tlRepo: InMemoryTransactionLogRepository;
  let attRepo: InMemoryStudentAttendanceRepository;
  let expenseRepo: InMemoryExpenseRepository;
  let jwtService: JwtService;

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
    prRepo = new InMemoryPaymentRequestRepository();
    tlRepo = new InMemoryTransactionLogRepository();
    attRepo = new InMemoryStudentAttendanceRepository();
    expenseRepo = new InMemoryExpenseRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [DashboardController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: FEE_DUE_REPOSITORY, useValue: feeDueRepo },
        { provide: PAYMENT_REQUEST_REPOSITORY, useValue: prRepo },
        { provide: TRANSACTION_LOG_REPOSITORY, useValue: tlRepo },
        { provide: STUDENT_ATTENDANCE_REPOSITORY, useValue: attRepo },
        { provide: EXPENSE_REPOSITORY, useValue: expenseRepo },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'GET_OWNER_DASHBOARD_KPIS_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            prr: PaymentRequestRepository,
            tlr: TransactionLogRepository,
            fdr: FeeDueRepository,
            attr: StudentAttendanceRepository,
            expr: ExpenseRepository,
          ) => new GetOwnerDashboardKpisUseCase(ur, sr, prr, tlr, fdr, attr, expr),
          inject: [
            USER_REPOSITORY,
            STUDENT_REPOSITORY,
            PAYMENT_REQUEST_REPOSITORY,
            TRANSACTION_LOG_REPOSITORY,
            FEE_DUE_REPOSITORY,
            STUDENT_ATTENDANCE_REPOSITORY,
            EXPENSE_REPOSITORY,
          ],
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
    prRepo.clear();
    tlRepo.clear();
    attRepo.clear();
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

  describe('GET /dashboard/owner', () => {
    it('should return dashboard KPIs with default preset', async () => {
      await seedOwner();

      // Use current monthKey for dues
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Seed data
      const student = Student.create({
        id: 's1',
        academyId: 'academy-1',
        fullName: 'Student 1',
        dateOfBirth: new Date('2010-01-01'),
        gender: 'MALE',
        address: { line1: '123 St', city: 'City', state: 'ST', pincode: '400001' },
        guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
        joiningDate: new Date('2024-01-01'),
        monthlyFee: 500,
      });
      await studentRepo.save(student);

      const due = FeeDue.create({
        id: 'due-1',
        academyId: 'academy-1',
        studentId: 's1',
        monthKey,
        dueDate: `${monthKey}-05`,
        amount: 500,
      });
      await feeDueRepo.save(due);

      const tx = TransactionLog.create({
        id: 'tx-1',
        academyId: 'academy-1',
        feeDueId: 'due-other',
        paymentRequestId: null,
        studentId: 's1',
        monthKey,
        amount: 300,
        source: 'OWNER_DIRECT',
        collectedByUserId: 'owner-1',
        approvedByUserId: 'owner-1',
        receiptNumber: 'PC-000001',
      });
      await tlRepo.save(tx);

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/owner?preset=THIS_MONTH')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.totalStudents).toBe(1);
      expect(res.body.data.totalCollected).toBe(300);
      expect(res.body.data.totalPendingAmount).toBe(500);
      expect(res.body.data.todayAbsentCount).toBe(0);
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
        .get('/api/v1/dashboard/owner?preset=THIS_MONTH')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should reject unauthenticated (401)', async () => {
      await request(app.getHttpServer()).get('/api/v1/dashboard/owner').expect(401);
    });
  });
});
