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

describe('Batches RBAC (e2e)', () => {
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

  function makeToken(sub: string, role: string) {
    return jwtService.sign(
      { sub, role, email: `${role.toLowerCase()}@test.com`, tokenVersion: 0 },
      { secret: 'test-access-secret', expiresIn: 900 },
    );
  }

  async function seedOwner() {
    const user = User.create({
      id: 'owner-1',
      fullName: 'Test Owner',
      email: 'owner@test.com',
      phoneNumber: '+919876543210',
      role: 'OWNER',
      passwordHash: 'hashed',
    });
    await userRepo.save(User.reconstitute('owner-1', { ...user['props'], academyId: 'academy-1' }));
  }

  async function seedStaff() {
    const user = User.create({
      id: 'staff-1',
      fullName: 'Test Staff',
      email: 'staff@test.com',
      phoneNumber: '+919876543211',
      role: 'STAFF',
      passwordHash: 'hashed',
    });
    await userRepo.save(User.reconstitute('staff-1', { ...user['props'], academyId: 'academy-1' }));
  }

  describe('Staff can create and update batches', () => {
    it('should allow staff to create batch (201)', async () => {
      await seedStaff();
      const staffToken = makeToken('staff-1', 'STAFF');

      const res = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ batchName: 'Test', days: ['MON'] })
        .expect(201);

      expect(res.body.data.batchName).toBe('Test');
    });

    it('should allow staff to update batch (200)', async () => {
      await seedOwner();
      await seedStaff();

      // Owner creates batch
      const ownerToken = makeToken('owner-1', 'OWNER');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ batchName: 'Test', days: ['MON'] })
        .expect(201);

      const batchId = createRes.body.data.id;

      // Staff updates batch
      const staffToken = makeToken('staff-1', 'STAFF');
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/batches/${batchId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ batchName: 'Changed' })
        .expect(200);

      expect(res.body.data.batchName).toBe('Changed');
    });
  });

  describe('Staff can list and get batches', () => {
    it('should allow staff to list batches (200)', async () => {
      await seedStaff();
      const staffToken = makeToken('staff-1', 'STAFF');

      const res = await request(app.getHttpServer())
        .get('/api/v1/batches')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should allow staff to get a batch (200)', async () => {
      await seedOwner();
      await seedStaff();

      const ownerToken = makeToken('owner-1', 'OWNER');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ batchName: 'Test', days: ['MON'] })
        .expect(201);

      const batchId = createRes.body.data.id;
      const staffToken = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .get(`/api/v1/batches/${batchId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
    });
  });

  describe('Unauthenticated access', () => {
    it('should reject missing token (401)', async () => {
      await request(app.getHttpServer()).get('/api/v1/batches').expect(401);
    });

    it('should reject invalid token (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/batches')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
