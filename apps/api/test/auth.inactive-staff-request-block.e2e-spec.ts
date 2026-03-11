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
import { AuthController } from '../src/presentation/http/auth/auth.controller';
import { StaffController } from '../src/presentation/http/staff/staff.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { SESSION_REPOSITORY } from '../src/domain/identity/ports/session.repository';
import { PASSWORD_HASHER } from '../src/application/identity/ports/password-hasher.port';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { OwnerSignupUseCase } from '../src/application/identity/use-cases/owner-signup.usecase';
import { LoginUseCase } from '../src/application/identity/use-cases/login.usecase';
import { RefreshUseCase } from '../src/application/identity/use-cases/refresh.usecase';
import { LogoutUseCase } from '../src/application/identity/use-cases/logout.usecase';
import { CreateStaffUseCase } from '../src/application/staff/use-cases/create-staff.usecase';
import { ListStaffUseCase } from '../src/application/staff/use-cases/list-staff.usecase';
import { UpdateStaffUseCase } from '../src/application/staff/use-cases/update-staff.usecase';
import { SetStaffStatusUseCase } from '../src/application/staff/use-cases/set-staff-status.usecase';
import { InMemoryUserRepository, InMemorySessionRepository } from './helpers/in-memory-repos';
import { createTestTokenService, createTestPasswordHasher } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { SessionRepository } from '../src/domain/identity/ports/session.repository';
import type { PasswordHasher } from '../src/application/identity/ports/password-hasher.port';
import type { TokenService } from '../src/application/identity/ports/token-service.port';
import { PASSWORD_RESET_CHALLENGE_REPOSITORY } from '../src/domain/identity/ports/password-reset-challenge.repository';
import { OTP_GENERATOR } from '../src/application/identity/ports/otp-generator.port';
import { OTP_HASHER } from '../src/application/identity/ports/otp-hasher.port';
import { EMAIL_SENDER_PORT } from '../src/application/notifications/ports/email-sender.port';
import { RequestPasswordResetUseCase } from '../src/application/identity/use-cases/request-password-reset.usecase';
import { ConfirmPasswordResetUseCase } from '../src/application/identity/use-cases/confirm-password-reset.usecase';
import { InMemoryPasswordResetChallengeRepository } from './helpers/in-memory-repos';
import type { PasswordResetChallengeRepository } from '../src/domain/identity/ports/password-reset-challenge.repository';
import type { OtpGenerator } from '../src/application/identity/ports/otp-generator.port';
import type { OtpHasher } from '../src/application/identity/ports/otp-hasher.port';
import type { EmailSenderPort } from '../src/application/notifications/ports/email-sender.port';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Inactive Staff Request-Time Block (e2e)', () => {
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
      controllers: [AuthController, StaffController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: SESSION_REPOSITORY, useValue: sessionRepo },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        // Auth use-cases
        {
          provide: 'OWNER_SIGNUP_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: SessionRepository,
            h: PasswordHasher,
            ts: TokenService,
          ) => new OwnerSignupUseCase(ur, sr, h, ts),
          inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE],
        },
        {
          provide: 'LOGIN_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: SessionRepository,
            h: PasswordHasher,
            ts: TokenService,
          ) => new LoginUseCase(ur, sr, h, ts),
          inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, TOKEN_SERVICE],
        },
        {
          provide: 'REFRESH_USE_CASE',
          useFactory: (sr: SessionRepository, ur: UserRepository, ts: TokenService) =>
            new RefreshUseCase(sr, ur, ts),
          inject: [SESSION_REPOSITORY, USER_REPOSITORY, TOKEN_SERVICE],
        },
        {
          provide: 'LOGOUT_USE_CASE',
          useFactory: (sr: SessionRepository) => new LogoutUseCase(sr),
          inject: [SESSION_REPOSITORY],
        },
        { provide: PASSWORD_RESET_CHALLENGE_REPOSITORY, useValue: new InMemoryPasswordResetChallengeRepository() },
        { provide: OTP_GENERATOR, useValue: { generate: () => '000000' } },
        { provide: OTP_HASHER, useValue: { hash: async () => 'h', compare: async () => false } },
        { provide: EMAIL_SENDER_PORT, useValue: { send: async () => true } },
        {
          provide: 'REQUEST_PASSWORD_RESET_USE_CASE',
          useFactory: (
            ur: UserRepository,
            cr: PasswordResetChallengeRepository,
            og: OtpGenerator,
            oh: OtpHasher,
            es: EmailSenderPort,
          ) => new RequestPasswordResetUseCase(ur, cr, og, oh, es),
          inject: [USER_REPOSITORY, PASSWORD_RESET_CHALLENGE_REPOSITORY, OTP_GENERATOR, OTP_HASHER, EMAIL_SENDER_PORT],
        },
        {
          provide: 'CONFIRM_PASSWORD_RESET_USE_CASE',
          useFactory: (
            ur: UserRepository,
            sr: SessionRepository,
            cr: PasswordResetChallengeRepository,
            oh: OtpHasher,
            ph: PasswordHasher,
          ) => new ConfirmPasswordResetUseCase(ur, sr, cr, oh, ph),
          inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_RESET_CHALLENGE_REPOSITORY, OTP_HASHER, PASSWORD_HASHER],
        },
        // Staff use-cases
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
    sessionRepo.clear();
  });

  it('should block inactive staff from making API requests with existing token', async () => {
    // 1. Owner signs up
    const signupRes = await request(app.getHttpServer())
      .post('/api/v1/auth/owner/signup')
      .send({
        fullName: 'Owner User',
        phoneNumber: '+919876543210',
        email: 'owner@example.com',
        password: 'Password1!',
      })
      .expect(201);

    const ownerId = signupRes.body.data.user.id;

    // 2. Set academy for owner
    const owner = await userRepo.findById(ownerId);
    const ownerWithAcademy = User.reconstitute(ownerId, {
      ...owner!['props'],
      academyId: 'academy-1',
    });
    await userRepo.save(ownerWithAcademy);

    const ownerToken = jwtService.sign(
      { sub: ownerId, role: 'OWNER', email: 'owner@example.com', tokenVersion: 0 },
      { secret: 'test-access-secret', expiresIn: 900 },
    );

    // 3. Owner creates staff
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Staff User',
        phoneNumber: '+919876543211',
        email: 'staff@example.com',
        password: 'StaffPass1!',
      })
      .expect(201);

    const staffId = createRes.body.data.id;

    // 4. Staff logs in and gets a valid token
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'staff@example.com', password: 'StaffPass1!' })
      .expect(200);

    const staffToken = loginRes.body.data.accessToken;

    // 5. Staff can list staff (as a proof their token works — any authenticated endpoint would do)
    // Note: staff gets 403 from RBAC on /staff, but 403 != 401/inactive.
    // Let's use the auth/refresh flow instead to prove the token is valid first.
    // Actually, the guard runs BEFORE RBAC, so if inactive it returns 403 "User account is inactive"
    // If RBAC blocks it, it returns 403 "Forbidden resource" — different message.

    // 6. Owner deactivates staff (which bumps tokenVersion and revokes sessions)
    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${staffId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    // 7. Staff token is now invalid because tokenVersion was bumped
    // The guard should reject with 401 "Token revoked" since tokenVersion doesn't match
    const blockedRes = await request(app.getHttpServer())
      .get('/api/v1/staff')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(401);

    expect(blockedRes.body.message).toContain('Token revoked');

    // 8. Even if staff somehow had a token with the new tokenVersion,
    //    the inactive check would block them with 403
    const staffUser = await userRepo.findById(staffId);
    const forcedToken = jwtService.sign(
      {
        sub: staffId,
        role: 'STAFF',
        email: 'staff@example.com',
        tokenVersion: staffUser!.tokenVersion,
      },
      { secret: 'test-access-secret', expiresIn: 900 },
    );

    const inactiveRes = await request(app.getHttpServer())
      .get('/api/v1/staff')
      .set('Authorization', `Bearer ${forcedToken}`)
      .expect(403);

    expect(inactiveRes.body.message).toContain('inactive');
  });

  it('should allow reactivated staff to make requests again', async () => {
    // 1. Setup owner + academy
    const signupRes = await request(app.getHttpServer())
      .post('/api/v1/auth/owner/signup')
      .send({
        fullName: 'Owner User',
        phoneNumber: '+919876543210',
        email: 'owner@example.com',
        password: 'Password1!',
      })
      .expect(201);

    const ownerId = signupRes.body.data.user.id;
    const owner = await userRepo.findById(ownerId);
    const ownerWithAcademy = User.reconstitute(ownerId, {
      ...owner!['props'],
      academyId: 'academy-1',
    });
    await userRepo.save(ownerWithAcademy);

    const ownerToken = jwtService.sign(
      { sub: ownerId, role: 'OWNER', email: 'owner@example.com', tokenVersion: 0 },
      { secret: 'test-access-secret', expiresIn: 900 },
    );

    // 2. Create and deactivate staff
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Staff User',
        phoneNumber: '+919876543211',
        email: 'staff@example.com',
        password: 'StaffPass1!',
      })
      .expect(201);

    const staffId = createRes.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${staffId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    // 3. Reactivate staff
    await request(app.getHttpServer())
      .patch(`/api/v1/staff/${staffId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    // 4. Staff logs in again successfully
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'staff@example.com', password: 'StaffPass1!' })
      .expect(200);

    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.user.role).toBe('STAFF');
  });
});
