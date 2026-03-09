import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppConfigService } from '@shared/config/config.service';
import { randomUUID } from 'node:crypto';

/**
 * Test endpoints for Cashfree fee payment testing in development/sandbox mode.
 * These endpoints are NEVER available in production.
 */
@ApiTags('Parent Fee Payments – Test')
@Controller('parent/fee-payments/test')
@SkipThrottle()
export class FeePaymentTestController {
  constructor(private readonly config: AppConfigService) {}

  /**
   * POST /api/v1/parent/fee-payments/test/simulate-webhook
   *
   * Simulates a Cashfree fee payment webhook for a given orderId and status.
   * Useful for testing without the actual Cashfree dashboard.
   */
  @Post('simulate-webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[DEV ONLY] Simulate a Cashfree fee payment webhook' })
  async simulateWebhook(
    @Body() body: { orderId: string; status: 'SUCCESS' | 'FAILED' | 'USER_DROPPED'; cfPaymentId?: string },
  ) {
    this.assertDevelopment();

    const payload = {
      data: {
        order: {
          order_id: body.orderId,
        },
        payment: {
          payment_status: body.status,
          cf_payment_id: body.cfPaymentId ?? `test_cf_${randomUUID().substring(0, 8)}`,
        },
      },
    };

    return {
      message: 'Simulated webhook payload generated. Forward this to POST /api/v1/parent/fee-payments/cashfree/webhook with valid signature headers.',
      payload,
    };
  }

  private assertDevelopment(): void {
    if (this.config.appEnv !== 'development') {
      throw new ForbiddenException('Test endpoints are only available in development mode');
    }
  }
}
