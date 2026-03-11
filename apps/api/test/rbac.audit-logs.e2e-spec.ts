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
import { AuditLogsController } from '../src/presentation/http/audit-logs/audit-logs.controller';
import { USER_REPOSITORY } from '../src/domain/identity/ports/user.repository';
import { AUDIT_LOG_REPOSITORY } from '../src/domain/audit/ports/audit-log.repository';
import { TOKEN_SERVICE } from '../src/application/identity/ports/token-service.port';
import { ListAuditLogsUseCase } from '../src/application/audit/use-cases/list-audit-logs.usecase';
import { InMemoryUserRepository, InMemoryAuditLogRepository } from './helpers/in-memory-repos';
import { createTestTokenService } from './helpers/test-services';
import { User } from '../src/domain/identity/entities/user.entity';
import type { UserRepository } from '../src/domain/identity/ports/user.repository';
import type { AuditLogRepository } from '../src/domain/audit/ports/audit-log.repository';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('RBAC — Audit Logs Endpoints (e2e)', () => {
  let app: INestApplication;
  let userRepo: InMemoryUserRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
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
    auditLogRepo = new InMemoryAuditLogRepository();
    jwtService = new JwtService({});
    const tokenService = createTestTokenService(jwtService);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        LoggingModule,
        JwtModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [AuditLogsController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: AUDIT_LOG_REPOSITORY, useValue: auditLogRepo },
        { provide: TOKEN_SERVICE, useValue: tokenService },
        {
          provide: 'LIST_AUDIT_LOGS_USE_CASE',
          useFactory: (ur: UserRepository, alr: AuditLogRepository) =>
            new ListAuditLogsUseCase(ur, alr),
          inject: [USER_REPOSITORY, AUDIT_LOG_REPOSITORY],
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
    auditLogRepo.clear();
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
    it('should reject unauthenticated GET /audit-logs (401)', async () => {
      await request(app.getHttpServer()).get('/api/v1/audit-logs').expect(401);
    });
  });

  describe('STAFF — forbidden', () => {
    it('should reject STAFF from viewing audit logs (403)', async () => {
      await seedStaff();
      const token = makeToken('staff-1', 'STAFF');

      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('SUPER_ADMIN — forbidden', () => {
    it('should reject SUPER_ADMIN from viewing audit logs (403)', async () => {
      seedUser('admin-1', 'SUPER_ADMIN');
      const token = makeToken('admin-1', 'SUPER_ADMIN');

      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('OWNER — allowed', () => {
    it('should allow OWNER to view audit logs (200)', async () => {
      await seedOwner();
      const token = makeToken('owner-1', 'OWNER');

      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });
});
