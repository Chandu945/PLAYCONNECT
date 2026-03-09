import { Injectable } from '@nestjs/common';
import type { EnvConfig } from './env.schema';
import { envSchema } from './env.schema';

@Injectable()
export class AppConfigService {
  private readonly config: EnvConfig;

  constructor() {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const formatted = result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Environment validation failed:\n${formatted}`);
    }
    this.config = result.data;
  }

  get appEnv(): EnvConfig['APP_ENV'] {
    return this.config.APP_ENV;
  }

  get nodeEnv(): EnvConfig['NODE_ENV'] {
    return this.config.NODE_ENV;
  }

  get port(): number {
    return this.config.PORT;
  }

  get tz(): string {
    return this.config.TZ;
  }

  get mongodbUri(): string | undefined {
    return this.config.MONGODB_URI;
  }

  get logLevel(): EnvConfig['LOG_LEVEL'] {
    return this.config.LOG_LEVEL;
  }

  get isProduction(): boolean {
    return this.config.APP_ENV === 'production';
  }

  get isDevelopment(): boolean {
    return this.config.APP_ENV === 'development';
  }

  get jwtAccessSecret(): string {
    return this.config.JWT_ACCESS_SECRET;
  }

  get jwtRefreshSecret(): string {
    return this.config.JWT_REFRESH_SECRET;
  }

  get jwtAccessTtl(): number {
    return this.config.JWT_ACCESS_TTL;
  }

  get jwtRefreshTtl(): number {
    return this.config.JWT_REFRESH_TTL;
  }

  get bcryptCost(): number {
    return this.config.BCRYPT_COST;
  }

  get smtpHost(): string {
    return this.config.SMTP_HOST;
  }

  get smtpPort(): number {
    return this.config.SMTP_PORT;
  }

  get smtpSecure(): boolean {
    return this.config.SMTP_SECURE;
  }

  get smtpUser(): string {
    return this.config.SMTP_USER;
  }

  get smtpPass(): string {
    return this.config.SMTP_PASS;
  }

  get smtpFrom(): string {
    return this.config.SMTP_FROM;
  }

  get emailDryRun(): boolean {
    return this.config.EMAIL_DRY_RUN;
  }

  get feeReminderEnabled(): boolean {
    return this.config.FEE_REMINDER_ENABLED;
  }

  get subscriptionTierCronEnabled(): boolean {
    return this.config.SUBSCRIPTION_TIER_CRON_ENABLED;
  }

  get indexAssertionEnabled(): boolean {
    return this.config.INDEX_ASSERTION_ENABLED;
  }

  get slowQueryThresholdMs(): number {
    return this.config.SLOW_QUERY_THRESHOLD_MS;
  }

  get swaggerEnabled(): boolean {
    return this.config.SWAGGER_ENABLED;
  }

  get swaggerToken(): string {
    return this.config.SWAGGER_TOKEN;
  }

  get metricsEnabled(): boolean {
    return this.config.METRICS_ENABLED;
  }

  get metricsToken(): string {
    return this.config.METRICS_TOKEN;
  }

  get errorTrackingDsn(): string {
    return this.config.ERROR_TRACKING_DSN;
  }

  get otpExpiryMinutes(): number {
    return this.config.OTP_EXPIRY_MINUTES;
  }

  get otpMaxAttempts(): number {
    return this.config.OTP_MAX_ATTEMPTS;
  }

  get otpCooldownSeconds(): number {
    return this.config.OTP_COOLDOWN_SECONDS;
  }

  get superAdminEmail(): string {
    return this.config.SUPER_ADMIN_EMAIL;
  }

  get superAdminPassword(): string {
    return this.config.SUPER_ADMIN_PASSWORD;
  }

  get externalCallTimeoutMs(): number {
    return this.config.EXTERNAL_CALL_TIMEOUT_MS;
  }

  get externalCallRetries(): number {
    return this.config.EXTERNAL_CALL_RETRIES;
  }

  get smtpTimeoutMs(): number {
    return this.config.SMTP_TIMEOUT_MS;
  }

  get shutdownGraceMs(): number {
    return this.config.SHUTDOWN_GRACE_MS;
  }

  get googleClientId(): string {
    return this.config.GOOGLE_CLIENT_ID;
  }

  get cloudinaryCloudName(): string {
    return this.config.CLOUDINARY_CLOUD_NAME;
  }

  get cloudinaryApiKey(): string {
    return this.config.CLOUDINARY_API_KEY;
  }

  get cloudinaryApiSecret(): string {
    return this.config.CLOUDINARY_API_SECRET;
  }

  get firebaseProjectId(): string {
    return this.config.FIREBASE_PROJECT_ID;
  }

  get firebaseServiceAccountJson(): string {
    return this.config.FIREBASE_SERVICE_ACCOUNT_JSON;
  }

  get cashfreeClientId(): string {
    return this.config.CASHFREE_CLIENT_ID;
  }

  get cashfreeClientSecret(): string {
    return this.config.CASHFREE_CLIENT_SECRET;
  }

  get cashfreeWebhookSecret(): string {
    return this.config.CASHFREE_WEBHOOK_SECRET;
  }

  get cashfreeApiVersion(): string {
    return this.config.CASHFREE_API_VERSION;
  }

  get cashfreeBaseUrl(): string {
    return this.config.CASHFREE_BASE_URL;
  }
}
