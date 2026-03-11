import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { GlobalExceptionFilter } from '../../src/shared/errors/global-exception.filter';
import { RequestIdInterceptor } from '../../src/shared/logging/request-id.interceptor';
import { createGlobalValidationPipe } from '../../src/shared/validation/validation.pipe';
import { AppConfigModule } from '../../src/shared/config/config.module';
import { LoggingModule } from '../../src/shared/logging/logging.module';
import { AttendanceController } from '../../src/presentation/http/attendance/attendance.controller';
import { USER_REPOSITORY } from '../../src/domain/identity/ports/user.repository';
import { STUDENT_REPOSITORY } from '../../src/domain/student/ports/student.repository';
import { STUDENT_ATTENDANCE_REPOSITORY } from '../../src/domain/attendance/ports/student-attendance.repository';
import { HOLIDAY_REPOSITORY } from '../../src/domain/attendance/ports/holiday.repository';
import { AUDIT_RECORDER_PORT } from '../../src/application/audit/ports/audit-recorder.port';
import { TOKEN_SERVICE } from '../../src/application/identity/ports/token-service.port';
import { GetDailyAttendanceViewUseCase } from '../../src/application/attendance/use-cases/get-daily-attendance-view.usecase';
import { MarkStudentAttendanceUseCase } from '../../src/application/attendance/use-cases/mark-student-attendance.usecase';
import { BulkSetAbsencesUseCase } from '../../src/application/attendance/use-cases/bulk-set-absences.usecase';
import { DeclareHolidayUseCase } from '../../src/application/attendance/use-cases/declare-holiday.usecase';
import { RemoveHolidayUseCase } from '../../src/application/attendance/use-cases/remove-holiday.usecase';
import { ListHolidaysUseCase } from '../../src/application/attendance/use-cases/list-holidays.usecase';
import { GetDailyAttendanceReportUseCase } from '../../src/application/attendance/use-cases/get-daily-attendance-report.usecase';
import { GetStudentMonthlyAttendanceUseCase } from '../../src/application/attendance/use-cases/get-student-monthly-attendance.usecase';
import { GetMonthlyAttendanceSummaryUseCase } from '../../src/application/attendance/use-cases/get-monthly-attendance-summary.usecase';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
  InMemoryStudentAttendanceRepository,
  InMemoryHolidayRepository,
} from '../helpers/in-memory-repos';
import { createTestTokenService } from '../helpers/test-services';
import { User } from '../../src/domain/identity/entities/user.entity';
import { Student } from '../../src/domain/student/entities/student.entity';
import type { UserRepository } from '../../src/domain/identity/ports/user.repository';
import type { StudentRepository } from '../../src/domain/student/ports/student.repository';
import type { StudentAttendanceRepository } from '../../src/domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '../../src/domain/attendance/ports/holiday.repository';
import type { AuditRecorderPort } from '../../src/application/audit/ports/audit-recorder.port';
import { configureApiVersioning } from '../../src/shared/config/api-versioning';

describe('Attendance Failure Paths (e2e)', () => {
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
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret';
    process.env['BCRYPT_COST'] = '4';

    userRepo = new InMemoryUserRepository();
    studentRepo = new InMemoryStudentRepository();
    attendanceRepo = new InMemoryStudentAttendanceRepository();
    holidayRepo = new InMemoryHolidayRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);
    const noOpAuditRecorder: AuditRecorderPort = { record: async () => {} };

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
        { provide: AUDIT_RECORDER_PORT, useValue: noOpAuditRecorder },
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
            audit: AuditRecorderPort,
          ) => new MarkStudentAttendanceUseCase(ur, sr, ar, hr, audit),
          inject: [
            USER_REPOSITORY,
            STUDENT_REPOSITORY,
            STUDENT_ATTENDANCE_REPOSITORY,
            HOLIDAY_REPOSITORY,
            AUDIT_RECORDER_PORT,
          ],
        },
        {
          provide: 'BULK_SET_ABSENCES_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            ar: StudentAttendanceRepository,
            hr: HolidayRepository,
            audit: AuditRecorderPort,
          ) => new BulkSetAbsencesUseCase(ur, sr, ar, hr, audit),
          inject: [
            USER_REPOSITORY,
            STUDENT_REPOSITORY,
            STUDENT_ATTENDANCE_REPOSITORY,
            HOLIDAY_REPOSITORY,
            AUDIT_RECORDER_PORT,
          ],
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
          inject: [
            USER_REPOSITORY,
            STUDENT_REPOSITORY,
            STUDENT_ATTENDANCE_REPOSITORY,
            HOLIDAY_REPOSITORY,
          ],
        },
        {
          provide: 'GET_STUDENT_MONTHLY_ATTENDANCE_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: StudentRepository,
            ar: StudentAttendanceRepository,
            hr: HolidayRepository,
          ) => new GetStudentMonthlyAttendanceUseCase(ur, sr, ar, hr),
          inject: [
            USER_REPOSITORY,
            STUDENT_REPOSITORY,
            STUDENT_ATTENDANCE_REPOSITORY,
            HOLIDAY_REPOSITORY,
          ],
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
    await userRepo.save(User.reconstitute(id, { ...user['props'], academyId }));
  }

  async function seedStudent(id: string, academyId = 'academy-1') {
    const student = Student.create({
      id,
      academyId,
      fullName: `Student ${id}`,
      dateOfBirth: new Date('2010-01-01'),
      gender: 'MALE',
      address: { line1: '123 St', city: 'City', state: 'ST', pincode: '400001' },
      guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
      joiningDate: new Date('2024-01-01'),
      monthlyFee: 500,
    });
    await studentRepo.save(student);
  }

  describe('GET /attendance/students — unauthenticated (401)', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/attendance/students?date=2024-03-10')
        .expect(401);
    });
  });

  describe('PUT /attendance/students/:studentId — not found (404)', () => {
    it('should return 404 for non-existent student', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/nonexistent?date=2024-03-10')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(404);
    });
  });

  describe('PUT /attendance/students/:studentId — invalid input (400)', () => {
    it('should return 400 for missing date query param', async () => {
      await seedOwner();
      await seedStudent('s1');
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(400);
    });

    it('should return 400 for invalid status value', async () => {
      await seedOwner();
      await seedStudent('s1');
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-10')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'INVALID_STATUS' })
        .expect(400);
    });
  });

  describe('POST /attendance/holidays — invalid input (400)', () => {
    it('should return 400 for missing date', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Holiday' })
        .expect(400);
    });

    it('should return 400 for invalid date format', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: 'not-a-date' })
        .expect(400);
    });
  });

  describe('PUT /attendance/students/bulk — invalid input (400)', () => {
    it('should return 400 without date', async () => {
      await seedOwner();
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/bulk')
        .set('Authorization', `Bearer ${token}`)
        .send({ absentStudentIds: ['s1'] })
        .expect(400);
    });
  });

  describe('Idempotency — marking same attendance twice', () => {
    it('should allow re-marking attendance for the same student/date', async () => {
      await seedOwner();
      await seedStudent('s1');
      const token = makeToken();

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-10')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);

      // Re-marking with a different status should succeed (upsert behavior)
      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-10')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'PRESENT' })
        .expect(200);
    });
  });
});
