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
import { SettingsController } from '../src/presentation/http/settings/settings.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { ACADEMY_REPOSITORY } from '../src/domain/academy/ports/academy.repository';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { GetAcademySettingsUseCase } from '../src/application/academy/use-cases/get-academy-settings.usecase';
import { UpdateAcademySettingsUseCase } from '../src/application/academy/use-cases/update-academy-settings.usecase';
import { InMemoryUserRepository, InMemoryAcademyRepository } from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import { Academy } from '../src/domain/academy/entities/academy.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { AcademyRepository } from '../src/domain/academy/ports/academy.repository';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Settings Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let academyRepo: InMemoryAcademyRepository;
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
    academyRepo = new InMemoryAcademyRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [SettingsController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: ACADEMY_REPOSITORY, useValue: academyRepo },
        { provide: TOKEN_SERVICE, useValue: tokenService },
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
    academyRepo.clear();
  });

  function makeToken(sub = 'owner-1', role = 'OWNER') {
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
    await academyRepo.save(academy);
  }

  describe('GET /settings/academy', () => {
    it('should return defaults when no settings configured', async () => {
      await seedOwner();
      await seedAcademy();
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get('/api/v1/settings/academy')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.defaultDueDateDay).toBe(5);
      expect(res.body.data.receiptPrefix).toBe('PC');
    });

    it('should allow staff to view settings', async () => {
      await seedStaff();
      await seedAcademy();
      const token = makeToken('staff-1', 'STAFF');

      const res = await request(app.getHttpServer())
        .get('/api/v1/settings/academy')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.defaultDueDateDay).toBe(5);
    });
  });

  describe('PUT /settings/academy', () => {
    it('should update settings and return new values', async () => {
      await seedOwner();
      await seedAcademy();
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .put('/api/v1/settings/academy')
        .set('Authorization', `Bearer ${token}`)
        .send({ defaultDueDateDay: 15, receiptPrefix: 'ACC' })
        .expect(200);

      expect(res.body.data.defaultDueDateDay).toBe(15);
      expect(res.body.data.receiptPrefix).toBe('ACC');

      // Verify persistence
      const getRes = await request(app.getHttpServer())
        .get('/api/v1/settings/academy')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.data.defaultDueDateDay).toBe(15);
      expect(getRes.body.data.receiptPrefix).toBe('ACC');
    });

    it('should reject staff PUT (403)', async () => {
      await seedStaff();
      await seedAcademy();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .put('/api/v1/settings/academy')
        .set('Authorization', `Bearer ${token}`)
        .send({ defaultDueDateDay: 10 })
        .expect(403);
    });

    it('should reject day 0 (400)', async () => {
      await seedOwner();
      await seedAcademy();
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/settings/academy')
        .set('Authorization', `Bearer ${token}`)
        .send({ defaultDueDateDay: 0 })
        .expect(400);
    });

    it('should reject day 29 (400)', async () => {
      await seedOwner();
      await seedAcademy();
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/settings/academy')
        .set('Authorization', `Bearer ${token}`)
        .send({ defaultDueDateDay: 29 })
        .expect(400);
    });
  });
});
