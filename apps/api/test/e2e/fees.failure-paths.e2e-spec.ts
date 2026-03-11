import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { GlobalExceptionFilter } from '../../src/shared/errors/global-exception.filter';
import { RequestIdInterceptor } from '../../src/shared/logging/request-id.interceptor';
import { createGlobalValidationPipe } from '../../src/shared/validation/validation.pipe';
import { AppConfigModule } from '../../src/shared/config/config.module';
import { LoggingModule } from '../../src/shared/logging/logging.module';
import { FeesController } from '../../src/presentation/http/fees/fees.controller';
import { USER_REPOSITORY } from '../../src/domain/identity/ports/user.repository';
import { STUDENT_REPOSITORY } from '../../src/domain/student/ports/student.repository';
import { ACADEMY_REPOSITORY } from '../../src/domain/academy/ports/academy.repository';
import { FEE_DUE_REPOSITORY } from '../../src/domain/fee/ports/fee-due.repository';
import { TRANSACTION_LOG_REPOSITORY } from '../../src/domain/fee/ports/transaction-log.repository';
import { TRANSACTION_PORT } from '../../src/application/common/transaction.port';
import { CLOCK_PORT } from '../../src/application/common/clock.port';
import { TOKEN_SERVICE } from '../../src/application/identity/ports/token-service.port';
import { ListUnpaidDuesUseCase } from '../../src/application/fee/use-cases/list-unpaid-dues.usecase';
import { ListPaidDuesUseCase } from '../../src/application/fee/use-cases/list-paid-dues.usecase';
import { GetStudentFeesUseCase } from '../../src/application/fee/use-cases/get-student-fees.usecase';
import { MarkFeePaidUseCase } from '../../src/application/fee/use-cases/mark-fee-paid.usecase';
import { RunMonthlyDuesEngineUseCase } from '../../src/application/fee/use-cases/run-monthly-dues-engine.usecase';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
  InMemoryAcademyRepository,
  InMemoryFeeDueRepository,
  InMemoryTransactionLogRepository,
} from '../helpers/in-memory-repos';
import { createTestTokenService } from '../helpers/test-services';
import { User } from '../../src/domain/identity/entities/user.entity';
import { Student } from '../../src/domain/student/entities/student.entity';
import { Academy } from '../../src/domain/academy/entities/academy.entity';
import type { UserRepository } from '../../src/domain/identity/ports/user.repository';
import type { StudentRepository } from '../../src/domain/student/ports/student.repository';
import type { FeeDueRepository } from '../../src/domain/fee/ports/fee-due.repository';
import type { TransactionLogRepository } from '../../src/domain/fee/ports/transaction-log.repository';
import type { AcademyRepository } from '../../src/domain/academy/ports/academy.repository';
import type { ClockPort } from '../../src/application/common/clock.port';
import type { TransactionPort } from '../../src/application/common/transaction.port';
import { configureApiVersioning } from '../../src/shared/config/api-versioning';

describe('Fees Failure Paths (e2e)', () => {
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
          useFactory: (ur: UserRepository, fdr: FeeDueRepository) =>
            new ListUnpaidDuesUseCase(ur, fdr),
          inject: [USER_REPOSITORY, FEE_DUE_REPOSITORY],
        },
        {
          provide: 'LIST_PAID_DUES_USE_CASE',
          useFactory: (ur: UserRepository, fdr: FeeDueRepository) =>
            new ListPaidDuesUseCase(ur, fdr),
          inject: [USER_REPOSITORY, FEE_DUE_REPOSITORY],
        },
        {
          provide: 'GET_STUDENT_FEES_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, fdr: FeeDueRepository) =>
            new GetStudentFeesUseCase(ur, sr, fdr),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, FEE_DUE_REPOSITORY],
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

  async function seedStaffUser(id = 'staff-1', academyId = 'academy-1') {
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

  async function seedAcademy(id = 'academy-1', dueDateDay = 5) {
    const academy = Academy.create({
      id,
      ownerUserId: 'owner-1',
      academyName: 'Test Academy',
      address: { line1: '1 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
    });
    await academyRepo.save(academy.updateSettings({ defaultDueDateDay: dueDateDay }));
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

  describe('GET /fees/dues — unauthenticated (401)', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/fees/dues?month=2024-03').expect(401);
    });
  });

  describe('PUT /fees/students/:id/:month/pay — forbidden role (403)', () => {
    it('should return 403 for STAFF role on owner-only mark-paid', async () => {
      await seedOwner();
      await seedStaffUser();
      await seedAcademy();
      await seedStudent('s1');
      await engine.execute({ academyId: 'academy-1', now: new Date('2024-03-10') });

      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .put('/api/v1/fees/students/s1/2024-03/pay')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('PUT /fees/students/:studentId/:month/pay — conflict (409)', () => {
    it('should return 409 on double pay (idempotency)', async () => {
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

  describe('PUT /fees/students/:studentId/:month/pay — not found (404)', () => {
    it('should return 404 for non-existent student', async () => {
      await seedOwner();
      await seedAcademy();

      const token = makeToken();
      await request(app.getHttpServer())
        .put('/api/v1/fees/students/nonexistent/2024-03/pay')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('GET /fees/students/:studentId — not found (404)', () => {
    it('should return 404 for non-existent student fee history', async () => {
      await seedOwner();
      await seedAcademy();

      const token = makeToken();
      await request(app.getHttpServer())
        .get('/api/v1/fees/students/nonexistent?from=2024-01&to=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
