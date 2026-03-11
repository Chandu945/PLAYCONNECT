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
import { BatchesController } from '../src/presentation/http/batches/batches.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { BATCH_REPOSITORY } from '../src/domain/batch/ports/batch.repository';
import { STUDENT_REPOSITORY } from '../src/domain/student/ports/student.repository';
import { STUDENT_BATCH_REPOSITORY } from '../src/domain/batch/ports/student-batch.repository';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { CreateBatchUseCase } from '../src/application/batch/use-cases/create-batch.usecase';
import { UpdateBatchUseCase } from '../src/application/batch/use-cases/update-batch.usecase';
import { ListBatchesUseCase } from '../src/application/batch/use-cases/list-batches.usecase';
import { GetBatchUseCase } from '../src/application/batch/use-cases/get-batch.usecase';
import { ListBatchStudentsUseCase } from '../src/application/batch/use-cases/list-batch-students.usecase';
import { AddStudentToBatchUseCase } from '../src/application/batch/use-cases/add-student-to-batch.usecase';
import { RemoveStudentFromBatchUseCase } from '../src/application/batch/use-cases/remove-student-from-batch.usecase';
import { DeleteBatchUseCase } from '../src/application/batch/use-cases/delete-batch.usecase';
import { UploadBatchPhotoUseCase } from '../src/application/batch/use-cases/upload-batch-photo.usecase';
import { FILE_STORAGE_PORT } from '../src/application/common/ports/file-storage.port';
import {
  InMemoryUserRepository,
  InMemoryBatchRepository,
  InMemoryStudentRepository,
  InMemoryStudentBatchRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { BatchRepository } from '../src/domain/batch/ports/batch.repository';
import type { StudentRepository } from '../src/domain/student/ports/student.repository';
import type { StudentBatchRepository } from '../src/domain/batch/ports/student-batch.repository';
import type { FileStoragePort } from '../src/application/common/ports/file-storage.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Batches Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let batchRepo: InMemoryBatchRepository;
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
    batchRepo = new InMemoryBatchRepository();
    const studentRepo = new InMemoryStudentRepository();
    const studentBatchRepo = new InMemoryStudentBatchRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const mockFileStorage: FileStoragePort = {
      upload: jest.fn().mockResolvedValue('https://example.com/photo.jpg'),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [BatchesController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: BATCH_REPOSITORY, useValue: batchRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: STUDENT_BATCH_REPOSITORY, useValue: studentBatchRepo },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'CREATE_BATCH_USE_CASE',
          useFactory: (ur: UserRepository, br: BatchRepository) => new CreateBatchUseCase(ur, br),
          inject: [USER_REPOSITORY, BATCH_REPOSITORY],
        },
        {
          provide: 'UPDATE_BATCH_USE_CASE',
          useFactory: (ur: UserRepository, br: BatchRepository) => new UpdateBatchUseCase(ur, br),
          inject: [USER_REPOSITORY, BATCH_REPOSITORY],
        },
        {
          provide: 'LIST_BATCHES_USE_CASE',
          useFactory: (ur: UserRepository, br: BatchRepository, sbr: StudentBatchRepository) =>
            new ListBatchesUseCase(ur, br, sbr),
          inject: [USER_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY],
        },
        {
          provide: 'GET_BATCH_USE_CASE',
          useFactory: (ur: UserRepository, br: BatchRepository) => new GetBatchUseCase(ur, br),
          inject: [USER_REPOSITORY, BATCH_REPOSITORY],
        },
        {
          provide: 'LIST_BATCH_STUDENTS_USE_CASE',
          useFactory: (ur: UserRepository, br: BatchRepository, sbr: StudentBatchRepository, sr: StudentRepository) =>
            new ListBatchStudentsUseCase(ur, br, sbr, sr),
          inject: [USER_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY, STUDENT_REPOSITORY],
        },
        {
          provide: 'ADD_STUDENT_TO_BATCH_USE_CASE',
          useFactory: (ur: UserRepository, br: BatchRepository, sbr: StudentBatchRepository, sr: StudentRepository) =>
            new AddStudentToBatchUseCase(ur, br, sbr, sr),
          inject: [USER_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY, STUDENT_REPOSITORY],
        },
        {
          provide: 'REMOVE_STUDENT_FROM_BATCH_USE_CASE',
          useFactory: (ur: UserRepository, br: BatchRepository, sbr: StudentBatchRepository, sr: StudentRepository) =>
            new RemoveStudentFromBatchUseCase(ur, br, sbr, sr),
          inject: [USER_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY, STUDENT_REPOSITORY],
        },
        {
          provide: 'DELETE_BATCH_USE_CASE',
          useFactory: (ur: UserRepository, br: BatchRepository, sbr: StudentBatchRepository) =>
            new DeleteBatchUseCase(ur, br, sbr),
          inject: [USER_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY],
        },
        {
          provide: 'UPLOAD_BATCH_PHOTO_USE_CASE',
          useFactory: (ur: UserRepository, br: BatchRepository, fs: FileStoragePort) =>
            new UploadBatchPhotoUseCase(ur, br, fs),
          inject: [USER_REPOSITORY, BATCH_REPOSITORY, FILE_STORAGE_PORT],
        },
        { provide: FILE_STORAGE_PORT, useValue: mockFileStorage },
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
    batchRepo.clear();
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

  const batchPayload = {
    batchName: 'Morning Batch',
    days: ['MON', 'WED', 'FRI'],
    notes: 'Beginner level',
  };

  describe('Owner Flow: create → list → update → get', () => {
    it('should complete full CRUD flow', async () => {
      await seedOwner();
      const token = makeToken();

      // 1. Create batch
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${token}`)
        .send(batchPayload)
        .expect(201);

      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.batchName).toBe('Morning Batch');
      expect(createRes.body.data.days).toEqual(['MON', 'WED', 'FRI']);
      expect(createRes.body.data.academyId).toBe('academy-1');
      expect(createRes.body.data.notes).toBe('Beginner level');
      const batchId = createRes.body.data.id;

      // 2. List batches
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/batches')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(listRes.body.data.data).toHaveLength(1);
      expect(listRes.body.data.meta.totalItems).toBe(1);

      // 3. Update batch
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/batches/${batchId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ batchName: 'Evening Batch', days: ['TUE', 'THU'] })
        .expect(200);

      expect(updateRes.body.data.batchName).toBe('Evening Batch');
      expect(updateRes.body.data.days).toEqual(['TUE', 'THU']);

      // 4. Get batch
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/batches/${batchId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.data.batchName).toBe('Evening Batch');
    });
  });

  describe('Duplicate name enforcement', () => {
    it('should reject duplicate batch name in same academy (409)', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${token}`)
        .send(batchPayload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${token}`)
        .send(batchPayload)
        .expect(409);
    });

    it('should reject case-insensitive duplicate', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${token}`)
        .send(batchPayload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...batchPayload, batchName: 'MORNING BATCH' })
        .expect(409);
    });
  });

  describe('Validation', () => {
    it('should reject missing batchName (400)', async () => {
      await seedOwner();
      const token = makeToken();
      await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${token}`)
        .send({ days: ['MON'] })
        .expect(400);
    });

    it('should accept empty days (days are optional)', async () => {
      await seedOwner();
      const token = makeToken();
      const res = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${token}`)
        .send({ batchName: 'Test', days: [] })
        .expect(201);
      expect(res.body.data.days).toEqual([]);
    });

    it('should reject invalid weekday (400)', async () => {
      await seedOwner();
      const token = makeToken();
      await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${token}`)
        .send({ batchName: 'Test', days: ['INVALID'] })
        .expect(400);
    });

    it('should reject notes exceeding 500 chars (400)', async () => {
      await seedOwner();
      const token = makeToken();
      await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${token}`)
        .send({ batchName: 'Test', days: ['MON'], notes: 'A'.repeat(501) })
        .expect(400);
    });
  });

  describe('Pagination', () => {
    it('should respect page and pageSize', async () => {
      await seedOwner();
      const token = makeToken();

      for (let i = 1; i <= 3; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/batches')
          .set('Authorization', `Bearer ${token}`)
          .send({ batchName: `Batch ${i}`, days: ['MON'] })
          .expect(201);
      }

      const page1 = await request(app.getHttpServer())
        .get('/api/v1/batches?page=1&pageSize=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(page1.body.data.data).toHaveLength(2);
      expect(page1.body.data.meta.totalItems).toBe(3);
      expect(page1.body.data.meta.totalPages).toBe(2);

      const page2 = await request(app.getHttpServer())
        .get('/api/v1/batches?page=2&pageSize=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(page2.body.data.data).toHaveLength(1);
    });

    it('should return empty list when no batches', async () => {
      await seedOwner();
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get('/api/v1/batches')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(0);
      expect(res.body.data.meta.totalItems).toBe(0);
    });
  });

  describe('Staff read access', () => {
    it('should allow staff to list batches', async () => {
      await seedOwner();
      await seedStaff();

      // Owner creates a batch
      const ownerToken = makeToken('owner-1', 'OWNER');
      await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(batchPayload)
        .expect(201);

      // Staff lists batches
      const staffToken = makeToken('staff-1', 'STAFF');
      const res = await request(app.getHttpServer())
        .get('/api/v1/batches')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(1);
    });

    it('should allow staff to get a batch by ID', async () => {
      await seedOwner();
      await seedStaff();

      const ownerToken = makeToken('owner-1', 'OWNER');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(batchPayload)
        .expect(201);

      const batchId = createRes.body.data.id;
      const staffToken = makeToken('staff-1', 'STAFF');

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/batches/${batchId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(getRes.body.data.batchName).toBe('Morning Batch');
    });
  });

  describe('Cross-academy isolation', () => {
    it('should not allow getting batch from different academy', async () => {
      await seedOwner('owner-1', 'academy-1');
      const token1 = makeToken('owner-1', 'OWNER');

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${token1}`)
        .send(batchPayload)
        .expect(201);

      const batchId = createRes.body.data.id;

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

      // Should not see the batch (403 for cross-academy)
      await request(app.getHttpServer())
        .get(`/api/v1/batches/${batchId}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(403);
    });
  });
});
