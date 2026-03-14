import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import type { GetMySubscriptionUseCase } from '@application/subscription/use-cases/get-my-subscription.usecase';
import { LOGGER_PORT } from '@shared/logging/logger.port';
import type { LoggerPort } from '@shared/logging/logger.port';

/** Path prefixes that are always allowed regardless of subscription status */
const ALLOWED_PREFIXES = [
  '/api/v1/subscription',
  '/api/v1/auth',
  '/api/v1/health',
  '/api/v1/admin',
  '/api/v1/academy',
  '/api/v1/parent',
];

@Injectable()
export class SubscriptionEnforcementGuard implements CanActivate {
  constructor(
    @Inject('GET_MY_SUBSCRIPTION_USE_CASE')
    private readonly getSubscription: GetMySubscriptionUseCase,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path;

    // Allow all allowlisted paths
    if (ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return true;
    }

    // If no user on request (unauthenticated), let auth guard handle it
    const user = (request as unknown as Record<string, unknown>)['user'] as
      | { userId?: string; role?: string }
      | undefined;

    if (!user?.userId) {
      return true;
    }

    const result = await this.getSubscription.execute(user.userId);

    // Allow through if user hasn't set up academy yet (onboarding flow)
    if (!result.ok) {
      if (result.error.code === 'ACADEMY_SETUP_REQUIRED') {
        return true;
      }
      this.logger.error('Subscription check failed — denying access', {
        userId: user.userId,
        errorCode: result.error.code,
        path,
      });
      throw new ForbiddenException({
        statusCode: 403,
        error: 'SubscriptionCheckFailed',
        message: 'Unable to verify subscription status. Please try again.',
      });
    }

    // Cache on request for later use
    (request as unknown as Record<string, unknown>)['subscriptionStatus'] = result.value;

    if (!result.value.canAccessApp) {
      this.logger.warn('Subscription enforcement blocked request', {
        userId: user.userId,
        subscriptionStatus: result.value.status,
        path,
        method: request.method,
      });

      // Differentiate DISABLED (admin action) from subscription-level blocking
      const isDisabled = result.value.status === 'DISABLED';

      throw new ForbiddenException({
        statusCode: 403,
        error: isDisabled ? 'AcademyLoginDisabled' : 'SubscriptionBlocked',
        message: isDisabled
          ? 'Academy access has been disabled by administrator.'
          : 'Subscription inactive. Access limited to subscription management.',
        details: [{ status: result.value.status }],
      });
    }

    return true;
  }
}
