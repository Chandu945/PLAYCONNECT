import { VersioningType, type INestApplication } from '@nestjs/common';

/** Global route prefix (before version segment). */
export const API_PREFIX = 'api';

/** Default API version applied to all controllers. */
export const DEFAULT_API_VERSION = '1';

/**
 * Configure NestJS native URI versioning.
 *
 * All routes become `/api/v{version}/...`.
 * Controllers default to v1 unless explicitly overridden with `@Version('2')`.
 */
export function configureApiVersioning(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: DEFAULT_API_VERSION,
  });
}
