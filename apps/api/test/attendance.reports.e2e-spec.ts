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
import { AttendanceController } from '../src/presentation/http/attendance/attendance.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { STUDENT_REPOSITORY } from '../src/domain/student/ports/student.repository';
import { STUDENT_ATTENDANCE_REPOSITORY } from '../src/domain/attendance/ports/student-attendance.repository';
import { HOLIDAY_REPOSITORY } from '../src/domain/attendance/ports/holiday.repository';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { GetDailyAttendanceViewUseCase } from '../src/application/attendance/use-cases/get-daily-attendance-view.usecase';
import { MarkStudentAttendanceUseCase } from '../src/application/attendance/use-cases/mark-student-attendance.usecase';
import { BulkSetAbsencesUseCase } from '../src/application/attendance/use-cases/bulk-set-absences.usecase';
import { DeclareHolidayUseCase } from '../src/application/attendance/use-cases/declare-holiday.usecase';
import { RemoveHolidayUseCase } from '../src/application/attendance/use-cases/remove-holiday.usecase';
import { ListHolidaysUseCase } from '../src/application/attendance/use-cases/list-holidays.usecase';
import { GetDailyAttendanceReportUseCase } from '../src/application/attendance/use-cases/get-daily-attendance-report.usecase';
import { GetStudentMonthlyAttendanceUseCase } from '../src/application/attendance/use-cases/get-student-monthly-attendance.usecase';
import { GetMonthlyAttendanceSummaryUseCase } from '../src/application/attendance/use-cases/get-monthly-attendance-summary.usecase';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
  InMemoryStudentAttendanceRepository,
  InMemoryHolidayRepository,
} from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import { Student } from '../src/domain/student/entities/student.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { StudentRepository } from '../src/domain/student/ports/student.repository';
import type { StudentAttendanceRepository } from '../src/domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '../src/domain/attendance/ports/holiday.repository';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Attendance Reports (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let studentRepo: InMemoryStudentRepository;
  let attendanceRepo: InMemoryStudentAttendanceRepository;
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
    studentRepo = new InMemoryStudentRepository();
    attendanceRepo = new InMemoryStudentAttendanceRepository();
    holidayRepo = new InMemoryHolidayRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const noOpAuditRecorder = { record: async () => {} };

    const deps = [
      USER_REPOSITORY,
      STUDENT_REPOSITORY,
      STUDENT_ATTENDANCE_REPOSITORY,
      HOLIDAY_REPOSITORY,
    ];

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [AttendanceController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: STUDENT_REPOSITORY, useValue: studentRepo },
        { provide: STUDENT_ATTENDANCE_REPOSITORY, useValue: attendanceRepo },
        { provide: HOLIDAY_REPOSITORY, useValue: holidayRepo },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'GET_DAILY_ATTENDANCE_VIEW_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            ar: StudentAttendanceRepository,
            hr: HolidayRepository,
          ) => new GetDailyAttendanceViewUseCase(ur, sr, ar, hr),
          inject: deps,
        },
        {
          provide: 'MARK_STUDENT_ATTENDANCE_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            ar: StudentAttendanceRepository,
            hr: HolidayRepository,
          ) => new MarkStudentAttendanceUseCase(ur, sr, ar, hr, noOpAuditRecorder),
          inject: deps,
        },
        {
          provide: 'BULK_SET_ABSENCES_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            ar: StudentAttendanceRepository,
            hr: HolidayRepository,
          ) => new BulkSetAbsencesUseCase(ur, sr, ar, hr, noOpAuditRecorder),
          inject: deps,
        },
        {
          provide: 'DECLARE_HOLIDAY_USE_CASE',
          useFactory: (
            ur: UserRepository,
            hr: HolidayRepository,
            ar: StudentAttendanceRepository,
          ) => new DeclareHolidayUseCase(ur, hr, ar),
          inject: [USER_REPOSITORY, HOLIDAY_REPOSITORY, STUDENT_ATTENDANCE_REPOSITORY],
        },
        {
          provide: 'REMOVE_HOLIDAY_USE_CASE',
          useFactory: (ur: UserRepository, hr: HolidayRepository) =>
            new RemoveHolidayUseCase(ur, hr),
          inject: [USER_REPOSITORY, HOLIDAY_REPOSITORY],
        },
        {
          provide: 'LIST_HOLIDAYS_USE_CASE',
          useFactory: (ur: UserRepository, hr: HolidayRepository) =>
            new ListHolidaysUseCase(ur, hr),
          inject: [USER_REPOSITORY, HOLIDAY_REPOSITORY],
        },
        {
          provide: 'GET_DAILY_ATTENDANCE_REPORT_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            ar: StudentAttendanceRepository,
            hr: HolidayRepository,
          ) => new GetDailyAttendanceReportUseCase(ur, sr, ar, hr),
          inject: deps,
        },
        {
          provide: 'GET_STUDENT_MONTHLY_ATTENDANCE_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            ar: StudentAttendanceRepository,
            hr: HolidayRepository,
          ) => new GetStudentMonthlyAttendanceUseCase(ur, sr, ar, hr),
          inject: deps,
        },
        {
          provide: 'GET_MONTHLY_ATTENDANCE_SUMMARY_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            ar: StudentAttendanceRepository,
            hr: HolidayRepository,
          ) => new GetMonthlyAttendanceSummaryUseCase(ur, sr, ar, hr),
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
    studentRepo.clear();
    attendanceRepo.clear();
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
    await userRepo.save(User.reconstitute(id, { ...user['props'], academyId }));
  }

  async function seedStudent(id: string, academyId = 'academy-1', name = 'Student') {
    const student = Student.create({
      id,
      academyId,
      fullName: name,
      dateOfBirth: new Date('2010-01-01'),
      gender: 'MALE',
      address: { line1: '123 St', city: 'City', state: 'ST', pincode: '400001' },
      guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
      joiningDate: new Date('2024-01-01'),
      monthlyFee: 500,
    });
    await studentRepo.save(student);
  }

  describe('Daily attendance report', () => {
    it('should return correct present/absent counts', async () => {
      await seedOwner();
      await seedStudent('s1', 'academy-1', 'Alice');
      await seedStudent('s2', 'academy-1', 'Bob');
      await seedStudent('s3', 'academy-1', 'Charlie');
      const token = makeToken();

      // Mark s1 absent
      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/attendance/reports/daily?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.date).toBe('2024-03-15');
      expect(res.body.data.isHoliday).toBe(false);
      expect(res.body.data.presentCount).toBe(2);
      expect(res.body.data.absentCount).toBe(1);
      expect(res.body.data.absentStudents).toHaveLength(1);
      expect(res.body.data.absentStudents[0].studentId).toBe('s1');
      expect(res.body.data.absentStudents[0].fullName).toBe('Alice');
    });

    it('should return zero counts on holiday', async () => {
      await seedOwner();
      await seedStudent('s1');
      const token = makeToken();

      // Declare holiday
      await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2024-03-15' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/attendance/reports/daily?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.isHoliday).toBe(true);
      expect(res.body.data.presentCount).toBe(0);
      expect(res.body.data.absentCount).toBe(0);
      expect(res.body.data.absentStudents).toHaveLength(0);
    });

    it('should return all present when none absent', async () => {
      await seedOwner();
      await seedStudent('s1');
      await seedStudent('s2');
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get('/api/v1/attendance/reports/daily?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.presentCount).toBe(2);
      expect(res.body.data.absentCount).toBe(0);
    });
  });

  describe('Student monthly attendance report', () => {
    it('should return correct absentDates, holidayDates, and counts', async () => {
      await seedOwner();
      await seedStudent('s1', 'academy-1', 'Alice');
      const token = makeToken();

      // Mark s1 absent on 2 days in March
      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-05')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-12')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      // Declare 1 holiday in March
      await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2024-03-26', reason: 'Holi' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/attendance/reports/monthly/student/s1?month=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.studentId).toBe('s1');
      expect(res.body.data.month).toBe('2024-03');
      expect(res.body.data.absentDates).toHaveLength(2);
      expect(res.body.data.absentDates).toContain('2024-03-05');
      expect(res.body.data.absentDates).toContain('2024-03-12');
      expect(res.body.data.holidayDates).toHaveLength(1);
      expect(res.body.data.holidayDates).toContain('2024-03-26');
      expect(res.body.data.absentCount).toBe(2);
      expect(res.body.data.holidayCount).toBe(1);
      // March has 31 days: 31 - 2 absent - 1 holiday = 28 present
      expect(res.body.data.presentCount).toBe(28);
    });

    it('should return empty for a month with no attendance data', async () => {
      await seedOwner();
      await seedStudent('s1');
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get('/api/v1/attendance/reports/monthly/student/s1?month=2024-04')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.absentDates).toHaveLength(0);
      expect(res.body.data.holidayDates).toHaveLength(0);
      // April has 30 days, all present
      expect(res.body.data.presentCount).toBe(30);
    });

    it('should reject invalid month format (400)', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .get('/api/v1/attendance/reports/monthly/student/s1?month=bad')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('Monthly attendance summary', () => {
    it('should return per-student summary with correct counts', async () => {
      await seedOwner();
      await seedStudent('s1', 'academy-1', 'Alice');
      await seedStudent('s2', 'academy-1', 'Bob');
      const token = makeToken();

      // Mark s1 absent 3 times in Feb 2024
      for (const day of ['2024-02-05', '2024-02-12', '2024-02-19']) {
        await request(app.getHttpServer())
          .put(`/api/v1/attendance/students/s1?date=${day}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ status: 'ABSENT' })
          .expect(200);
      }

      // Mark s2 absent 1 time
      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s2?date=2024-02-07')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      // Declare 1 holiday
      await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2024-02-14', reason: "Valentine's Day" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/attendance/reports/monthly/summary?month=2024-02&page=1&pageSize=20')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(2);
      expect(res.body.data.meta.totalItems).toBe(2);

      const alice = res.body.data.data.find((s: { studentId: string }) => s.studentId === 's1');
      const bob = res.body.data.data.find((s: { studentId: string }) => s.studentId === 's2');

      // Feb 2024 has 29 days (leap year)
      expect(alice.absentCount).toBe(3);
      expect(alice.holidayCount).toBe(1);
      expect(alice.presentCount).toBe(25); // 29 - 3 - 1

      expect(bob.absentCount).toBe(1);
      expect(bob.holidayCount).toBe(1);
      expect(bob.presentCount).toBe(27); // 29 - 1 - 1
    });

    it('should paginate correctly', async () => {
      await seedOwner();
      await seedStudent('s1', 'academy-1', 'Alice');
      await seedStudent('s2', 'academy-1', 'Bob');
      await seedStudent('s3', 'academy-1', 'Charlie');
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get('/api/v1/attendance/reports/monthly/summary?month=2024-03&page=1&pageSize=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data).toHaveLength(2);
      expect(res.body.data.meta.totalItems).toBe(3);
      expect(res.body.data.meta.totalPages).toBe(2);

      const page2 = await request(app.getHttpServer())
        .get('/api/v1/attendance/reports/monthly/summary?month=2024-03&page=2&pageSize=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(page2.body.data.data).toHaveLength(1);
    });

    it('should reject invalid month format (400)', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .get('/api/v1/attendance/reports/monthly/summary?month=2024-13')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });
});
