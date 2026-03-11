/**
 * Generates the Swagger/OpenAPI spec as a JSON file.
 * Used by contract:check to validate the spec.
 */
// Ensure env is set before imports
process.env['TZ'] ||= 'Asia/Kolkata';
process.env['APP_ENV'] ||= 'development';
process.env['NODE_ENV'] ||= 'development';
process.env['PORT'] ||= '3001';

import { NestFactory } from '@nestjs/core';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './presentation/swagger/swagger.setup';
import { configureApiVersioning } from './shared/config/api-versioning';

async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApiVersioning(app);

  const document = buildOpenApiDocument(app);

  const outDir = join(process.cwd(), 'artifacts');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'swagger.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2));

  process.stderr.write(`Swagger spec written to ${outPath}\n`);
  await app.close();
  process.exit(0);
}

generate().catch((err) => {
  process.stderr.write(`Failed to generate swagger: ${err}\n`);
  process.exit(1);
});
