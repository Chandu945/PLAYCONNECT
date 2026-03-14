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
import { SettingsController } from '../src/presentation/http/settings/settings.controller';
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
import { GetAcademySettingsUseCase } from '../src/application/academy/use-cases/get-academy-settings.usecase';
import { UpdateAcademySettingsUseCase } from '../src/application/academy/use-cases/update-academy-settings.usecase';
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
import type { AcademyRepository } from '../src/domain/academy/ports/academy.repository';
import type { FeeDueRepository } from '../src/domain/fee/ports/fee-due.repository';
import type { TransactionLogRepository } from '../src/domain/fee/ports/transaction-log.repository';
import type { ClockPort } from '../src/application/common/clock.port';
import type { TransactionPort } from '../src/application/common/transaction.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('RBAC: Fees + Settings (e2e)', () => {
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
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-that-is-at-least-32-characters-long';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-that-is-at-least-32-characters-long';
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
      controllers: [FeesController, SettingsController],
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
        {
          provide: 'GET_ACADEMY_SETTINGS_USE_CASE',
          useFactory: (ur: UserRepository, ar: AcademyRepository) =>
            new GetAcademySettingsUseCase(ur, ar),
          inject: [USER_REPOSITORY, ACADEMY_REPOSITORY],
        },
        {
          provide: 'UPDATE_ACADEMY_SETTINGS_USE_CASE',
          useFactory: (ur: UserRepository, ar: AcademyRepository) =>
            new UpdateAcademySettingsUseCase(ur, ar),
          inject: [USER_REPOSITORY, ACADEMY_REPOSITORY],
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
  });

  function makeToken(sub: string, role: string) {
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

  describe('Unauthenticated', () => {
    it('should return 401 on fee endpoints', async () => {
      await request(app.getHttpServer()).get('/api/v1/fees/dues?month=2024-03').expect(401);
      await request(app.getHttpServer()).get('/api/v1/fees/paid?month=2024-03').expect(401);
      await request(app.getHttpServer()).put('/api/v1/fees/students/s1/2024-03/pay').expect(401);
    });

    it('should return 401 on settings endpoints', async () => {
      await request(app.getHttpServer()).get('/api/v1/settings/academy').expect(401);
      await request(app.getHttpServer())
        .put('/api/v1/settings/academy')
        .send({ defaultDueDateDay: 10 })
        .expect(401);
    });
  });

  describe('Staff RBAC', () => {
    it('should allow staff to view dues', async () => {
      await seedStaff();
      await seedAcademy();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .get('/api/v1/fees/dues?month=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should reject staff from marking paid (403)', async () => {
      await seedStaff();
      await seedOwner();
      await seedAcademy();
      await seedStudent('s1');
      await engine.execute({ academyId: 'academy-1', now: new Date('2024-03-10') });

      const staffToken = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .put('/api/v1/fees/students/s1/2024-03/pay')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });

    it('should allow staff to view settings but not update', async () => {
      await seedStaff();
      await seedAcademy();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .get('/api/v1/settings/academy')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .put('/api/v1/settings/academy')
        .set('Authorization', `Bearer ${token}`)
        .send({ defaultDueDateDay: 10 })
        .expect(403);
    });
  });
});
