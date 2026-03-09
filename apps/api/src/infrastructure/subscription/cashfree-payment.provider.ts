import { Injectable, Inject } from '@nestjs/common';
import type { PaymentProviderPort } from '@application/subscription/ports/payment-provider.port';
import {
  CASHFREE_GATEWAY,
  type CashfreeGatewayPort,
} from '@domain/subscription-payments/ports/cashfree-gateway.port';
import {
  priceForTier,
  generateOrderId,
} from '@domain/subscription-payments/rules/subscription-payment.rules';
import type { TierKey } from '@playconnect/contracts';
import { LOGGER_PORT, type LoggerPort } from '@shared/logging/logger.port';
import { AppConfigService } from '@shared/config/config.service';
import { randomUUID } from 'node:crypto';

@Injectable()
export class CashfreePaymentProvider implements PaymentProviderPort {
  constructor(
    @Inject(CASHFREE_GATEWAY) private readonly gateway: CashfreeGatewayPort,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
    private readonly config: AppConfigService,
  ) {}

  async createCheckout(academyId: string, tierKey: string): Promise<{ checkoutUrl: string }> {
    const amountInr = priceForTier(tierKey as TierKey);
    const orderId = generateOrderId();
    const idempotencyKey = randomUUID();

    const result = await this.gateway.createOrder({
      orderId,
      orderAmount: amountInr,
      orderCurrency: 'INR',
      customerId: academyId,
      customerPhone: '9999999999',
      idempotencyKey,
    });

    this.logger.info('Cashfree checkout session created', {
      academyId,
      tierKey,
      orderId,
      amountInr,
    });

    // Build the Cashfree hosted checkout URL using the payment session ID
    const baseUrl = this.config.cashfreeBaseUrl;
    const isSandbox = baseUrl.includes('sandbox');
    const checkoutHost = isSandbox
      ? 'https://sandbox.cashfree.com/pg/web/checkout'
      : 'https://cashfree.com/pg/web/checkout';

    const checkoutUrl = `${checkoutHost}?payment_session_id=${result.paymentSessionId}`;

    return { checkoutUrl };
  }

  async handleWebhook(_payload: unknown): Promise<void> {
    // Webhook handling is done by HandleCashfreeWebhookUseCase via the controller.
    // This method exists to satisfy the port interface.
    this.logger.warn('CashfreePaymentProvider.handleWebhook called directly — use the webhook controller instead');
  }
}
