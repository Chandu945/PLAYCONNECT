import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from '../src/presentation/http/health/health.module';
import { GlobalExceptionFilter } from '../src/shared/errors/global-exception.filter';
import { RequestIdInterceptor } from '../src/shared/logging/request-id.interceptor';
import { AppConfigModule } from '../src/shared/config/config.module';
import { LoggingModule } from '../src/shared/logging/logging.module';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Request ID (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppConfigModule, LoggingModule, HealthModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApiVersioning(app);
    app.useGlobalInterceptors(new RequestIdInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should generate x-request-id when not provided', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/liveness').expect(200);

    const requestId = res.headers['x-request-id'] as string;
    expect(requestId).toBeDefined();
    expect(requestId.length).toBeGreaterThan(0);
    expect(res.body.requestId).toBe(requestId);
  });

  it('should propagate provided x-request-id', async () => {
    const customId = 'test-correlation-id-abc-123';
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/liveness')
      .set('X-Request-Id', customId)
      .expect(200);

    expect(res.headers['x-request-id']).toBe(customId);
    expect(res.body.requestId).toBe(customId);
  });

  it('should include requestId in error envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nonexistent-path').expect(404);

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.requestId).toBeDefined();
    expect(res.body.requestId.length).toBeGreaterThan(0);
  });

  it('should include requestId in error envelope with provided id', async () => {
    const customId = 'error-test-id-456';
    const res = await request(app.getHttpServer())
      .get('/api/v1/nonexistent-path')
      .set('X-Request-Id', customId)
      .expect(404);

    expect(res.headers['x-request-id']).toBe(customId);
    expect(res.body.requestId).toBe(customId);
  });
});
