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
  InMemoryFeeDueRepository,
  InMemoryStudentQueryRepository,
  InMemoryBatchRepository,
  InMemoryStudentBatchRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import { FeeDue } from '../src/domain/fee/entities/fee-due.entity';
import { STUDENT_QUERY_REPOSITORY } from '../src/domain/student/ports/student-query.repository';
import { BATCH_REPOSITORY } from '../src/domain/batch/ports/batch.repository';
import { STUDENT_BATCH_REPOSITORY } from '../src/domain/batch/ports/student-batch.repository';
import { SetStudentBatchesUseCase } from '../src/application/batch/use-cases/set-student-batches.usecase';
import { GetStudentBatchesUseCase } from '../src/application/batch/use-cases/get-student-batches.usecase';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { StudentRepository } from '../src/domain/student/ports/student.repository';
import type { StudentQueryRepository } from '../src/domain/student/ports/student-query.repository';
import type { BatchRepository } from '../src/domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '../src/domain/batch/ports/student-batch.repository';
import { toMonthKeyFromDate } from '../src/shared/date-utils';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Students Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let studentRepo: InMemoryStudentRepository;
  let feeDueRepo: InMemoryFeeDueRepository;
  let studentQueryRepo: InMemoryStudentQueryRepository;
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
    studentQueryRepo = new InMemoryStudentQueryRepository(studentRepo, feeDueRepo);
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
    feeDueRepo.clear();
  });

  function makeToken(sub = 'owner-1', role = 'OWNER') {
    return jwtService.sign(
      { sub, role, email: 'owner@test.com', tokenVersion: 0 },
      { secret: 'test-access-secret', expiresIn: 900 },
    );
  }

  async function seedOwner(id = 'owner-1', academyId = 'academy-1') {
    const user = User.create({
      id,
      fullName: 'Test Owner',
      email: 'owner@test.com',
      phoneNumber: '+919876543210',
      role: 'OWNER',
      passwordHash: 'hashed',
    });
    const withAcademy = User.reconstitute(id, { ...user['props'], academyId });
    await userRepo.save(withAcademy);
  }

  async function seedStaff(id = 'staff-1', academyId = 'academy-1') {
    const user = User.create({
      id,
      fullName: 'Test Staff',
      email: 'staff@test.com',
      phoneNumber: '+919876543211',
      role: 'STAFF',
      passwordHash: 'hashed',
    });
    const withAcademy = User.reconstitute(id, { ...user['props'], academyId });
    await userRepo.save(withAcademy);
  }

  const studentPayload = {
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

  describe('Owner Full CRUD Flow', () => {
    it('should create → list → get → update → change status → delete', async () => {
      await seedOwner();
      const token = makeToken();

      // 1. Create student
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send(studentPayload)
        .expect(201);

      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.fullName).toBe('Arun Sharma');
      expect(createRes.body.data.gender).toBe('MALE');
      expect(createRes.body.data.status).toBe('ACTIVE');
      expect(createRes.body.data.academyId).toBe('academy-1');
      expect(createRes.body.data.monthlyFee).toBe(500);
      const studentId = createRes.body.data.id;

      // 2. List students
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(listRes.body.data.data).toHaveLength(1);
      expect(listRes.body.data.meta.totalItems).toBe(1);

      // 3. Get student
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.data.fullName).toBe('Arun Sharma');

      // 4. Update student
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Arun Kumar', monthlyFee: 700 })
        .expect(200);

      expect(updateRes.body.data.fullName).toBe('Arun Kumar');
      expect(updateRes.body.data.monthlyFee).toBe(700);

      // 5. Change status
      const statusRes = await request(app.getHttpServer())
        .patch(`/api/v1/students/${studentId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      expect(statusRes.body.data.status).toBe('INACTIVE');

      // 6. Soft delete
      await request(app.getHttpServer())
        .delete(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Deleted student should not appear in list
      const listAfterDelete = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(listAfterDelete.body.data.data).toHaveLength(0);
    });
  });

  describe('Staff RBAC', () => {
    it('should allow staff to create and list students', async () => {
      await seedStaff();
      const staffToken = makeToken('staff-1', 'STAFF');

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${staffToken}`)
        .send(studentPayload)
        .expect(201);

      expect(createRes.body.success).toBe(true);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(listRes.body.data.data).toHaveLength(1);
    });

    it('should reject staff from changing student status (403)', async () => {
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

      await request(app.getHttpServer())
        .patch(`/api/v1/students/${studentId}/status`)
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

      const studentId = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/students/${studentId}`)
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

      const studentId = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ monthlyFee: 1000 })
        .expect(403);
    });
  });

  describe('Validation', () => {
    it('should reject missing fullName (400)', async () => {
      await seedOwner();
      const token = makeToken();
      const { fullName: _, ...payload } = studentPayload;
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(400);
    });

    it('should reject invalid gender (400)', async () => {
      await seedOwner();
      const token = makeToken();
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...studentPayload, gender: 'INVALID' })
        .expect(400);
    });

    it('should reject invalid pincode (400)', async () => {
      await seedOwner();
      const token = makeToken();
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...studentPayload,
          address: { ...studentPayload.address, pincode: '12345' },
        })
        .expect(400);
    });

    it('should reject invalid guardian mobile (400)', async () => {
      await seedOwner();
      const token = makeToken();
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...studentPayload,
          guardian: { ...studentPayload.guardian, mobile: 'not-valid' },
        })
        .expect(400);
    });

    it('should reject invalid dateOfBirth format (400)', async () => {
      await seedOwner();
      const token = makeToken();
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...studentPayload, dateOfBirth: 'not-a-date' })
        .expect(400);
    });

    it('should reject zero monthlyFee (400)', async () => {
      await seedOwner();
      const token = makeToken();
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...studentPayload, monthlyFee: 0 })
        .expect(400);
    });
  });

  describe('Pagination and Filtering', () => {
    it('should respect page and pageSize', async () => {
      await seedOwner();
      const token = makeToken();

      for (let i = 1; i <= 3; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/students')
          .set('Authorization', `Bearer ${token}`)
          .send({ ...studentPayload, fullName: `Student ${i}` })
          .expect(201);
      }

      const page1 = await request(app.getHttpServer())
        .get('/api/v1/students?page=1&pageSize=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(page1.body.data.data).toHaveLength(2);
      expect(page1.body.data.meta.totalItems).toBe(3);
      expect(page1.body.data.meta.totalPages).toBe(2);

      const page2 = await request(app.getHttpServer())
        .get('/api/v1/students?page=2&pageSize=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(page2.body.data.data).toHaveLength(1);
    });

    it('should filter by status', async () => {
      await seedOwner();
      const token = makeToken();

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send(studentPayload)
        .expect(201);

      const studentId = createRes.body.data.id;

      // Change status to INACTIVE
      await request(app.getHttpServer())
        .patch(`/api/v1/students/${studentId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      // Create another active student
      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...studentPayload, fullName: 'Active Student' })
        .expect(201);

      // Filter ACTIVE only
      const activeOnly = await request(app.getHttpServer())
        .get('/api/v1/students?status=ACTIVE')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(activeOnly.body.data.data).toHaveLength(1);
      expect(activeOnly.body.data.data[0].fullName).toBe('Active Student');
    });

    it('should search by name prefix', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...studentPayload, fullName: 'Arun Sharma' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...studentPayload, fullName: 'Priya Gupta' })
        .expect(201);

      const searchRes = await request(app.getHttpServer())
        .get('/api/v1/students?search=aru')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(searchRes.body.data.data).toHaveLength(1);
      expect(searchRes.body.data.data[0].fullName).toBe('Arun Sharma');
    });

    it('should return empty list when no students', async () => {
      await seedOwner();
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(0);
      expect(res.body.data.meta.totalItems).toBe(0);
    });
  });

  describe('Cross-academy isolation', () => {
    it('should not allow getting student from different academy', async () => {
      await seedOwner('owner-1', 'academy-1');
      const token1 = makeToken('owner-1', 'OWNER');

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token1}`)
        .send(studentPayload)
        .expect(201);

      const studentId = createRes.body.data.id;

      // Owner 2 from different academy
      const owner2 = User.create({
        id: 'owner-2',
        fullName: 'Other Owner',
        email: 'owner2@test.com',
        phoneNumber: '+919876543299',
        role: 'OWNER',
        passwordHash: 'hashed',
      });
      await userRepo.save(
        User.reconstitute('owner-2', { ...owner2['props'], academyId: 'academy-2' }),
      );

      const token2 = jwtService.sign(
        { sub: 'owner-2', role: 'OWNER', email: 'owner2@test.com', tokenVersion: 0 },
        { secret: 'test-access-secret', expiresIn: 900 },
      );

      await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(403);
    });
  });

  describe('Soft delete behavior', () => {
    it('should reject double delete (409)', async () => {
      await seedOwner();
      const token = makeToken();

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send(studentPayload)
        .expect(201);

      const studentId = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
    });

    it('should not return deleted student via GET', async () => {
      await seedOwner();
      const token = makeToken();

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send(studentPayload)
        .expect(201);

      const studentId = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('Fee Filter', () => {
    async function createStudentAndGetId(token: string, name: string): Promise<string> {
      const res = await request(app.getHttpServer())
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...studentPayload, fullName: name })
        .expect(201);
      return res.body.data.id;
    }

    async function seedFeeDue(
      studentId: string,
      monthKey: string,
      status: 'UPCOMING' | 'DUE' | 'PAID',
    ) {
      let feeDue = FeeDue.create({
        id: `fd-${studentId}-${monthKey}`,
        academyId: 'academy-1',
        studentId,
        monthKey,
        dueDate: `${monthKey}-05`,
        amount: 500,
      });

      if (status === 'DUE') {
        feeDue = feeDue.flipToDue();
      } else if (status === 'PAID') {
        feeDue = feeDue.flipToDue().markPaid('owner-1', new Date());
      }

      await feeDueRepo.save(feeDue);
    }

    it('?feeFilter=DUE returns only students with UPCOMING/DUE fee dues for current month', async () => {
      await seedOwner();
      const token = makeToken();
      const monthKey = toMonthKeyFromDate(new Date());

      const s1 = await createStudentAndGetId(token, 'Due Student');
      const s2 = await createStudentAndGetId(token, 'Paid Student');

      await seedFeeDue(s1, monthKey, 'DUE');
      await seedFeeDue(s2, monthKey, 'PAID');

      const res = await request(app.getHttpServer())
        .get('/api/v1/students?feeFilter=DUE')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.data[0].fullName).toBe('Due Student');
    });

    it('?feeFilter=PAID returns only students with PAID fee dues', async () => {
      await seedOwner();
      const token = makeToken();
      const monthKey = toMonthKeyFromDate(new Date());

      const s1 = await createStudentAndGetId(token, 'Due Student');
      const s2 = await createStudentAndGetId(token, 'Paid Student');

      await seedFeeDue(s1, monthKey, 'DUE');
      await seedFeeDue(s2, monthKey, 'PAID');

      const res = await request(app.getHttpServer())
        .get('/api/v1/students?feeFilter=PAID')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.data[0].fullName).toBe('Paid Student');
    });

    it('?feeFilter=ALL returns all students', async () => {
      await seedOwner();
      const token = makeToken();
      const monthKey = toMonthKeyFromDate(new Date());

      await createStudentAndGetId(token, 'Student A');
      const s2 = await createStudentAndGetId(token, 'Student B');
      await seedFeeDue(s2, monthKey, 'DUE');

      const res = await request(app.getHttpServer())
        .get('/api/v1/students?feeFilter=ALL')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(2);
    });

    it('?month=YYYY-MM scopes to that specific month', async () => {
      await seedOwner();
      const token = makeToken();

      const s1 = await createStudentAndGetId(token, 'Jan Student');
      await seedFeeDue(s1, '2025-01', 'DUE');

      const res = await request(app.getHttpServer())
        .get('/api/v1/students?feeFilter=DUE&month=2025-01')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(1);

      const resOther = await request(app.getHttpServer())
        .get('/api/v1/students?feeFilter=DUE&month=2025-02')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(resOther.body.data.data).toHaveLength(0);
    });

    it('student with no fee due for month is excluded from DUE/PAID results', async () => {
      await seedOwner();
      const token = makeToken();

      await createStudentAndGetId(token, 'No Fee Student');

      const res = await request(app.getHttpServer())
        .get('/api/v1/students?feeFilter=DUE')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(0);
    });

    it('combines feeFilter with status and search', async () => {
      await seedOwner();
      const token = makeToken();
      const monthKey = toMonthKeyFromDate(new Date());

      const s1 = await createStudentAndGetId(token, 'Test Alpha');
      const s2 = await createStudentAndGetId(token, 'Test Beta');

      await seedFeeDue(s1, monthKey, 'DUE');
      await seedFeeDue(s2, monthKey, 'DUE');

      const res = await request(app.getHttpServer())
        .get('/api/v1/students?feeFilter=DUE&status=ACTIVE&search=test a')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(1);
      expect(res.body.data.data[0].fullName).toBe('Test Alpha');
    });
  });
});
