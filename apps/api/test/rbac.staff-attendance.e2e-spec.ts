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
import { StaffAttendanceController } from '../src/presentation/http/staff-attendance/staff-attendance.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { STAFF_ATTENDANCE_REPOSITORY } from '../src/domain/staff-attendance/ports/staff-attendance.repository';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { GetDailyStaffAttendanceViewUseCase } from '../src/application/staff-attendance/use-cases/get-daily-staff-attendance-view.usecase';
import { MarkStaffAttendanceUseCase } from '../src/application/staff-attendance/use-cases/mark-staff-attendance.usecase';
import { GetDailyStaffAttendanceReportUseCase } from '../src/application/staff-attendance/use-cases/get-daily-staff-attendance-report.usecase';
import { GetMonthlyStaffAttendanceSummaryUseCase } from '../src/application/staff-attendance/use-cases/get-monthly-staff-attendance-summary.usecase';
import {
  InMemoryUserRepository,
  InMemoryStaffAttendanceRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { StaffAttendanceRepository } from '../src/domain/staff-attendance/ports/staff-attendance.repository';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('RBAC — Staff Attendance Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let staffAttendanceRepo: InMemoryStaffAttendanceRepository;
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
    staffAttendanceRepo = new InMemoryStaffAttendanceRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const noOpAuditRecorder = { record: async () => {} };

    const deps = [USER_REPOSITORY, STAFF_ATTENDANCE_REPOSITORY];

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [StaffAttendanceController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: STAFF_ATTENDANCE_REPOSITORY, useValue: staffAttendanceRepo },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'GET_DAILY_STAFF_ATTENDANCE_VIEW_USE_CASE',
          useFactory: (ur: UserRepository, sar: StaffAttendanceRepository) =>
            new GetDailyStaffAttendanceViewUseCase(ur, sar),
          inject: deps,
        },
        {
          provide: 'MARK_STAFF_ATTENDANCE_USE_CASE',
          useFactory: (ur: UserRepository, sar: StaffAttendanceRepository) =>
            new MarkStaffAttendanceUseCase(ur, sar, noOpAuditRecorder),
          inject: deps,
        },
        {
          provide: 'GET_DAILY_STAFF_ATTENDANCE_REPORT_USE_CASE',
          useFactory: (ur: UserRepository, sar: StaffAttendanceRepository) =>
            new GetDailyStaffAttendanceReportUseCase(ur, sar),
          inject: deps,
        },
        {
          provide: 'GET_MONTHLY_STAFF_ATTENDANCE_SUMMARY_USE_CASE',
          useFactory: (ur: UserRepository, sar: StaffAttendanceRepository) =>
            new GetMonthlyStaffAttendanceSummaryUseCase(ur, sar),
          inject: deps,
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
    staffAttendanceRepo.clear();
  });

  function makeToken(sub: string, role: string) {
    return jwtService.sign(
      { sub, role, email: `${sub}@test.com`, tokenVersion: 0 },
      { secret: 'test-access-secret', expiresIn: 900 },
    );
  }

  function seedUser(id: string, role: string) {
    const user = User.create({
      id,
      fullName: 'Test User',
      email: `${id}@test.com`,
      phoneNumber:
        '+91' +
        id
          .replace(/[^0-9]/g, '')
          .padEnd(10, '0')
          .slice(0, 10),
      role: role as any,
      passwordHash: 'hashed',
    });
    userRepo.save(user);
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

  describe('Unauthenticated access', () => {
    it('should reject unauthenticated GET /staff-attendance (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance?date=2024-03-15')
        .expect(401);
    });

    it('should reject unauthenticated PUT /staff-attendance/:id (401)', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-03-15')
        .send({ status: 'ABSENT' })
        .expect(401);
    });

    it('should reject unauthenticated GET /staff-attendance/reports/daily (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance/reports/daily?date=2024-03-15')
        .expect(401);
    });

    it('should reject unauthenticated GET /staff-attendance/reports/monthly (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance/reports/monthly?month=2024-03')
        .expect(401);
    });
  });

  describe('Staff — forbidden (OWNER-only endpoints)', () => {
    it('should reject STAFF from viewing daily attendance (403)', async () => {
      await seedStaff();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should reject STAFF from marking staff attendance (403)', async () => {
      await seedStaff();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(403);
    });

    it('should reject STAFF from viewing daily report (403)', async () => {
      await seedStaff();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance/reports/daily?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should reject STAFF from viewing monthly summary (403)', async () => {
      await seedStaff();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance/reports/monthly?month=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('SUPER_ADMIN — forbidden', () => {
    it('should reject SUPER_ADMIN from all staff attendance operations (403)', async () => {
      seedUser('admin-1', 'SUPER_ADMIN');
      const token = makeToken('admin-1', 'SUPER_ADMIN');

      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance/reports/daily?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance/reports/monthly?month=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('Owner — allowed', () => {
    it('should allow OWNER to view daily attendance', async () => {
      await seedOwner();
      const token = makeToken('owner-1', 'OWNER');

      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should allow OWNER to mark staff attendance', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      const token = makeToken('owner-1', 'OWNER');

      await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);
    });

    it('should allow OWNER to view daily report', async () => {
      await seedOwner();
      const token = makeToken('owner-1', 'OWNER');

      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance/reports/daily?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should allow OWNER to view monthly summary', async () => {
      await seedOwner();
      const token = makeToken('owner-1', 'OWNER');

      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance/reports/monthly?month=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });
});
