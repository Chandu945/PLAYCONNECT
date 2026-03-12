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
import { FeesController } from '../src/presentation/http/fees/fees.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { STUDENT_REPOSITORY } from '../src/domain/student/ports/student.repository';
import { ACADEMY_REPOSITORY } from '../src/domain/academy/ports/academy.repository';
import { FEE_DUE_REPOSITORY } from '../src/domain/fee/ports/fee-due.repository';
import { CLOCK_PORT } from '../src/application/common/clock.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { ListUnpaidDuesUseCase } from '../src/application/fee/use-cases/list-unpaid-dues.usecase';
import { ListPaidDuesUseCase } from '../src/application/fee/use-cases/list-paid-dues.usecase';
import { GetStudentFeesUseCase } from '../src/application/fee/use-cases/get-student-fees.usecase';
import { MarkFeePaidUseCase } from '../src/application/fee/use-cases/mark-fee-paid.usecase';
import { RunMonthlyDuesEngineUseCase } from '../src/application/fee/use-cases/run-monthly-dues-engine.usecase';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
  InMemoryAcademyRepository,
  InMemoryFeeDueRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import { Student } from '../src/domain/student/entities/student.entity';
import { Academy } from '../src/domain/academy/entities/academy.entity';
import { TRANSACTION_LOG_REPOSITORY } from '../src/domain/fee/ports/transaction-log.repository';
import { TRANSACTION_PORT } from '../src/application/common/transaction.port';
import { InMemoryTransactionLogRepository } from './helpers/in-memory-repos';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { StudentRepository } from '../src/domain/student/ports/student.repository';
import type { FeeDueRepository } from '../src/domain/fee/ports/fee-due.repository';
import type { TransactionLogRepository } from '../src/domain/fee/ports/transaction-log.repository';
import type { AcademyRepository } from '../src/domain/academy/ports/academy.repository';
import type { ClockPort } from '../src/application/common/clock.port';
import type { TransactionPort } from '../src/application/common/transaction.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Fees Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let studentRepo: InMemoryStudentRepository;
  let academyRepo: InMemoryAcademyRepository;
  let feeDueRepo: InMemoryFeeDueRepository;
  let transactionLogRepo: InMemoryTransactionLogRepository;
  let jwtService: JwtService;
  let engine: RunMonthlyDuesEngineUseCase;

  const fixedClock: ClockPort = {
    now: () => new Date('2024-03-10T10:00:00.000Z'),
  };

  const noopTransaction: TransactionPort = {
    run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  };

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
    academyRepo = new InMemoryAcademyRepository();
    feeDueRepo = new InMemoryFeeDueRepository();
    transactionLogRepo = new InMemoryTransactionLogRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    engine = new RunMonthlyDuesEngineUseCase(academyRepo, studentRepo, feeDueRepo);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [FeesController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: ACADEMY_REPOSITORY, useValue: academyRepo },
        { provide: FEE_DUE_REPOSITORY, useValue: feeDueRepo },
        { provide: CLOCK_PORT, useValue: fixedClock },
        { provide: TRANSACTION_LOG_REPOSITORY, useValue: transactionLogRepo },
        { provide: TRANSACTION_PORT, useValue: noopTransaction },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'LIST_UNPAID_DUES_USE_CASE',
          useFactory: (ur: UserRepository, fdr: FeeDueRepository, ar: AcademyRepository, clock: ClockPort) =>
            new ListUnpaidDuesUseCase(ur, fdr, ar, clock),
          inject: [USER_REPOSITORY, FEE_DUE_REPOSITORY, ACADEMY_REPOSITORY, CLOCK_PORT],
        },
        {
          provide: 'LIST_PAID_DUES_USE_CASE',
          useFactory: (ur: UserRepository, fdr: FeeDueRepository) =>
            new ListPaidDuesUseCase(ur, fdr),
          inject: [USER_REPOSITORY, FEE_DUE_REPOSITORY],
        },
        {
          provide: 'GET_STUDENT_FEES_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, fdr: FeeDueRepository, ar: AcademyRepository, clock: ClockPort) =>
            new GetStudentFeesUseCase(ur, sr, fdr, ar, clock),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, FEE_DUE_REPOSITORY, ACADEMY_REPOSITORY, CLOCK_PORT],
        },
        {
          provide: 'MARK_FEE_PAID_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            fdr: FeeDueRepository,
            tlr: TransactionLogRepository,
            ar: AcademyRepository,
            clock: ClockPort,
            tx: TransactionPort,
          ) => new MarkFeePaidUseCase(ur, sr, fdr, tlr, ar, clock, tx),
          inject: [
            USER_REPOSITORY,
            STUDENT_REPOSITORY,
            FEE_DUE_REPOSITORY,
            TRANSACTION_LOG_REPOSITORY,
            ACADEMY_REPOSITORY,
            CLOCK_PORT,
            TRANSACTION_PORT,
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
    academyRepo.clear();
    feeDueRepo.clear();
    transactionLogRepo.clear();
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

  async function seedAcademy(id = 'academy-1', dueDateDay: number | null = 5) {
    const academy = Academy.create({
      id,
      ownerUserId: 'owner-1',
      academyName: 'Test Academy',
      address: { line1: '1 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
    });
    const withSettings = dueDateDay
      ? academy.updateSettings({ defaultDueDateDay: dueDateDay })
      : academy;
    await academyRepo.save(withSettings);
  }

  async function seedStudent(id: string, academyId = 'academy-1', joiningDate = '2024-01-01') {
    const student = Student.create({
      id,
      academyId,
      fullName: `Student ${id}`,
      dateOfBirth: new Date('2010-01-01'),
      gender: 'MALE',
      address: { line1: '123 St', city: 'City', state: 'ST', pincode: '400001' },
      guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
      joiningDate: new Date(joiningDate),
      monthlyFee: 500,
    });
    await studentRepo.save(student);
  }

  describe('GET /fees/dues', () => {
    it('should show unpaid dues after engine run', async () => {
      await seedOwner();
      await seedAcademy();
      await seedStudent('s1');
      await seedStudent('s2');

      // Run engine to generate dues (day 10 >= day 5, so they become DUE)
      await engine.execute({ academyId: 'academy-1', now: new Date('2024-03-10') });

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get('/api/v1/fees/dues?month=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].status).toBe('DUE');
    });
  });

  describe('PUT /fees/students/:studentId/:month/pay', () => {
    it('should mark a due as paid', async () => {
      await seedOwner();
      await seedAcademy();
      await seedStudent('s1');
      await engine.execute({ academyId: 'academy-1', now: new Date('2024-03-10') });

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .put('/api/v1/fees/students/s1/2024-03/pay')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.status).toBe('PAID');
      expect(res.body.data.paidSource).toBe('OWNER_DIRECT');
      expect(res.body.data.paymentLabel).toBe('CASH');
    });

    it('should show in paid list after marking', async () => {
      await seedOwner();
      await seedAcademy();
      await seedStudent('s1');
      await engine.execute({ academyId: 'academy-1', now: new Date('2024-03-10') });

      const token = makeToken();
      await request(app.getHttpServer())
        .put('/api/v1/fees/students/s1/2024-03/pay')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const paidRes = await request(app.getHttpServer())
        .get('/api/v1/fees/paid?month=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(paidRes.body.data).toHaveLength(1);
      expect(paidRes.body.data[0].status).toBe('PAID');
    });

    it('should reject duplicate pay (409)', async () => {
      await seedOwner();
      await seedAcademy();
      await seedStudent('s1');
      await engine.execute({ academyId: 'academy-1', now: new Date('2024-03-10') });

      const token = makeToken();
      await request(app.getHttpServer())
        .put('/api/v1/fees/students/s1/2024-03/pay')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .put('/api/v1/fees/students/s1/2024-03/pay')
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
    });
  });

  describe('Mid-month join exclusion', () => {
    it('should not generate dues for mid-month join students', async () => {
      await seedOwner();
      await seedAcademy();
      await seedStudent('s1', 'academy-1', '2024-03-15'); // Joined mid-month

      await engine.execute({ academyId: 'academy-1', now: new Date('2024-03-20') });

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get('/api/v1/fees/dues?month=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('GET /fees/students/:studentId', () => {
    it('should return student fee history for a range', async () => {
      await seedOwner();
      await seedAcademy();
      await seedStudent('s1');

      // Generate dues for multiple months
      await engine.execute({ academyId: 'academy-1', now: new Date('2024-01-10') });
      await engine.execute({ academyId: 'academy-1', now: new Date('2024-02-10') });
      await engine.execute({ academyId: 'academy-1', now: new Date('2024-03-10') });

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get('/api/v1/fees/students/s1?from=2024-01&to=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].monthKey).toBe('2024-01');
      expect(res.body.data[2].monthKey).toBe('2024-03');
    });
  });
});
