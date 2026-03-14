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
import { HOLIDAY_REPOSITORY } from '../src/domain/attendance/ports/holiday.repository';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { GetDailyStaffAttendanceViewUseCase } from '../src/application/staff-attendance/use-cases/get-daily-staff-attendance-view.usecase';
import { MarkStaffAttendanceUseCase } from '../src/application/staff-attendance/use-cases/mark-staff-attendance.usecase';
import { GetDailyStaffAttendanceReportUseCase } from '../src/application/staff-attendance/use-cases/get-daily-staff-attendance-report.usecase';
import { GetMonthlyStaffAttendanceSummaryUseCase } from '../src/application/staff-attendance/use-cases/get-monthly-staff-attendance-summary.usecase';
import {
  InMemoryUserRepository,
  InMemoryStaffAttendanceRepository,
  InMemoryHolidayRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import { Holiday } from '../src/domain/attendance/entities/holiday.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { StaffAttendanceRepository } from '../src/domain/staff-attendance/ports/staff-attendance.repository';
import type { HolidayRepository } from '../src/domain/attendance/ports/holiday.repository';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function thisMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dayOfMonth(day: number): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInCurrentMonth(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

describe('Staff Attendance Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let staffAttendanceRepo: InMemoryStaffAttendanceRepository;
  let holidayRepo: InMemoryHolidayRepository;
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
    staffAttendanceRepo = new InMemoryStaffAttendanceRepository();
    holidayRepo = new InMemoryHolidayRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const noOpAuditRecorder = { record: async () => {} };

    const deps = [USER_REPOSITORY, STAFF_ATTENDANCE_REPOSITORY, HOLIDAY_REPOSITORY];

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
        { provide: HOLIDAY_REPOSITORY, useValue: holidayRepo },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'GET_DAILY_STAFF_ATTENDANCE_VIEW_USE_CASE',
          useFactory: (ur: UserRepository, sar: StaffAttendanceRepository, hr: HolidayRepository) =>
            new GetDailyStaffAttendanceViewUseCase(ur, sar, hr),
          inject: deps,
        },
        {
          provide: 'MARK_STAFF_ATTENDANCE_USE_CASE',
          useFactory: (ur: UserRepository, sar: StaffAttendanceRepository) =>
            new MarkStaffAttendanceUseCase(ur, sar, noOpAuditRecorder),
          inject: [USER_REPOSITORY, STAFF_ATTENDANCE_REPOSITORY],
        },
        {
          provide: 'GET_DAILY_STAFF_ATTENDANCE_REPORT_USE_CASE',
          useFactory: (ur: UserRepository, sar: StaffAttendanceRepository) =>
            new GetDailyStaffAttendanceReportUseCase(ur, sar),
          inject: [USER_REPOSITORY, STAFF_ATTENDANCE_REPOSITORY],
        },
        {
          provide: 'GET_MONTHLY_STAFF_ATTENDANCE_SUMMARY_USE_CASE',
          useFactory: (ur: UserRepository, sar: StaffAttendanceRepository, hr: HolidayRepository) =>
            new GetMonthlyStaffAttendanceSummaryUseCase(ur, sar, hr),
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
    holidayRepo.clear();
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

  async function seedHoliday(date: string, academyId = 'academy-1') {
    const holiday = Holiday.create({
      id: `holiday-${date}`,
      academyId,
      date,
      reason: 'Test Holiday',
      declaredByUserId: 'owner-1',
    });
    await holidayRepo.save(holiday);
    return holiday;
  }

  describe('Daily View', () => {
    it('should return all staff as PRESENT by default', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      await seedStaff('staff-2');
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/staff-attendance?date=${todayStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.date).toBe(todayStr());
      expect(res.body.data.isHoliday).toBe(false);
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
        .put(`/api/v1/staff-attendance/staff-1?date=${todayStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      // View
      const res = await request(app.getHttpServer())
        .get(`/api/v1/staff-attendance?date=${todayStr()}`)
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
        .get(`/api/v1/staff-attendance?date=${todayStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(0);
      expect(res.body.data.meta.totalItems).toBe(0);
    });

    it('should return isHoliday=true on a holiday', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      await seedHoliday(todayStr());
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/staff-attendance?date=${todayStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.isHoliday).toBe(true);
    });
  });

  describe('Mark Staff Attendance', () => {
    it('should mark ABSENT and return success', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .put(`/api/v1/staff-attendance/staff-1?date=${todayStr()}`)
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
        .put(`/api/v1/staff-attendance/staff-1?date=${todayStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      // Edit back to present
      const res = await request(app.getHttpServer())
        .put(`/api/v1/staff-attendance/staff-1?date=${todayStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PRESENT' })
        .expect(200);

      expect(res.body.data.status).toBe('PRESENT');

      // Verify in daily view
      const viewRes = await request(app.getHttpServer())
        .get(`/api/v1/staff-attendance?date=${todayStr()}`)
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
      // Use a date within the ±30 day range
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/staff-attendance/staff-1?date=${yesterdayStr}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should reject marking on a holiday (409)', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      await seedHoliday(todayStr());
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .put(`/api/v1/staff-attendance/staff-1?date=${todayStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(409);

      expect(res.body.error).toBe('Conflict');
    });

    it('should reject marking for inactive staff (409)', async () => {
      await seedOwner();
      await seedStaff('staff-1', 'academy-1', 'INACTIVE');
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .put(`/api/v1/staff-attendance/staff-1?date=${todayStr()}`)
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
        .put(`/api/v1/staff-attendance/staff-1?date=${todayStr()}`)
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
        .put(`/api/v1/staff-attendance/staff-1?date=${todayStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/staff-attendance/reports/daily?date=${todayStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.date).toBe(todayStr());
      expect(res.body.data.isHoliday).toBe(false);
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
        .get(`/api/v1/staff-attendance/reports/daily?date=${todayStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.presentCount).toBe(2);
      expect(res.body.data.absentCount).toBe(0);
      expect(res.body.data.absentStaff).toHaveLength(0);
    });

    it('should return isHoliday=true with zero counts on a holiday', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      await seedStaff('staff-2');
      await seedHoliday(todayStr());
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/staff-attendance/reports/daily?date=${todayStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.isHoliday).toBe(true);
      expect(res.body.data.presentCount).toBe(0);
      expect(res.body.data.absentCount).toBe(0);
      expect(res.body.data.absentStaff).toHaveLength(0);
    });
  });

  describe('Monthly Summary', () => {
    it('should return correct monthly summary', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      const token = makeToken();

      // Mark absent on 3 days in the current month
      for (const d of [1, 2, 3]) {
        await request(app.getHttpServer())
          .put(`/api/v1/staff-attendance/staff-1?date=${dayOfMonth(d)}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ status: 'ABSENT' })
          .expect(200);
      }

      const res = await request(app.getHttpServer())
        .get(`/api/v1/staff-attendance/reports/monthly?month=${thisMonthStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const staffSummary = res.body.data.data.find(
        (s: { staffUserId: string }) => s.staffUserId === 'staff-1',
      );
      expect(staffSummary.absentCount).toBe(3);
      expect(staffSummary.holidayCount).toBe(0);
      expect(staffSummary.presentCount).toBe(daysInCurrentMonth() - 3);
    });

    it('should deduct holidays from present count', async () => {
      await seedOwner();
      await seedStaff('staff-1');
      const token = makeToken();

      // Declare 2 holidays in the current month (pick days that don't overlap with absent day)
      const totalDays = daysInCurrentMonth();
      await seedHoliday(dayOfMonth(totalDays - 1));
      await seedHoliday(dayOfMonth(totalDays));

      // Mark absent on day 1 (not a holiday)
      await request(app.getHttpServer())
        .put(`/api/v1/staff-attendance/staff-1?date=${dayOfMonth(1)}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/staff-attendance/reports/monthly?month=${thisMonthStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const staffSummary = res.body.data.data.find(
        (s: { staffUserId: string }) => s.staffUserId === 'staff-1',
      );
      // totalDays - 1 absent - 2 holidays = totalDays - 3 present
      expect(staffSummary.absentCount).toBe(1);
      expect(staffSummary.holidayCount).toBe(2);
      expect(staffSummary.presentCount).toBe(totalDays - 3);
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
        .put(`/api/v1/staff-attendance/staff-1?date=${todayStr()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(403);
    });
  });
});
