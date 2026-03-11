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

describe('Staff Attendance Endpoints (e2e)', () => {
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
    const withAcademy = User.reconstitute(id, { ...user['props'], academyId });
    await userRepo.save(withAcademy);
    return withAcademy;
  }

  async function seedStaff(
    id = 'staff-1',
    academyId = 'academy-1',
    status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
  ) {
    const user = User.create({
      id,
      fullName: `Staff ${id}`,
      email: `${id}@test.com`,
      phoneNumber: `+91987654${id.replace(/\D/g, '').padStart(4, '0')}`,
      role: 'STAFF',
      passwordHash: 'hashed',
    });
    const withAcademy = User.reconstitute(id, { ...user['props'], academyId, status });
    await userRepo.save(withAcademy);
    return withAcademy;
  }

  describe('Daily View', () => {
    it('should return all staff as PRESENT by default', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      await seedStaff('staff-2');
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get('/api/v1/staff-attendance?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.date).toBe('2024-03-15');
      expect(res.body.data.data).toHaveLength(2);
      expect(res.body.data.data.every((s: { status: string }) => s.status === 'PRESENT')).toBe(
        true,
      );
    });

    it('should show ABSENT after marking', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      const token = makeToken();

      // Mark absent
      await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      // View
      const res = await request(app.getHttpServer())
        .get('/api/v1/staff-attendance?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const staffItem = res.body.data.data.find(
        (s: { staffUserId: string }) => s.staffUserId === 'staff-1',
      );
      expect(staffItem.status).toBe('ABSENT');
    });

    it('should return empty list when no staff', async () => {
      await seedOwner();
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get('/api/v1/staff-attendance?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(0);
      expect(res.body.data.meta.totalItems).toBe(0);
    });
  });

  describe('Mark Staff Attendance', () => {
    it('should mark ABSENT and return success', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.staffUserId).toBe('staff-1');
      expect(res.body.data.status).toBe('ABSENT');
    });

    it('should mark PRESENT (edit back)', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      const token = makeToken();

      // Mark absent first
      await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      // Edit back to present
      const res = await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PRESENT' })
        .expect(200);

      expect(res.body.data.status).toBe('PRESENT');

      // Verify in daily view
      const viewRes = await request(app.getHttpServer())
        .get('/api/v1/staff-attendance?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(
        viewRes.body.data.data.find((s: { staffUserId: string }) => s.staffUserId === 'staff-1')
          .status,
      ).toBe('PRESENT');
    });

    it('should allow editing past dates', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-01-01')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should reject marking for inactive staff (409)', async () => {
      await seedOwner();
      await seedStaff('staff-1', 'academy-1', 'INACTIVE');
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(409);

      expect(res.body.error).toBe('Conflict');
    });

    it('should reject invalid status (400)', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'LATE' })
        .expect(400);
    });

    it('should reject invalid date (400)', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=not-a-date')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(400);
    });
  });

  describe('Daily Report', () => {
    it('should return correct present/absent counts', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      await seedStaff('staff-2');
      await seedStaff('staff-3');
      const token = makeToken();

      // Mark 1 absent
      await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/staff-attendance/reports/daily?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.date).toBe('2024-03-15');
      expect(res.body.data.presentCount).toBe(2);
      expect(res.body.data.absentCount).toBe(1);
      expect(res.body.data.absentStaff).toHaveLength(1);
      expect(res.body.data.absentStaff[0].staffUserId).toBe('staff-1');
    });

    it('should return all present when no absences', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      await seedStaff('staff-2');
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get('/api/v1/staff-attendance/reports/daily?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.presentCount).toBe(2);
      expect(res.body.data.absentCount).toBe(0);
      expect(res.body.data.absentStaff).toHaveLength(0);
    });
  });

  describe('Monthly Summary', () => {
    it('should return correct monthly summary', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      const token = makeToken();

      // Mark absent on 3 days in March 2024
      for (const day of ['2024-03-01', '2024-03-10', '2024-03-20']) {
        await request(app.getHttpServer())
          .put(`/api/v1/staff-attendance/staff-1?date=${day}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ status: 'ABSENT' })
          .expect(200);
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/staff-attendance/reports/monthly?month=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const staffSummary = res.body.data.data.find(
        (s: { staffUserId: string }) => s.staffUserId === 'staff-1',
      );
      expect(staffSummary.absentCount).toBe(3);
      expect(staffSummary.presentCount).toBe(31 - 3); // March has 31 days
    });

    it('should reject invalid month format (400)', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .get('/api/v1/staff-attendance/reports/monthly?month=March-2024')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('Cross-academy isolation', () => {
    it('should reject marking attendance for staff from another academy', async () => {
      await seedOwner('owner-1', 'academy-1');
      await seedStaff('staff-1', 'academy-2');
      const token = makeToken('owner-1', 'OWNER');

      await request(app.getHttpServer())
        .put('/api/v1/staff-attendance/staff-1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(403);
    });
  });
});
