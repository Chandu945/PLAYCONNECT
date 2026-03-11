import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { GlobalExceptionFilter } from '../src/shared/errors/global-exception.filter';
import { RequestIdInterceptor } from '../src/shared/logging/request-id.interceptor';
import { createGlobalValidationPipe } from '../src/shared/validation/validation.pipe';
import { AppConfigModule } from '../src/shared/config/config.module';
import { LoggingModule } from '../src/shared/logging/logging.module';
import { HealthController } from '../src/presentation/http/health/health.controller';
import { MongoDbModule } from '../src/infrastructure/database/mongodb.module';
import { MongoDbHealthIndicator } from '../src/infrastructure/database/mongodb.health';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Health Endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '3001';
    process.env['TZ'] = 'Asia/Kolkata';
    // No MONGODB_URI — tests should handle not_configured state
    delete process.env['MONGODB_URI'];

    const moduleFixture = await Test.createTestingModule({
      imports: [AppConfigModule, LoggingModule, MongoDbModule.forTest()],
      controllers: [HealthController],
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

  describe('GET /api/v1/health/liveness', () => {
    it('should return 200 with liveness response', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health/liveness').expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('playconnect-api');
      expect(res.body.time).toBeDefined();
      expect(new Date(res.body.time).toISOString()).toBe(res.body.time);
      expect(res.body.requestId).toBeDefined();
      expect(typeof res.body.requestId).toBe('string');
    });

    it('should return X-Request-Id header', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health/liveness').expect(200);

      expect(res.headers['x-request-id']).toBeDefined();
      expect(typeof res.headers['x-request-id']).toBe('string');
    });

    it('should propagate a provided X-Request-Id', async () => {
      const customId = 'custom-test-id-123';
      const res = await request(app.getHttpServer())
        .get('/api/v1/health/liveness')
        .set('X-Request-Id', customId)
        .expect(200);

      expect(res.headers['x-request-id']).toBe(customId);
      expect(res.body.requestId).toBe(customId);
    });
  });

  describe('GET /api/v1/health/readiness', () => {
    it('should return readiness with not_configured mongodb when no URI', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health/readiness').expect(200);

      expect(res.body.service).toBe('playconnect-api');
      expect(res.body.time).toBeDefined();
      expect(res.body.requestId).toBeDefined();
      expect(res.body.dependencies).toBeDefined();
      expect(res.body.dependencies.mongodb).toBe('not_configured');
      expect(res.body.status).toBe('ok');
    });
  });

  describe('readiness — DB down', () => {
    let dbDownApp: INestApplication;

    beforeAll(async () => {
      const moduleFixture = await Test.createTestingModule({
        imports: [AppConfigModule, LoggingModule, MongoDbModule.forTest()],
        controllers: [HealthController],
      })
        .overrideProvider(MongoDbHealthIndicator)
        .useValue({ check: async () => 'down' })
        .compile();

      dbDownApp = moduleFixture.createNestApplication();
      configureApiVersioning(dbDownApp);
      dbDownApp.useGlobalInterceptors(new RequestIdInterceptor());
      dbDownApp.useGlobalFilters(new GlobalExceptionFilter());
      dbDownApp.useGlobalPipes(createGlobalValidationPipe());
      await dbDownApp.init();
    });

    afterAll(async () => {
      if (dbDownApp) await dbDownApp.close();
    });

    it('should return 503 when MongoDB is down', async () => {
      const res = await request(dbDownApp.getHttpServer())
        .get('/api/v1/health/readiness')
        .expect(503);

      expect(res.body.status).toBe('unavailable');
      expect(res.body.dependencies.mongodb).toBe('down');
      expect(res.body.requestId).toBeDefined();
      expect(res.body.service).toBe('playconnect-api');
      expect(res.body.time).toBeDefined();
    });
  });

  describe('GET /api/v1/does-not-exist (404)', () => {
    it('should return standardized error envelope', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

      expect(res.body.statusCode).toBe(404);
      expect(res.body.error).toBe('NotFound');
      expect(res.body.path).toBe('/api/v1/does-not-exist');
      expect(res.body.method).toBe('GET');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.requestId).toBeDefined();
      expect(res.headers['x-request-id']).toBeDefined();
    });
  });
});
