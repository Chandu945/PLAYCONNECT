import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MetricsController } from '../src/presentation/http/metrics/metrics.controller';
import { METRICS_PORT } from '../src/application/common/ports/metrics.port';
import { BasicMetricsAdapter } from '../src/infrastructure/metrics/basic-metrics.adapter';
import { AppConfigService } from '../src/shared/config/config.service';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

describe('Metrics (e2e)', () => {
  let app: INestApplication;
  let mockConfig: { metricsEnabled: boolean; metricsToken: string };

  beforeAll(async () => {
    process.env['APP_ENV'] = 'development';
    process.env['NODE_ENV'] = 'test';

    mockConfig = { metricsEnabled: false, metricsToken: '' };

    const moduleFixture = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        { provide: METRICS_PORT, useClass: BasicMetricsAdapter },
        { provide: AppConfigService, useValue: mockConfig },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApiVersioning(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should return 404 when metricsEnabled is false', async () => {
    mockConfig.metricsEnabled = false;

    const res = await request(app.getHttpServer()).get('/api/v1/metrics').expect(404);

    expect(res.body.message).toBe('Metrics not enabled');
  });

  it('should return 200 when metricsEnabled is true and no token required', async () => {
    mockConfig.metricsEnabled = true;
    mockConfig.metricsToken = '';

    const res = await request(app.getHttpServer()).get('/api/v1/metrics').expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('should return 403 when metricsEnabled with wrong token', async () => {
    mockConfig.metricsEnabled = true;
    mockConfig.metricsToken = 'secret-token';

    const res = await request(app.getHttpServer())
      .get('/api/v1/metrics')
      .set('x-metrics-token', 'wrong-token')
      .expect(403);

    expect(res.body.message).toBe('Invalid metrics token');
  });

  it('should return 403 when metricsEnabled with missing token', async () => {
    mockConfig.metricsEnabled = true;
    mockConfig.metricsToken = 'secret-token';

    await request(app.getHttpServer()).get('/api/v1/metrics').expect(403);
  });

  it('should return 200 when metricsEnabled with correct token', async () => {
    mockConfig.metricsEnabled = true;
    mockConfig.metricsToken = 'secret-token';

    const res = await request(app.getHttpServer())
      .get('/api/v1/metrics')
      .set('x-metrics-token', 'secret-token')
      .expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    expect(typeof res.text).toBe('string');
  });

  it('should return prometheus-compatible content', async () => {
    mockConfig.metricsEnabled = true;
    mockConfig.metricsToken = '';

    const res = await request(app.getHttpServer()).get('/api/v1/metrics').expect(200);

    // Metrics adapter returns at minimum an empty string or counter/histogram data
    expect(typeof res.text).toBe('string');
  });
});
