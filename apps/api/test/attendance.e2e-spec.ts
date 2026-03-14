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

describe('Attendance Endpoints (e2e)', () => {
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

  describe('Daily attendance view', () => {
    it('should default all ACTIVE students as PRESENT', async () => {
      await seedOwner();
      await seedStudent('s1', 'academy-1', 'Alice');
      await seedStudent('s2', 'academy-1', 'Bob');
      const token = makeToken();

      const res = await request(app.getHttpServer())
        .get('/api/v1/attendance/students?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.isHoliday).toBe(false);
      expect(res.body.data.data).toHaveLength(2);
      expect(res.body.data.data.every((s: { status: string }) => s.status === 'PRESENT')).toBe(
        true,
      );
    });

    it('should show ABSENT after marking', async () => {
      await seedOwner();
      await seedStudent('s1');
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/attendance/students?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.data[0].status).toBe('ABSENT');
    });

    it('should show HOLIDAY when holiday declared', async () => {
      await seedOwner();
      await seedStudent('s1');
      const token = makeToken();

      await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2024-03-15', reason: 'Test Holiday' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/attendance/students?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.isHoliday).toBe(true);
      expect(res.body.data.data[0].status).toBe('HOLIDAY');
    });
  });

  describe('Mark attendance', () => {
    it('should mark ABSENT and then back to PRESENT', async () => {
      await seedOwner();
      await seedStudent('s1');
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PRESENT' })
        .expect(200);

      const view = await request(app.getHttpServer())
        .get('/api/v1/attendance/students?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(view.body.data.data[0].status).toBe('PRESENT');
    });

    it('should reject marking on a holiday (409)', async () => {
      await seedOwner();
      await seedStudent('s1');
      const token = makeToken();

      await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2024-03-15' })
        .expect(201);

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(409);
    });

    it('should allow editing past dates', async () => {
      await seedOwner();
      await seedStudent('s1');
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2023-01-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);
    });
  });

  describe('Bulk set absences', () => {
    it('should set exact absent list for the day', async () => {
      await seedOwner();
      await seedStudent('s1', 'academy-1', 'Alice');
      await seedStudent('s2', 'academy-1', 'Bob');
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/bulk?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ absentStudentIds: ['s1'] })
        .expect(200);

      const view = await request(app.getHttpServer())
        .get('/api/v1/attendance/students?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const s1 = view.body.data.data.find((s: { studentId: string }) => s.studentId === 's1');
      const s2 = view.body.data.data.find((s: { studentId: string }) => s.studentId === 's2');
      expect(s1.status).toBe('ABSENT');
      expect(s2.status).toBe('PRESENT');
    });

    it('should mark all present with empty absent list', async () => {
      await seedOwner();
      await seedStudent('s1');
      const token = makeToken();

      // First mark absent
      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      // Bulk with empty list
      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/bulk?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ absentStudentIds: [] })
        .expect(200);

      const view = await request(app.getHttpServer())
        .get('/api/v1/attendance/students?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(view.body.data.data[0].status).toBe('PRESENT');
    });
  });

  describe('Holiday management', () => {
    it('should declare and remove a holiday', async () => {
      await seedOwner();
      const token = makeToken();

      const declareRes = await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2024-03-26', reason: 'Holi' })
        .expect(201);

      expect(declareRes.body.data.date).toBe('2024-03-26');
      expect(declareRes.body.data.reason).toBe('Holi');

      await request(app.getHttpServer())
        .delete('/api/v1/attendance/holidays/2024-03-26')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // List holidays should be empty
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/attendance/holidays?month=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(listRes.body.data).toHaveLength(0);
    });

    it('should list holidays for a month', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2024-03-26' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2024-03-29' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/attendance/holidays?month=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('Validation', () => {
    it('should reject invalid date format on view (400)', async () => {
      await seedOwner();
      const token = makeToken();
      await request(app.getHttpServer())
        .get('/api/v1/attendance/students?date=bad-date')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should reject invalid status (400)', async () => {
      await seedOwner();
      await seedStudent('s1');
      const token = makeToken();
      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'LATE' })
        .expect(400);
    });
  });
});
