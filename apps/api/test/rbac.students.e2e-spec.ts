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
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { CreateStudentUseCase } from '../src/application/student/use-cases/create-student.usecase';
import { UpdateStudentUseCase } from '../src/application/student/use-cases/update-student.usecase';
import { ListStudentsUseCase } from '../src/application/student/use-cases/list-students.usecase';
import { GetStudentUseCase } from '../src/application/student/use-cases/get-student.usecase';
import { ChangeStudentStatusUseCase } from '../src/application/student/use-cases/change-student-status.usecase';
import { SoftDeleteStudentUseCase } from '../src/application/student/use-cases/soft-delete-student.usecase';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
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
import type { BatchRepository } from '../src/domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '../src/domain/batch/ports/student-batch.repository';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('RBAC — Students Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let studentRepo: InMemoryStudentRepository;
  let jwtService: JwtService;

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
    const batchRepo = new InMemoryBatchRepository();
    const studentBatchRepo = new InMemoryStudentBatchRepository();
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

  const studentPayload = {
    fullName: 'Test Student',
    dateOfBirth: '2010-05-15',
    gender: 'MALE',
    address: {
      line1: '123 Main Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
    guardian: {
      name: 'Parent Name',
      mobile: '+919876543210',
      email: 'parent@example.com',
    },
    joiningDate: '2024-01-01',
    monthlyFee: 500,
  };

  describe('Unauthenticated access', () => {
    it('should reject unauthenticated requests (401)', async () => {
      await request(app.getHttpServer()).get('/api/v1/students').expect(401);
    });
  });

  describe('Staff — allowed operations', () => {
    it('should allow staff to create students', async () => {
      await seedStaff();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send(studentPayload)
        .expect(201);
    });

    it('should allow staff to list students', async () => {
      await seedStaff();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should allow staff to update student (except fee)', async () => {
      await seedOwner();
      await seedStaff();
      const ownerToken = makeToken('owner-1', 'OWNER');
      const staffToken = makeToken('staff-1', 'STAFF');

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(studentPayload)
        .expect(201);

      const studentId = createRes.body.data.id;

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ fullName: 'Updated Name' })
        .expect(200);

      expect(updateRes.body.data.fullName).toBe('Updated Name');
    });
  });

  describe('Staff — forbidden operations', () => {
    it('should reject staff from changing status (403)', async () => {
      await seedOwner();
      await seedStaff();
      const ownerToken = makeToken('owner-1', 'OWNER');
      const staffToken = makeToken('staff-1', 'STAFF');

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(studentPayload)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/students/${createRes.body.data.id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'INACTIVE' })
        .expect(403);
    });

    it('should reject staff from deleting students (403)', async () => {
      await seedOwner();
      await seedStaff();
      const ownerToken = makeToken('owner-1', 'OWNER');
      const staffToken = makeToken('staff-1', 'STAFF');

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(studentPayload)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/students/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });

    it('should reject staff from changing monthly fee (403)', async () => {
      await seedOwner();
      await seedStaff();
      const ownerToken = makeToken('owner-1', 'OWNER');
      const staffToken = makeToken('staff-1', 'STAFF');

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(studentPayload)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/students/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ monthlyFee: 1000 })
        .expect(403);
    });
  });
});
