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
import { StudentsController } from '../../src/presentation/http/students/students.controller';
import { SubscriptionController } from '../../src/presentation/http/subscription/subscription.controller';
import { USER_REPOSITORY } from '../../src/domain/identity/ports/user.repository';
import { STUDENT_REPOSITORY } from '../../src/domain/student/ports/student.repository';
import { STUDENT_QUERY_REPOSITORY } from '../../src/domain/student/ports/student-query.repository';
import { ACADEMY_REPOSITORY } from '../../src/domain/academy/ports/academy.repository';
import { SUBSCRIPTION_REPOSITORY } from '../../src/domain/subscription/ports/subscription.repository';
import { AUDIT_RECORDER_PORT } from '../../src/application/audit/ports/audit-recorder.port';
import { CLOCK_PORT } from '../../src/application/common/clock.port';
import { TOKEN_SERVICE } from '../../src/application/identity/ports/token-service.port';
import { LOGGER_PORT } from '../../src/shared/logging/logger.port';
import { CreateStudentUseCase } from '../../src/application/student/use-cases/create-student.usecase';
import { ListStudentsUseCase } from '../../src/application/student/use-cases/list-students.usecase';
import { GetStudentUseCase } from '../../src/application/student/use-cases/get-student.usecase';
import { UpdateStudentUseCase } from '../../src/application/student/use-cases/update-student.usecase';
import { ChangeStudentStatusUseCase } from '../../src/application/student/use-cases/change-student-status.usecase';
import { SoftDeleteStudentUseCase } from '../../src/application/student/use-cases/soft-delete-student.usecase';
import { GetMySubscriptionUseCase } from '../../src/application/subscription/use-cases/get-my-subscription.usecase';
import { CreateTrialSubscriptionUseCase } from '../../src/application/subscription/use-cases/create-trial-subscription.usecase';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
  InMemoryStudentQueryRepository,
  InMemoryAcademyRepository,
  InMemorySubscriptionRepository,
  InMemoryFeeDueRepository,
  InMemoryBatchRepository,
  InMemoryStudentBatchRepository,
} from '../helpers/in-memory-repos';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../../src/presentation/http/common/guards/jwt-auth.guard';
import { SubscriptionEnforcementGuard } from '../../src/presentation/http/common/guards/subscription-enforcement.guard';
import { createTestTokenService } from '../helpers/test-services';
import { User } from '../../src/domain/identity/entities/user.entity';
import { Academy } from '../../src/domain/academy/entities/academy.entity';
import { Subscription } from '../../src/domain/subscription/entities/subscription.entity';
import { BATCH_REPOSITORY } from '../../src/domain/batch/ports/batch.repository';
import { STUDENT_BATCH_REPOSITORY } from '../../src/domain/batch/ports/student-batch.repository';
import { SetStudentBatchesUseCase } from '../../src/application/batch/use-cases/set-student-batches.usecase';
import { GetStudentBatchesUseCase } from '../../src/application/batch/use-cases/get-student-batches.usecase';
import type { UserRepository } from '../../src/domain/identity/ports/user.repository';
import type { StudentRepository } from '../../src/domain/student/ports/student.repository';
import type { AcademyRepository } from '../../src/domain/academy/ports/academy.repository';
import type { SubscriptionRepository } from '../../src/domain/subscription/ports/subscription.repository';
import type { BatchRepository } from '../../src/domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '../../src/domain/batch/ports/student-batch.repository';
import type { ClockPort } from '../../src/application/common/clock.port';
import type { AuditRecorderPort } from '../../src/application/audit/ports/audit-recorder.port';
import { configureApiVersioning } from '../../src/shared/config/api-versioning';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Subscription Gating (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let studentRepo: InMemoryStudentRepository;
  let academyRepo: InMemoryAcademyRepository;
  let subscriptionRepo: InMemorySubscriptionRepository;
  let jwtService: JwtService;
  let clock: { now: () => Date };

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
    subscriptionRepo = new InMemorySubscriptionRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    clock = { now: () => new Date() };
    const feeDueRepo = new InMemoryFeeDueRepository();
    const studentQueryRepo = new InMemoryStudentQueryRepository(studentRepo, feeDueRepo);
    const batchRepo = new InMemoryBatchRepository();
    const studentBatchRepo = new InMemoryStudentBatchRepository();
    const noOpAuditRecorder = { record: async () => {} };
    const noOpLogger = {
      log: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
      verbose: () => {},
    };

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [StudentsController, SubscriptionController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: STUDENT_QUERY_REPOSITORY, useValue: studentQueryRepo },
        { provide: ACADEMY_REPOSITORY, useValue: academyRepo },
        { provide: SUBSCRIPTION_REPOSITORY, useValue: subscriptionRepo },
        { provide: BATCH_REPOSITORY, useValue: batchRepo },
        { provide: STUDENT_BATCH_REPOSITORY, useValue: studentBatchRepo },
        { provide: AUDIT_RECORDER_PORT, useValue: noOpAuditRecorder },
        { provide: CLOCK_PORT, useValue: clock },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        { provide: LOGGER_PORT, useValue: noOpLogger },
        {
          provide: 'CREATE_TRIAL_SUBSCRIPTION_USE_CASE',
          useFactory: (repo: SubscriptionRepository, c: ClockPort) =>
            new CreateTrialSubscriptionUseCase(repo, c),
          inject: [SUBSCRIPTION_REPOSITORY, CLOCK_PORT],
        },
        {
          provide: 'GET_MY_SUBSCRIPTION_USE_CASE',
          useFactory: (
            ur: UserRepository,
            ar: AcademyRepository,
            sr: SubscriptionRepository,
            ct: CreateTrialSubscriptionUseCase,
            c: ClockPort,
          ) => new GetMySubscriptionUseCase(ur, ar, sr, ct, c),
          inject: [
            USER_REPOSITORY,
            ACADEMY_REPOSITORY,
            SUBSCRIPTION_REPOSITORY,
            'CREATE_TRIAL_SUBSCRIPTION_USE_CASE',
            CLOCK_PORT,
          ],
        },
        {
          provide: APP_GUARD,
          useClass: JwtAuthGuard,
        },
        {
          provide: APP_GUARD,
          useClass: SubscriptionEnforcementGuard,
        },
        {
          provide: 'CREATE_STUDENT_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, audit: AuditRecorderPort) =>
            new CreateStudentUseCase(ur, sr, audit),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, AUDIT_RECORDER_PORT],
        },
        {
          provide: 'LIST_STUDENTS_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository) =>
            new ListStudentsUseCase(ur, sr),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY],
        },
        {
          provide: 'GET_STUDENT_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository) => new GetStudentUseCase(ur, sr),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY],
        },
        {
          provide: 'UPDATE_STUDENT_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, audit: AuditRecorderPort) =>
            new UpdateStudentUseCase(ur, sr, audit),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, AUDIT_RECORDER_PORT],
        },
        {
          provide: 'CHANGE_STUDENT_STATUS_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, audit: AuditRecorderPort) =>
            new ChangeStudentStatusUseCase(ur, sr, audit),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, AUDIT_RECORDER_PORT],
        },
        {
          provide: 'SOFT_DELETE_STUDENT_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, audit: AuditRecorderPort) =>
            new SoftDeleteStudentUseCase(ur, sr, audit),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, AUDIT_RECORDER_PORT],
        },
        {
          provide: 'SET_STUDENT_BATCHES_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, br: BatchRepository, sbr: StudentBatchRepository) =>
            new SetStudentBatchesUseCase(ur, sr, br, sbr),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY],
        },
        {
          provide: 'GET_STUDENT_BATCHES_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, br: BatchRepository, sbr: StudentBatchRepository) =>
            new GetStudentBatchesUseCase(ur, sr, br, sbr),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY],
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
    subscriptionRepo.clear();
    clock.now = () => new Date();
  });

  function makeToken(sub = 'owner-1', role = 'OWNER') {
    return jwtService.sign(
      { sub, role, email: `${sub}@test.com`, tokenVersion: 0 },
      { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
    );
  }

  async function seedOwnerWithAcademy() {
    const user = User.create({
      id: 'owner-1',
      fullName: 'Test Owner',
      email: 'owner-1@test.com',
      phoneNumber: '+919876543210',
      role: 'OWNER',
      passwordHash: 'hashed',
    });
    await userRepo.save(User.reconstitute('owner-1', { ...user['props'], academyId: 'academy-1' }));

    const academy = Academy.create({
      id: 'academy-1',
      ownerUserId: 'owner-1',
      academyName: 'Test Academy',
      address: { line1: '1 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
    });
    await academyRepo.save(academy);
  }

  describe('Expired subscription blocks student CRUD', () => {
    it('should return 403 when subscription is expired and accessing students', async () => {
      await seedOwnerWithAcademy();

      // Seed an expired trial
      const sub = Subscription.createTrial({
        id: 'sub-1',
        academyId: 'academy-1',
        trialStartAt: new Date(Date.now() - 40 * DAY_MS),
        trialEndAt: new Date(Date.now() - 10 * DAY_MS),
      });
      await subscriptionRepo.save(sub);

      const token = makeToken();
      await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 403 when creating student with blocked subscription', async () => {
      await seedOwnerWithAcademy();

      const sub = Subscription.createTrial({
        id: 'sub-1',
        academyId: 'academy-1',
        trialStartAt: new Date(Date.now() - 40 * DAY_MS),
        trialEndAt: new Date(Date.now() - 10 * DAY_MS),
      });
      await subscriptionRepo.save(sub);

      const token = makeToken();
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Test Student',
          dateOfBirth: '2010-01-01',
          gender: 'MALE',
          address: { line1: '1 St', city: 'C', state: 'S', pincode: '400001' },
          guardian: { name: 'P', mobile: '+919876543210', email: 'p@t.com' },
          joiningDate: '2024-01-01',
          monthlyFee: 500,
        })
        .expect(403);
    });
  });

  describe('Active subscription allows access', () => {
    it('should allow student list with active trial', async () => {
      await seedOwnerWithAcademy();

      // Active trial (expires 30 days from now)
      const sub = Subscription.createTrial({
        id: 'sub-1',
        academyId: 'academy-1',
        trialStartAt: new Date(),
        trialEndAt: new Date(Date.now() + 30 * DAY_MS),
      });
      await subscriptionRepo.save(sub);

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('Subscription endpoint remains accessible when blocked', () => {
    it('should allow GET /subscription/me even with expired subscription', async () => {
      await seedOwnerWithAcademy();

      const sub = Subscription.createTrial({
        id: 'sub-1',
        academyId: 'academy-1',
        trialStartAt: new Date(Date.now() - 40 * DAY_MS),
        trialEndAt: new Date(Date.now() - 10 * DAY_MS),
      });
      await subscriptionRepo.save(sub);

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get('/api/v1/subscription/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.status).toBe('BLOCKED');
      expect(res.body.data.canAccessApp).toBe(false);
    });
  });

  describe('Unauthenticated access', () => {
    it('should return 401 for students without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/students').expect(401);
    });
  });
});
