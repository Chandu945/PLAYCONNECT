import { Test } from '@nestjs/testing';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { setupSwagger } from '../src/presentation/swagger/swagger.setup';
import { configureApiVersioning } from '../src/shared/config/api-versioning';

/** Minimal controller so the test app boots. */
@Controller('health')
class StubController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}

async function createApp(swaggerEnabled: boolean, swaggerToken = ''): Promise<INestApplication> {
  const mod = await Test.createTestingModule({
    controllers: [StubController],
  }).compile();

  const app = mod.createNestApplication();
  configureApiVersioning(app);

  const config = { swaggerEnabled, swaggerToken } as any;
  const logger = { info: jest.fn() } as any;
  setupSwagger(app, config, logger);

  await app.init();
  return app;
}

describe('Swagger Gating (e2e)', () => {
  describe('when SWAGGER_ENABLED=false', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp(false);
    });
    afterAll(async () => {
      await app.close();
    });

    it('docs-json returns 404', async () => {
      await request(app.getHttpServer()).get('/api/v1/docs-json').expect(404);
    });

    it('docs returns 404', async () => {
      await request(app.getHttpServer()).get('/api/v1/docs').expect(404);
    });
  });

  describe('when SWAGGER_ENABLED=true, no token', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createApp(true);
    });
    afterAll(async () => {
      await app.close();
    });

    it('docs-json returns 200 with OpenAPI spec', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/docs-json').expect(200);

      expect(res.body.openapi).toBeDefined();
      expect(res.body.info.title).toBe('PlayConnect API');
    });

    it('docs returns 200 or redirect', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/docs');
      // SwaggerModule may 301-redirect to /api/v1/docs/ or serve 200
      expect([200, 301]).toContain(res.status);
    });
  });

  describe('when SWAGGER_ENABLED=true + SWAGGER_TOKEN set', () => {
    let app: INestApplication;
    const TOKEN = 'my-secret-swagger-token';

    beforeAll(async () => {
      app = await createApp(true, TOKEN);
    });
    afterAll(async () => {
      await app.close();
    });

    it('docs-json without token returns 404', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/docs-json').expect(404);

      expect(res.body).toEqual({ statusCode: 404, message: 'Not Found' });
    });

    it('docs-json with wrong token returns 404', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/docs-json')
        .set('x-swagger-token', 'wrong')
        .expect(404);
    });

    it('docs-json with correct token returns 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/docs-json')
        .set('x-swagger-token', TOKEN)
        .expect(200);

      expect(res.body.openapi).toBeDefined();
    });

    it('docs without token returns 404', async () => {
      await request(app.getHttpServer()).get('/api/v1/docs').expect(404);
    });

    it('docs with correct token is accessible', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/docs')
        .set('x-swagger-token', TOKEN);

      expect([200, 301]).toContain(res.status);
    });
  });
});
