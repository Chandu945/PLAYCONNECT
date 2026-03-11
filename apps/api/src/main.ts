// Load .env before anything else
import { config } from 'dotenv';
config();

// Enforce timezone before anything else
process.env['TZ'] ||= 'Asia/Kolkata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './shared/errors/global-exception.filter';
import { RequestIdInterceptor } from './shared/logging/request-id.interceptor';
import { createGlobalValidationPipe } from './shared/validation/validation.pipe';
import { SanitizePipe } from './presentation/http/common/pipes/sanitize.pipe';
import { AppConfigService } from './shared/config/config.service';
import { LOGGER_PORT } from './shared/logging/logger.port';
import type { LoggerPort } from './shared/logging/logger.port';
import { setupSwagger } from './presentation/swagger/swagger.setup';
import { configureApiVersioning } from './shared/config/api-versioning';

const SHUTDOWN_GRACE_MS = 20_000;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // Enable graceful shutdown hooks (onModuleDestroy, beforeApplicationShutdown, onApplicationShutdown)
  app.enableShutdownHooks();

  const config = app.get(AppConfigService);
  const logger = app.get<LoggerPort>(LOGGER_PORT);

  // NestJS native URI versioning — routes: /api/v1/...
  configureApiVersioning(app);

  // Security
  app.use(helmet());

  // Request body size limits
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ limit: '1mb', extended: true }));

  // CORS — restrict to configured origins
  const allowedOrigins = config.corsAllowedOrigins;
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global interceptors, filters, pipes
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(new SanitizePipe(), createGlobalValidationPipe());

  // Swagger (env-gated)
  setupSwagger(app, config, logger);

  const port = config.port;
  await app.listen(port);
  logger.info(`PlayConnect API running on port ${port}`, {
    port,
    env: config.appEnv,
  });

  // Graceful shutdown: log and allow grace period for in-flight work
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.info(`Received ${signal}, starting graceful shutdown`, { graceMs: SHUTDOWN_GRACE_MS });
      setTimeout(() => {
        logger.warn('Graceful shutdown grace period expired, forcing exit');
        process.exit(1);
      }, SHUTDOWN_GRACE_MS).unref();
    });
  }
}

void bootstrap();
