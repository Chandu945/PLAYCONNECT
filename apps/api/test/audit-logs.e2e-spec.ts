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
import type { LoggerPort } from '../src/shared/logging/logger.port';
import { LOGGER_PORT } from '../src/shared/logging/logger.port';
import { AuditLogsController } from '../src/presentation/http/audit-logs/audit-logs.controller';
import { StudentsController } from '../src/presentation/http/students/students.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { STUDENT_REPOSITORY } from '../src/domain/student/ports/student.repository';
import { AUDIT_LOG_REPOSITORY } from '../src/domain/audit/ports/audit-log.repository';
import { AUDIT_RECORDER_PORT } from '../src/application/audit/ports/audit-recorder.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { ListAuditLogsUseCase } from '../src/application/audit/use-cases/list-audit-logs.usecase';
import { AuditRecorderService } from '../src/application/audit/services/audit-recorder.service';
import { CreateStudentUseCase } from '../src/application/student/use-cases/create-student.usecase';
import { UpdateStudentUseCase } from '../src/application/student/use-cases/update-student.usecase';
import { ListStudentsUseCase } from '../src/application/student/use-cases/list-students.usecase';
import { GetStudentUseCase } from '../src/application/student/use-cases/get-student.usecase';
import { ChangeStudentStatusUseCase } from '../src/application/student/use-cases/change-student-status.usecase';
import { SoftDeleteStudentUseCase } from '../src/application/student/use-cases/soft-delete-student.usecase';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
  InMemoryAuditLogRepository,
  InMemoryBatchRepository,
  InMemoryStudentBatchRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import { BATCH_REPOSITORY } from '../src/domain/batch/ports/batch.repository';
import { STUDENT_BATCH_REPOSITORY } from '../src/domain/batch/ports/student-batch.repository';
import { SetStudentBatchesUseCase } from '../src/application/batch/use-cases/set-student-batches.usecase';
import { GetStudentBatchesUseCase } from '../src/application/batch/use-cases/get-student-batches.usecase';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { StudentRepository } from '../src/domain/student/ports/student.repository';
import type { AuditLogRepository } from '../src/domain/audit/ports/audit-log.repository';
import type { AuditRecorderPort } from '../src/application/audit/ports/audit-recorder.port';
import type { BatchRepository } from '../src/domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '../src/domain/batch/ports/student-batch.repository';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Audit Logs Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let studentRepo: InMemoryStudentRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
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
    auditLogRepo = new InMemoryAuditLogRepository();
    const batchRepo = new InMemoryBatchRepository();
    const studentBatchRepo = new InMemoryStudentBatchRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [AuditLogsController, StudentsController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: AUDIT_LOG_REPOSITORY, useValue: auditLogRepo },
        { provide: BATCH_REPOSITORY, useValue: batchRepo },
        { provide: STUDENT_BATCH_REPOSITORY, useValue: studentBatchRepo },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: AUDIT_RECORDER_PORT,
          useFactory: (repo: AuditLogRepository, logger: LoggerPort) =>
            new AuditRecorderService(repo, logger),
          inject: [AUDIT_LOG_REPOSITORY, LOGGER_PORT],
        },
        {
          provide: 'LIST_AUDIT_LOGS_USE_CASE',
          useFactory: (ur: UserRepository, alr: AuditLogRepository) =>
            new ListAuditLogsUseCase(ur, alr),
          inject: [USER_REPOSITORY, AUDIT_LOG_REPOSITORY],
        },
        {
          provide: 'CREATE_STUDENT_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, audit: AuditRecorderPort) =>
            new CreateStudentUseCase(ur, sr, audit),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, AUDIT_RECORDER_PORT],
        },
        {
          provide: 'UPDATE_STUDENT_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, audit: AuditRecorderPort) =>
            new UpdateStudentUseCase(ur, sr, audit),
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
    auditLogRepo.clear();
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

  const studentBody = {
    fullName: 'Arun Sharma',
    dateOfBirth: '2010-05-15',
    gender: 'MALE',
    address: {
      line1: '123 Main Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
    guardian: {
      name: 'Raj Sharma',
      mobile: '+919876543210',
      email: 'raj@example.com',
    },
    joiningDate: '2024-01-01',
    monthlyFee: 500,
  };

  describe('Create student triggers audit log', () => {
    it('should create STUDENT_CREATED audit log entry when creating a student', async () => {
      await seedOwner();
      const token = makeToken();

      // Create a student
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send(studentBody)
        .expect(201);

      expect(createRes.body.success).toBe(true);

      // List audit logs
      const auditRes = await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(auditRes.body.success).toBe(true);
      expect(auditRes.body.data.items.length).toBeGreaterThanOrEqual(1);

      const entry = auditRes.body.data.items.find(
        (e: { action: string }) => e.action === 'STUDENT_CREATED',
      );
      expect(entry).toBeDefined();
      expect(entry.entityType).toBe('STUDENT');
      expect(entry.actorUserId).toBe('owner-1');
      expect(entry.academyId).toBe('academy-1');
    });
  });

  describe('Pagination', () => {
    it('should paginate audit logs', async () => {
      await seedOwner();
      const token = makeToken();

      // Create 3 students
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/students')
          .set('Authorization', `Bearer ${token}`)
          .send({ ...studentBody, fullName: `Student ${i}` })
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs?page=1&pageSize=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.meta.totalItems).toBe(3);
      expect(res.body.data.meta.totalPages).toBe(2);
    });
  });

  describe('Action filter', () => {
    it('should filter by action', async () => {
      await seedOwner();
      const token = makeToken();

      // Create a student
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send(studentBody)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs?action=STUDENT_CREATED')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].action).toBe('STUDENT_CREATED');

      // Filter by non-matching action
      const res2 = await request(app.getHttpServer())
        .get('/api/v1/audit-logs?action=STUDENT_DELETED')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res2.body.data.items).toHaveLength(0);
    });
  });

  describe('Empty list', () => {
    it('should return empty list when no audit logs exist', async () => {
      await seedOwner();
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.meta.totalItems).toBe(0);
    });
  });
});
