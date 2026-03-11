import { z } from 'zod';

const UNSAFE_DEFAULTS = {
  JWT_ACCESS_SECRET: 'dev-access-secret-change-me',
  JWT_REFRESH_SECRET: 'dev-refresh-secret-change-me',
  SUPER_ADMIN_PASSWORD: 'change-me-in-production',
} as const;

export const envSchema = z
  .object({
    APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    TZ: z.string().default('Asia/Kolkata'),
    MONGODB_URI: z.string().startsWith('mongodb').optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // JWT
    JWT_ACCESS_SECRET: z.string().default(UNSAFE_DEFAULTS.JWT_ACCESS_SECRET),
    JWT_REFRESH_SECRET: z.string().default(UNSAFE_DEFAULTS.JWT_REFRESH_SECRET),
    JWT_ACCESS_TTL: z.coerce.number().int().positive().default(86400), // 1 day in seconds
    JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000), // 30 days in seconds

    // Bcrypt
    BCRYPT_COST: z.coerce.number().int().min(4).max(31).default(12),

    // SMTP / Email
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    SMTP_FROM: z.string().default('noreply@playconnect.app'),
    EMAIL_DRY_RUN: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    FEE_REMINDER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SUBSCRIPTION_TIER_CRON_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    // Performance
    INDEX_ASSERTION_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SLOW_QUERY_THRESHOLD_MS: z.coerce.number().int().positive().default(200),

    // Swagger
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SWAGGER_TOKEN: z.string().default(''),

    // Observability
    METRICS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    METRICS_TOKEN: z.string().default(''),
    ERROR_TRACKING_DSN: z.string().default(''),

    // OTP / Password Reset
    OTP_EXPIRY_MINUTES: z.coerce.number().int().positive().default(10),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),

    // Super Admin
    SUPER_ADMIN_EMAIL: z.string().default('admin@playconnect.app'),
    SUPER_ADMIN_PASSWORD: z.string().default(UNSAFE_DEFAULTS.SUPER_ADMIN_PASSWORD),

    // Reliability
    EXTERNAL_CALL_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10_000),
    EXTERNAL_CALL_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
    SMTP_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10_000),
    SHUTDOWN_GRACE_MS: z.coerce.number().int().min(1000).default(20_000),

    // Google OAuth
    GOOGLE_CLIENT_ID: z.string().default(''),

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: z.string().default(''),
    CLOUDINARY_API_KEY: z.string().default(''),
    CLOUDINARY_API_SECRET: z.string().default(''),

    // Firebase (Push Notifications)
    FIREBASE_PROJECT_ID: z.string().default(''),
    FIREBASE_SERVICE_ACCOUNT_JSON: z.string().default(''),

    // CORS
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:8081'),

    // Cashfree Payment Gateway
    CASHFREE_CLIENT_ID: z.string().default(''),
    CASHFREE_CLIENT_SECRET: z.string().default(''),
    CASHFREE_WEBHOOK_SECRET: z.string().default(''),
    CASHFREE_API_VERSION: z.string().default('2025-01-01'),
    CASHFREE_BASE_URL: z.string().default('https://sandbox.cashfree.com/pg'),
  })
  .superRefine((val, ctx) => {
    if (val.APP_ENV !== 'production' && val.APP_ENV !== 'staging') return;

    if (val.JWT_ACCESS_SECRET === UNSAFE_DEFAULTS.JWT_ACCESS_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET must be changed from its default value in production/staging',
      });
    }
    if (val.JWT_REFRESH_SECRET === UNSAFE_DEFAULTS.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must be changed from its default value in production/staging',
      });
    }
    if (val.SUPER_ADMIN_PASSWORD === UNSAFE_DEFAULTS.SUPER_ADMIN_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPER_ADMIN_PASSWORD'],
        message: 'SUPER_ADMIN_PASSWORD must be changed from its default value in production/staging',
      });
    }
    if (!val.MONGODB_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MONGODB_URI'],
        message: 'MONGODB_URI is required in production/staging',
      });
    }
    if (val.SMTP_HOST === 'localhost') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST must not be localhost in production/staging',
      });
    }
    if (!val.CASHFREE_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CASHFREE_WEBHOOK_SECRET'],
        message: 'CASHFREE_WEBHOOK_SECRET is required in production/staging',
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;
