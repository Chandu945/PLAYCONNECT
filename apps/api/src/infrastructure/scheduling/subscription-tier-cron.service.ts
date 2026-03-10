import { Injectable, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RecomputePendingTiersUseCase } from '@application/subscription/use-cases/recompute-pending-tiers.usecase';
import { AppConfigService } from '@shared/config/config.service';
import type { JobLockPort } from '@application/common/ports/job-lock.port';
import { JOB_LOCK_PORT } from '@application/common/ports/job-lock.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import { LOGGER_PORT } from '@shared/logging/logger.port';

const LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class SubscriptionTierCronService {
  constructor(
    @Inject('RECOMPUTE_PENDING_TIERS_USE_CASE')
    private readonly recomputeTiers: RecomputePendingTiersUseCase,
    private readonly config: AppConfigService,
    @Inject(JOB_LOCK_PORT)
    private readonly jobLock: JobLockPort,
    @Inject(LOGGER_PORT)
    private readonly logger: LoggerPort,
  ) {}

  @Cron('30 0 * * *', { timeZone: 'Asia/Kolkata' })
  async handleTierRecomputation(): Promise<void> {
    if (!this.config.subscriptionTierCronEnabled) {
      this.logger.debug('Subscription tier cron: disabled, skipping');
      return;
    }

    await this.jobLock.withLock('subscription-tier-recompute', LOCK_TTL_MS, async () => {
      try {
        const result = await this.recomputeTiers.execute();
        this.logger.info('Subscription tier cron completed', {
          processed: result.processed,
          errors: result.errors,
        });
      } catch (error) {
        this.logger.error('Subscription tier cron failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
}
