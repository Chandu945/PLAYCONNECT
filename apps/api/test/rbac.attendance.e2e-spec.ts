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

describe('RBAC — Attendance Endpoints (e2e)', () => {
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

  async function seedStudent(id: string, academyId = 'academy-1') {
    const student = Student.create({
      id,
      academyId,
      fullName: 'Test Student',
      dateOfBirth: new Date('2010-01-01'),
      gender: 'MALE',
      address: { line1: '123 St', city: 'City', state: 'ST', pincode: '400001' },
      guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
      joiningDate: new Date('2024-01-01'),
      monthlyFee: 500,
    });
    await studentRepo.save(student);
  }

  describe('Unauthenticated access', () => {
    it('should reject unauthenticated GET /attendance/students (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/attendance/students?date=2024-03-15')
        .expect(401);
    });

    it('should reject unauthenticated POST /attendance/holidays (401)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .send({ date: '2024-03-15' })
        .expect(401);
    });

    it('should reject unauthenticated GET /attendance/reports/daily (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/attendance/reports/daily?date=2024-03-15')
        .expect(401);
    });
  });

  describe('Staff — allowed operations', () => {
    it('should allow staff to view daily attendance', async () => {
      await seedStaff();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .get('/api/v1/attendance/students?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should allow staff to mark attendance', async () => {
      await seedStaff();
      await seedStudent('s1');
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(200);
    });

    it('should allow staff to use bulk set', async () => {
      await seedStaff();
      await seedStudent('s1');
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/bulk?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ absentStudentIds: ['s1'] })
        .expect(200);
    });

    it('should allow staff to view reports', async () => {
      await seedStaff();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .get('/api/v1/attendance/reports/daily?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should allow staff to list holidays', async () => {
      await seedStaff();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .get('/api/v1/attendance/holidays?month=2024-03')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('Staff — forbidden holiday operations', () => {
    it('should reject staff from declaring holidays (403)', async () => {
      await seedStaff();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2024-03-15' })
        .expect(403);
    });

    it('should reject staff from removing holidays (403)', async () => {
      await seedStaff();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .delete('/api/v1/attendance/holidays/2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('SUPER_ADMIN — forbidden', () => {
    it('should reject SUPER_ADMIN from all attendance operations (403)', async () => {
      seedUser('admin-1', 'SUPER_ADMIN');
      const token = makeToken('admin-1', 'SUPER_ADMIN');

      await request(app.getHttpServer())
        .get('/api/v1/attendance/students?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/attendance/holidays')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2024-03-15' })
        .expect(403);
    });
  });

  describe('Cross-academy isolation', () => {
    it('should reject marking attendance for student from another academy', async () => {
      await seedOwner('owner-1', 'academy-1');
      await seedStudent('s1', 'academy-2');
      const token = makeToken('owner-1', 'OWNER');

      await request(app.getHttpServer())
        .put('/api/v1/attendance/students/s1?date=2024-03-15')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ABSENT' })
        .expect(403);
    });
  });
});
