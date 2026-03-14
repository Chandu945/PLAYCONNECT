import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Req,
  Headers,
  Inject,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import type { HandleFeePaymentWebhookUseCase } from '@application/parent/use-cases/handle-fee-payment-webhook.usecase';
import type { Request } from 'express';

@ApiTags('Parent Fee Payments')
@Controller('parent/fee-payments')
export class FeePaymentWebhookController {
  constructor(
    @Inject('HANDLE_FEE_PAYMENT_WEBHOOK_USE_CASE')
    private readonly handleWebhook: HandleFeePaymentWebhookUseCase,
  ) {}

  @Post('cashfree/webhook')
  @Public()
  @Throttle({ default: { limit: 1000, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cashfree fee payment webhook (public, signature-verified)' })
  async webhook(
    @Req() req: Request,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') timestamp: string,
  ) {
    if (!signature || !timestamp) {
      throw new BadRequestException('Missing webhook signature headers');
    }

    const rawBody = (req as RawBodyRequest).rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body not available for webhook verification');
    }

    const result = await this.handleWebhook.execute(rawBody, { signature, timestamp });

    if (!result.ok) {
      if (result.error.code === 'UNAUTHORIZED') {
        throw new UnauthorizedException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }

    return { success: true };
  }
}

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}
