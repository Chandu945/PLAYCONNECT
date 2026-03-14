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
import { SubscriptionController } from '../src/presentation/http/subscription/subscription.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { ACADEMY_REPOSITORY } from '../src/domain/academy/ports/academy.repository';
import { SUBSCRIPTION_REPOSITORY } from '../src/domain/subscription/ports/subscription.repository';
import { CLOCK_PORT } from '../src/application/common/clock.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { CreateTrialSubscriptionUseCase } from '../src/application/subscription/use-cases/create-trial-subscription.usecase';
import { GetMySubscriptionUseCase } from '../src/application/subscription/use-cases/get-my-subscription.usecase';
import {
  InMemoryUserRepository,
  InMemoryAcademyRepository,
  InMemorySubscriptionRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import { Academy } from '../src/domain/academy/entities/academy.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { AcademyRepository } from '../src/domain/academy/ports/academy.repository';
import type { SubscriptionRepository } from '../src/domain/subscription/ports/subscription.repository';
import type { ClockPort } from '../src/application/common/clock.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Subscription (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
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
    academyRepo = new InMemoryAcademyRepository();
    subscriptionRepo = new InMemorySubscriptionRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    clock = { now: () => new Date() };

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [SubscriptionController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: ACADEMY_REPOSITORY, useValue: academyRepo },
        { provide: SUBSCRIPTION_REPOSITORY, useValue: subscriptionRepo },
        { provide: CLOCK_PORT, useValue: clock },
        { provide: TOKEN_SERVICE, useValue: tokenService },
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
    subscriptionRepo.clear();
  });

  function makeToken(sub = 'user-1', role = 'OWNER') {
    return jwtService.sign(
      { sub, role, email: 'owner@test.com', tokenVersion: 0 },
      { secret: 'test-access-secret-that-is-at-least-32-characters-long', expiresIn: 900 },
    );
  }

  async function seedOwnerWithAcademy() {
    const user = User.create({
      id: 'user-1',
      fullName: 'Test Owner',
      email: 'owner@test.com',
      phoneNumber: '+919876543210',
      role: 'OWNER',
      passwordHash: 'hashed',
    });
    const withAcademy = User.reconstitute('user-1', {
      ...user['props'],
      academyId: 'academy-1',
    });
    await userRepo.save(withAcademy);

    const academy = Academy.create({
      id: 'academy-1',
      ownerUserId: 'user-1',
      academyName: 'Test Academy',
      address: { line1: '1 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
    });
    await academyRepo.save(academy);
  }

  describe('GET /api/v1/subscription/me', () => {
    it('should require bearer token', async () => {
      await request(app.getHttpServer()).get('/api/v1/subscription/me').expect(401);
    });

    it('should return ACADEMY_SETUP_REQUIRED when no academy', async () => {
      const user = User.create({
        id: 'user-1',
        fullName: 'No Academy',
        email: 'owner@test.com',
        phoneNumber: '+919876543210',
        role: 'OWNER',
        passwordHash: 'hashed',
      });
      await userRepo.save(user);

      const token = makeToken();
      await request(app.getHttpServer())
        .get('/api/v1/subscription/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(409); // ACADEMY_SETUP_REQUIRED maps to CONFLICT
    });

    it('should return TRIAL status for new academy (auto-heal)', async () => {
      await seedOwnerWithAcademy();
      // No subscription seeded — should auto-heal

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get('/api/v1/subscription/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('TRIAL');
      expect(res.body.data.canAccessApp).toBe(true);
      expect(res.body.data.daysRemaining).toBeGreaterThan(0);
      // Tier fields present
      expect(res.body.data.activeStudentCount).toBe(0);
      expect(res.body.data.currentTierKey).toBeNull();
      expect(res.body.data.requiredTierKey).toBe('TIER_0_50');
      expect(res.body.data.pendingTierChange).toBeNull();
      expect(Array.isArray(res.body.data.tiers)).toBe(true);
      expect(res.body.data.tiers).toHaveLength(3);
    });

    it('should return BLOCKED when trial has expired', async () => {
      await seedOwnerWithAcademy();

      // Override clock to be 40 days in the future
      const futureDate = new Date(Date.now() + 40 * DAY_MS);
      clock.now = () => futureDate;

      // Seed a trial that started now (so it's expired 40 days from now)
      const { Subscription } =
        await import('../src/domain/subscription/entities/subscription.entity');
      const sub = Subscription.createTrial({
        id: 'sub-1',
        academyId: 'academy-1',
        trialStartAt: new Date(),
        trialEndAt: new Date(Date.now() + 30 * DAY_MS),
      });
      await subscriptionRepo.save(sub);

      const token = makeToken();
      const res = await request(app.getHttpServer())
        .get('/api/v1/subscription/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.status).toBe('BLOCKED');
      expect(res.body.data.canAccessApp).toBe(false);

      // Reset clock
      clock.now = () => new Date();
    });
  });

});
