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
import { StudentsController } from '../src/presentation/http/students/students.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { STUDENT_REPOSITORY } from '../src/domain/student/ports/student.repository';
import { STUDENT_QUERY_REPOSITORY } from '../src/domain/student/ports/student-query.repository';
import { BATCH_REPOSITORY } from '../src/domain/batch/ports/batch.repository';
import { STUDENT_BATCH_REPOSITORY } from '../src/domain/batch/ports/student-batch.repository';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { CreateStudentUseCase } from '../src/application/student/use-cases/create-student.usecase';
import { UpdateStudentUseCase } from '../src/application/student/use-cases/update-student.usecase';
import { ListStudentsUseCase } from '../src/application/student/use-cases/list-students.usecase';
import { GetStudentUseCase } from '../src/application/student/use-cases/get-student.usecase';
import { ChangeStudentStatusUseCase } from '../src/application/student/use-cases/change-student-status.usecase';
import { SoftDeleteStudentUseCase } from '../src/application/student/use-cases/soft-delete-student.usecase';
import { SetStudentBatchesUseCase } from '../src/application/batch/use-cases/set-student-batches.usecase';
import { GetStudentBatchesUseCase } from '../src/application/batch/use-cases/get-student-batches.usecase';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
  InMemoryFeeDueRepository,
  InMemoryStudentQueryRepository,
  InMemoryBatchRepository,
  InMemoryStudentBatchRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import { Batch } from '../src/domain/batch/entities/batch.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { StudentRepository } from '../src/domain/student/ports/student.repository';
import type { StudentQueryRepository } from '../src/domain/student/ports/student-query.repository';
import type { BatchRepository } from '../src/domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '../src/domain/batch/ports/student-batch.repository';
import { configureApiVersioning } from '../src/shared/config/api-versioning';
describe('Student Batches Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let studentRepo: InMemoryStudentRepository;
  let batchRepo: InMemoryBatchRepository;
  let studentBatchRepo: InMemoryStudentBatchRepository;
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
    batchRepo = new InMemoryBatchRepository();
    studentBatchRepo = new InMemoryStudentBatchRepository();
    const feeDueRepo = new InMemoryFeeDueRepository();
    const studentQueryRepo = new InMemoryStudentQueryRepository(studentRepo, feeDueRepo);
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const noOpAuditRecorder = { record: async () => {} };

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [StudentsController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: STUDENT_QUERY_REPOSITORY, useValue: studentQueryRepo },
        { provide: BATCH_REPOSITORY, useValue: batchRepo },
        { provide: STUDENT_BATCH_REPOSITORY, useValue: studentBatchRepo },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'CREATE_STUDENT_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository) =>
            new CreateStudentUseCase(ur, sr, noOpAuditRecorder),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY],
        },
        {
          provide: 'UPDATE_STUDENT_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository) =>
            new UpdateStudentUseCase(ur, sr, noOpAuditRecorder),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY],
        },
        {
          provide: 'LIST_STUDENTS_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository, sqr: StudentQueryRepository) =>
            new ListStudentsUseCase(ur, sr, sqr),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, STUDENT_QUERY_REPOSITORY],
        },
        {
          provide: 'GET_STUDENT_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository) => new GetStudentUseCase(ur, sr),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY],
        },
        {
          provide: 'CHANGE_STUDENT_STATUS_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository) =>
            new ChangeStudentStatusUseCase(ur, sr, noOpAuditRecorder),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY],
        },
        {
          provide: 'SOFT_DELETE_STUDENT_USE_CASE',
          useFactory: (ur: UserRepository, sr: StudentRepository) =>
            new SoftDeleteStudentUseCase(ur, sr, noOpAuditRecorder),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY],
        },
        {
          provide: 'SET_STUDENT_BATCHES_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            br: BatchRepository,
            sbr: StudentBatchRepository,
          ) => new SetStudentBatchesUseCase(ur, sr, br, sbr),
          inject: [USER_REPOSITORY, STUDENT_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY],
        },
        {
          provide: 'GET_STUDENT_BATCHES_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            br: BatchRepository,
            sbr: StudentBatchRepository,
          ) => new GetStudentBatchesUseCase(ur, sr, br, sbr),
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

  let ownerToken: string;
  const academyId = 'academy-1';

  function seedOwner() {
    const owner = User.create({
      id: 'owner-1',
      fullName: 'Owner',
      email: 'owner@example.com',
      phoneNumber: '+919876543210',
      role: 'OWNER',
      passwordHash: 'hash',
    });
    const withAcademy = User.reconstitute('owner-1', { ...owner['props'], academyId });
    userRepo.save(withAcademy);
    ownerToken = jwtService.sign(
      { sub: 'owner-1', email: 'owner@example.com', role: 'OWNER', academyId, tokenVersion: 0 },
      { secret: 'test-access-secret', expiresIn: 900 },
    );
  }

  function seedBatch(id: string, name: string) {
    const batch = Batch.create({
      id,
      academyId,
      batchName: name,
      days: ['MON', 'WED', 'FRI'],
    });
    batchRepo.save(batch);
    return batch;
  }

  async function createTestStudent(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Test Student',
        dateOfBirth: '2010-01-01',
        gender: 'MALE',
        address: {
          line1: '123 Street',
          city: 'Mumbai',
          state: 'MH',
          pincode: '400001',
        },
        guardian: {
          name: 'Parent',
          mobile: '+919876543211',
          email: 'parent@example.com',
        },
        joiningDate: '2024-01-15',
        monthlyFee: 1000,
      })
      .expect(201);
    return res.body.data.id;
  }

  beforeEach(() => {
    userRepo.clear();
    studentRepo.clear();
    batchRepo.clear();
    studentBatchRepo.clear();
    seedOwner();
  });

  describe('PUT /api/v1/students/:studentId/batches', () => {
    it('should assign batches to a student', async () => {
      const studentId = await createTestStudent();
      seedBatch('batch-1', 'Morning');
      seedBatch('batch-2', 'Evening');

      const res = await request(app.getHttpServer())
        .put(`/api/v1/students/${studentId}/batches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ batchIds: ['batch-1', 'batch-2'] })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.map((b: { id: string }) => b.id).sort()).toEqual(
        ['batch-1', 'batch-2'].sort(),
      );
    });

    it('should replace existing assignments', async () => {
      const studentId = await createTestStudent();
      seedBatch('batch-1', 'Morning');
      seedBatch('batch-2', 'Evening');
      seedBatch('batch-3', 'Weekend');

      // First assignment
      await request(app.getHttpServer())
        .put(`/api/v1/students/${studentId}/batches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ batchIds: ['batch-1', 'batch-2'] })
        .expect(200);

      // Replace
      const res = await request(app.getHttpServer())
        .put(`/api/v1/students/${studentId}/batches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ batchIds: ['batch-3'] })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('batch-3');
    });

    it('should clear all assignments with empty array', async () => {
      const studentId = await createTestStudent();
      seedBatch('batch-1', 'Morning');

      await request(app.getHttpServer())
        .put(`/api/v1/students/${studentId}/batches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ batchIds: ['batch-1'] })
        .expect(200);

      const res = await request(app.getHttpServer())
        .put(`/api/v1/students/${studentId}/batches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ batchIds: [] })
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it('should return 404 for non-existent student', async () => {
      seedBatch('batch-1', 'Morning');

      await request(app.getHttpServer())
        .put('/api/v1/students/non-existent/batches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ batchIds: ['batch-1'] })
        .expect(404);
    });

    it('should return 400 for batch not in academy', async () => {
      const studentId = await createTestStudent();

      await request(app.getHttpServer())
        .put(`/api/v1/students/${studentId}/batches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ batchIds: ['non-existent-batch'] })
        .expect(400);
    });

    it('should deduplicate batch IDs', async () => {
      const studentId = await createTestStudent();
      seedBatch('batch-1', 'Morning');

      const res = await request(app.getHttpServer())
        .put(`/api/v1/students/${studentId}/batches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ batchIds: ['batch-1', 'batch-1'] })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/v1/students/:studentId/batches', () => {
    it('should return assigned batches', async () => {
      const studentId = await createTestStudent();
      seedBatch('batch-1', 'Morning');
      seedBatch('batch-2', 'Evening');

      await request(app.getHttpServer())
        .put(`/api/v1/students/${studentId}/batches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ batchIds: ['batch-1', 'batch-2'] })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/batches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return empty array for unassigned student', async () => {
      const studentId = await createTestStudent();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/batches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it('should return 404 for non-existent student', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/students/non-existent/batches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/students/any-id/batches')
        .expect(401);
    });
  });
});
