import { z } from 'zod';

const serverSchema = z.object({
  API_BASE_URL: z.string().url(),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
  COOKIE_SALT: z
    .string()
    .min(16, 'COOKIE_SALT must be at least 16 characters')
    .regex(/^[0-9a-f]+$/i, 'COOKIE_SALT must be a hex string'),
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
});

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  if (cachedServerEnv) return cachedServerEnv;
  cachedServerEnv = serverSchema.parse({
    API_BASE_URL: process.env.API_BASE_URL,
    COOKIE_SECRET: process.env.COOKIE_SECRET,
    COOKIE_SALT: process.env.COOKIE_SALT,
  });
  return cachedServerEnv;
}

let cachedPublicEnv: z.infer<typeof publicSchema> | null = null;

export function publicEnv() {
  if (cachedPublicEnv) return cachedPublicEnv;
  cachedPublicEnv = publicSchema.parse({
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  });
  return cachedPublicEnv;
}
