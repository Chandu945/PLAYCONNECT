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
import { StaffController } from '../src/presentation/http/staff/staff.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { PASSWORD_HASHER } from '../src/application/identity/ports/password-hasher.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { CreateStaffUseCase } from '../src/application/staff/use-cases/create-staff.usecase';
import { ListStaffUseCase } from '../src/application/staff/use-cases/list-staff.usecase';
import { UpdateStaffUseCase } from '../src/application/staff/use-cases/update-staff.usecase';
import { SetStaffStatusUseCase } from '../src/application/staff/use-cases/set-staff-status.usecase';
import { InMemoryUserRepository, InMemorySessionRepository } from './helpers/in-memory-repos';
import { createTestTokenService, createTestPasswordHasher } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import { SESSION_REPOSITORY } from '../src/domain/identity/ports/session.repository';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { SessionRepository } from '../src/domain/identity/ports/session.repository';
import type { PasswordHasher } from '../src/application/identity/ports/password-hasher.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Staff Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
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
    sessionRepo = new InMemorySessionRepository();
    const hasher = createTestPasswordHasher();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [StaffController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: SESSION_REPOSITORY, useValue: sessionRepo },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'CREATE_STAFF_USE_CASE',
          useFactory: (ur: UserRepository, h: PasswordHasher) => new CreateStaffUseCase(ur, h),
          inject: [USER_REPOSITORY, PASSWORD_HASHER],
        },
        {
          provide: 'LIST_STAFF_USE_CASE',
          useFactory: (ur: UserRepository) => new ListStaffUseCase(ur),
          inject: [USER_REPOSITORY],
        },
        {
          provide: 'UPDATE_STAFF_USE_CASE',
          useFactory: (ur: UserRepository, h: PasswordHasher) => new UpdateStaffUseCase(ur, h),
          inject: [USER_REPOSITORY, PASSWORD_HASHER],
        },
        {
          provide: 'SET_STAFF_STATUS_USE_CASE',
          useFactory: (ur: UserRepository, sr: SessionRepository) =>
            new SetStaffStatusUseCase(ur, sr),
          inject: [USER_REPOSITORY, SESSION_REPOSITORY],
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
    const withAcademy = User.reconstitute(id, {
      ...user['props'],
      academyId,
    });
    await userRepo.save(withAcademy);
    return withAcademy;
  }

  const staffPayload = {
    fullName: 'Priya Sharma',
    phoneNumber: '+919876543211',
    email: 'priya@example.com',
    password: 'Password1!',
  };

  describe('Full CRUD Flow', () => {
    it('should create → list → update → deactivate → reactivate staff', async () => {
      await seedOwner();
      const token = makeToken();

      // 1. Create staff
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .send(staffPayload)
        .expect(201);

      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.fullName).toBe('Priya Sharma');
      expect(createRes.body.data.role).toBe('STAFF');
      expect(createRes.body.data.status).toBe('ACTIVE');
      expect(createRes.body.data.academyId).toBe('academy-1');
      const staffId = createRes.body.data.id;

      // 2. List staff
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.data).toHaveLength(1);
      expect(listRes.body.data.meta.totalItems).toBe(1);

      // 3. Update staff
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/staff/${staffId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Priya Kumar' })
        .expect(200);

      expect(updateRes.body.data.fullName).toBe('Priya Kumar');

      // 4. Deactivate staff
      const deactivateRes = await request(app.getHttpServer())
        .patch(`/api/v1/staff/${staffId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      expect(deactivateRes.body.data.status).toBe('INACTIVE');

      // 5. Reactivate staff
      const reactivateRes = await request(app.getHttpServer())
        .patch(`/api/v1/staff/${staffId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ACTIVE' })
        .expect(200);

      expect(reactivateRes.body.data.status).toBe('ACTIVE');
    });
  });

  describe('RBAC', () => {
    it('should reject STAFF from accessing staff endpoints (403)', async () => {
      const staffUser = User.create({
        id: 'staff-1',
        fullName: 'Test Staff',
        email: 'staff@test.com',
        phoneNumber: '+919876543211',
        role: 'STAFF',
        passwordHash: 'hashed',
      });
      await userRepo.save(
        User.reconstitute('staff-1', { ...staffUser['props'], academyId: 'academy-1' }),
      );
      const staffToken = makeToken('staff-1', 'STAFF');
      await request(app.getHttpServer())
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${staffToken}`)
        .send(staffPayload)
        .expect(403);
    });

    it('should reject missing token (401)', async () => {
      await request(app.getHttpServer()).get('/api/v1/staff').expect(401);
    });
  });

  describe('Validation', () => {
    it('should reject weak password (400)', async () => {
      await seedOwner();
      const token = makeToken();
      await request(app.getHttpServer())
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...staffPayload, password: 'weak' })
        .expect(400);
    });

    it('should reject invalid phone (400)', async () => {
      await seedOwner();
      const token = makeToken();
      await request(app.getHttpServer())
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...staffPayload, phoneNumber: '9876543211' })
        .expect(400);
    });

    it('should reject duplicate email (409)', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .send(staffPayload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...staffPayload, phoneNumber: '+919876543299' })
        .expect(409);
    });

    it('should reject duplicate phone (409)', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .send(staffPayload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...staffPayload, email: 'other@example.com' })
        .expect(409);
    });
  });

  describe('Pagination', () => {
    it('should respect page and pageSize', async () => {
      await seedOwner();
      const token = makeToken();

      // Create 3 staff members
      for (let i = 1; i <= 3; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/staff')
          .set('Authorization', `Bearer ${token}`)
          .send({
            fullName: `Staff ${i}`,
            phoneNumber: `+91987654321${i}`,
            email: `staff${i}@example.com`,
            password: 'Password1!',
          })
          .expect(201);
      }

      // Get page 1 with pageSize 2
      const page1 = await request(app.getHttpServer())
        .get('/api/v1/staff?page=1&pageSize=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(page1.body.data.data).toHaveLength(2);
      expect(page1.body.data.meta.totalItems).toBe(3);
      expect(page1.body.data.meta.totalPages).toBe(2);

      // Get page 2
      const page2 = await request(app.getHttpServer())
        .get('/api/v1/staff?page=2&pageSize=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(page2.body.data.data).toHaveLength(1);
    });

    it('should return empty list when no staff', async () => {
      await seedOwner();
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get('/api/v1/staff')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(0);
      expect(res.body.data.meta.totalItems).toBe(0);
    });
  });

  describe('Cross-academy', () => {
    it('should reject modifying staff from different academy (403)', async () => {
      // Seed owner-1 with academy-1
      await seedOwner('owner-1', 'academy-1');
      const token1 = makeToken('owner-1', 'OWNER');

      // Create a staff member under academy-1
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${token1}`)
        .send(staffPayload)
        .expect(201);

      const staffId = createRes.body.data.id;

      // Seed owner-2 with academy-2
      const owner2 = User.create({
        id: 'owner-2',
        fullName: 'Other Owner',
        email: 'owner2@test.com',
        phoneNumber: '+919876543299',
        role: 'OWNER',
        passwordHash: 'hashed',
      });
      const owner2WithAcademy = User.reconstitute('owner-2', {
        ...owner2['props'],
        academyId: 'academy-2',
      });
      await userRepo.save(owner2WithAcademy);

      const token2 = jwtService.sign(
        { sub: 'owner-2', role: 'OWNER', email: 'owner2@test.com', tokenVersion: 0 },
        { secret: 'test-access-secret', expiresIn: 900 },
      );

      // Owner-2 tries to update staff from academy-1
      await request(app.getHttpServer())
        .patch(`/api/v1/staff/${staffId}`)
        .set('Authorization', `Bearer ${token2}`)
        .send({ fullName: 'Hacked Name' })
        .expect(403);

      // Owner-2 tries to deactivate staff from academy-1
      await request(app.getHttpServer())
        .patch(`/api/v1/staff/${staffId}/status`)
        .set('Authorization', `Bearer ${token2}`)
        .send({ status: 'INACTIVE' })
        .expect(403);
    });
  });
});
