import type { INestApplication, Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from '../../src/shared/config/config.module';
import { LoggingModule } from '../../src/shared/logging/logging.module';
import { GlobalExceptionFilter } from '../../src/shared/errors/global-exception.filter';
import { RequestIdInterceptor } from '../../src/shared/logging/request-id.interceptor';
import { configureApiVersioning } from '../../src/shared/config/api-versioning';
import { createGlobalValidationPipe } from '../../src/shared/validation/validation.pipe';
import { USER_REPOSITORY } from '../../src/domain/identity/ports/user.repository';
import { TOKEN_SERVICE } from '../../src/application/identity/ports/token-service.port';
import { createTestTokenService } from '../helpers/test-services';
import type { TestRepositories } from './test-db';

/** Standard test environment variables. */
export function setTestEnv(): void {
  process.env['APP_ENV'] = 'development';
  process.env['NODE_ENV'] = 'test';
  process.env['PORT'] = '3001';
  process.env['TZ'] = 'Asia/Kolkata';
  process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-that-is-at-least-32-characters-long';
  process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-that-is-at-least-32-characters-long';
  process.env['BCRYPT_COST'] = '4';
}

export interface TestAppOptions {
  controllers: Type[];
  repos: TestRepositories;
  providers?: any[];
}

/**
 * Create a NestJS TestingModuleBuilder with standard imports and common providers.
 * Add controller-specific use-case providers via `options.providers`.
 */
export function createTestModuleBuilder(options: TestAppOptions): {
  builder: TestingModuleBuilder;
  jwtService: JwtService;
} {
  const jwtService = new JwtService({});
  const tokenService = createTestTokenService(jwtService);

  const builder = Test.createTestingModule({
    imports: [
      AppConfigModule,
      LoggingModule,
      JwtModule.register({}),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ],
    controllers: options.controllers,
    providers: [
      { provide: USER_REPOSITORY, useValue: options.repos.userRepo },
      { provide: TOKEN_SERVICE, useValue: tokenService },
      ...(options.providers ?? []),
    ],
  });

  return { builder, jwtService };
}

/** Bootstrap a test app with standard global prefix, interceptors, filters, pipes. */
export async function bootstrapTestApp(builder: TestingModuleBuilder): Promise<INestApplication> {
  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication();
  configureApiVersioning(app);
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(createGlobalValidationPipe());
  await app.init();
  return app;
}
