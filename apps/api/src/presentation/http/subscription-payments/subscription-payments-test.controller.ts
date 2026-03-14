import {
  Controller,
  Post,
  Get,
  Body,
  Inject,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  CASHFREE_GATEWAY,
  type CashfreeGatewayPort,
} from '@domain/subscription-payments/ports/cashfree-gateway.port';
import { LOGGER_PORT, type LoggerPort } from '@shared/logging/logger.port';
import { AppConfigService } from '@shared/config/config.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { randomUUID } from 'node:crypto';

/**
 * Test endpoints for Cashfree payment testing in development/sandbox mode.
 * These endpoints are NEVER available in production.
 * Protected by SUPER_ADMIN guard as defense-in-depth.
 */
@ApiTags('Subscription Payments – Test')
@Controller('subscription-payments/test')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('SUPER_ADMIN')
@SkipThrottle()
export class SubscriptionPaymentsTestController {
  constructor(
    @Inject(CASHFREE_GATEWAY) private readonly gateway: CashfreeGatewayPort,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
    private readonly config: AppConfigService,
  ) {}

  /**
   * POST /api/v1/subscription-payments/test/simulate-webhook
   *
   * Simulates a Cashfree webhook for a given orderId and status.
   * Useful for testing without the actual Cashfree dashboard.
   */
  @Post('simulate-webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[DEV ONLY] Simulate a Cashfree subscription webhook' })
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

    this.logger.info('[TEST] Simulated subscription webhook', {
      orderId: body.orderId,
      status: body.status,
    });

    return {
      message: 'Simulated webhook payload generated. Forward this to POST /api/v1/subscription-payments/cashfree/webhook with valid signature headers.',
      payload,
    };
  }

  /**
   * GET /api/v1/subscription-payments/test/sandbox-info
   *
   * Returns info about the sandbox configuration (base URL, whether credentials are set).
   * Never returns actual secrets.
   */
  @Get('sandbox-info')
  @ApiOperation({ summary: '[DEV ONLY] Get Cashfree sandbox configuration info' })
  async sandboxInfo() {
    this.assertDevelopment();

    return {
      appEnv: this.config.appEnv,
      cashfreeBaseUrl: this.config.cashfreeBaseUrl,
      isSandbox: this.config.cashfreeBaseUrl.includes('sandbox'),
      clientIdConfigured: !!this.config.cashfreeClientId,
      clientSecretConfigured: !!this.config.cashfreeClientSecret,
      webhookSecretConfigured: !!this.config.cashfreeWebhookSecret,
      apiVersion: this.config.cashfreeApiVersion,
    };
  }

  /**
   * POST /api/v1/subscription-payments/test/create-test-order
   *
   * Creates a test order directly via the Cashfree sandbox API.
   * Returns the checkout URL for manual testing.
   */
  @Post('create-test-order')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[DEV ONLY] Create a test Cashfree order for manual checkout' })
  async createTestOrder(
    @Body() body: { amount?: number; customerId?: string; customerPhone?: string },
  ) {
    this.assertDevelopment();

    const orderId = `test_${Date.now()}_${randomUUID().substring(0, 8)}`;
    const amount = body.amount ?? 999;
    const customerId = body.customerId ?? `test_customer_${randomUUID().substring(0, 8)}`;
    const customerPhone = body.customerPhone ?? '9999999999';

    const result = await this.gateway.createOrder({
      orderId,
      orderAmount: amount,
      orderCurrency: 'INR',
      customerId,
      customerPhone,
      idempotencyKey: randomUUID(),
    });

    const baseUrl = this.config.cashfreeBaseUrl;
    const isSandbox = baseUrl.includes('sandbox');
    const checkoutHost = isSandbox
      ? 'https://sandbox.cashfree.com/pg/web/checkout'
      : 'https://cashfree.com/pg/web/checkout';

    const checkoutUrl = `${checkoutHost}?payment_session_id=${result.paymentSessionId}`;

    this.logger.info('[TEST] Created test order', {
      orderId,
      amount,
      cfOrderId: result.cfOrderId,
    });

    return {
      orderId,
      cfOrderId: result.cfOrderId,
      paymentSessionId: result.paymentSessionId,
      checkoutUrl,
      expiresAt: result.orderExpiryTime,
    };
  }

  private assertDevelopment(): void {
    if (this.config.appEnv !== 'development') {
      throw new ForbiddenException('Test endpoints are only available in development mode');
    }
  }
}
