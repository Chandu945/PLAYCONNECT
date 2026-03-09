import {
  Controller,
  Post,
  Get,
  Param,
  Inject,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Headers,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import { mapResultToResponse } from '../common/result-mapper';
import type { InitiateSubscriptionPaymentUseCase } from '@application/subscription-payments/use-cases/initiate-subscription-payment.usecase';
import type { HandleCashfreeWebhookUseCase } from '@application/subscription-payments/use-cases/handle-cashfree-webhook.usecase';
import type { GetSubscriptionPaymentStatusUseCase } from '@application/subscription-payments/use-cases/get-subscription-payment-status.usecase';
import type { Request } from 'express';

/**
 * Subscription payment endpoints.
 *
 * All routes under /api/v1/subscription-payments are already allowed by the
 * SubscriptionEnforcementGuard (prefix /api/v1/subscription).
 */
@ApiTags('Subscription Payments')
@Controller('subscription-payments')
export class SubscriptionPaymentsController {
  constructor(
    @Inject('INITIATE_SUBSCRIPTION_PAYMENT_USE_CASE')
    private readonly initiatePayment: InitiateSubscriptionPaymentUseCase,
    @Inject('HANDLE_CASHFREE_WEBHOOK_USE_CASE')
    private readonly handleWebhook: HandleCashfreeWebhookUseCase,
    @Inject('GET_SUBSCRIPTION_PAYMENT_STATUS_USE_CASE')
    private readonly getPaymentStatus: GetSubscriptionPaymentStatusUseCase,
  ) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles('OWNER')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate subscription payment (OWNER only)' })
  async initiate(@CurrentUser() user: CurrentUserType, @Req() req: Request) {
    const result = await this.initiatePayment.execute(user.userId);
    return mapResultToResponse(result, req, HttpStatus.CREATED);
  }

  @Get(':orderId/status')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles('OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment status (OWNER only)' })
  async status(
    @CurrentUser() user: CurrentUserType,
    @Param('orderId') orderId: string,
    @Req() req: Request,
  ) {
    const result = await this.getPaymentStatus.execute(user.userId, orderId);
    return mapResultToResponse(result, req);
  }

  @Post('cashfree/webhook')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cashfree payment webhook (public, signature-verified)' })
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
