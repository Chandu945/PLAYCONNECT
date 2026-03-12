import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionPaymentsController } from './subscription-payments.controller';
import { SubscriptionPaymentsTestController } from './subscription-payments-test.controller';
import {
  SubscriptionPaymentModel,
  SubscriptionPaymentSchema,
} from '@infrastructure/database/schemas/subscription-payment.schema';
import {
  SubscriptionModel,
  SubscriptionSchema,
} from '@infrastructure/database/schemas/subscription.schema';
import { StudentModel, StudentSchema } from '@infrastructure/database/schemas/student.schema';
import { MongoSubscriptionPaymentRepository } from '@infrastructure/repositories/mongo-subscription-payment.repository';
import { MongoSubscriptionRepository } from '@infrastructure/repositories/mongo-subscription.repository';
import { MongoActiveStudentCounter } from '@infrastructure/subscription/mongo-active-student-counter';
import { SUBSCRIPTION_PAYMENT_REPOSITORY } from '@domain/subscription-payments/ports/subscription-payment.repository';
import { SUBSCRIPTION_REPOSITORY } from '@domain/subscription/ports/subscription.repository';
import { CASHFREE_GATEWAY } from '@domain/subscription-payments/ports/cashfree-gateway.port';
import {
  ACTIVE_STUDENT_COUNTER,
  type ActiveStudentCounterPort,
} from '@application/subscription/ports/active-student-counter.port';
import type { ClockPort } from '@application/common/clock.port';
import { CLOCK_PORT } from '@application/common/clock.port';
import { SystemClock } from '@application/common/system-clock';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { SubscriptionRepository } from '@domain/subscription/ports/subscription.repository';
import type { SubscriptionPaymentRepository } from '@domain/subscription-payments/ports/subscription-payment.repository';
import type { CashfreeGatewayPort } from '@domain/subscription-payments/ports/cashfree-gateway.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { ACADEMY_REPOSITORY } from '@domain/academy/ports/academy.repository';
import { LOGGER_PORT } from '@shared/logging/logger.port';
import { AuthModule } from '../auth/auth.module';
import { AcademyOnboardingModule } from '../academy-onboarding/academy-onboarding.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { InitiateSubscriptionPaymentUseCase } from '@application/subscription-payments/use-cases/initiate-subscription-payment.usecase';
import { HandleCashfreeWebhookUseCase } from '@application/subscription-payments/use-cases/handle-cashfree-webhook.usecase';
import type { WebhookSignatureVerifier } from '@application/subscription-payments/use-cases/handle-cashfree-webhook.usecase';
import { GetSubscriptionPaymentStatusUseCase } from '@application/subscription-payments/use-cases/get-subscription-payment-status.usecase';
import { CashfreeAdapter } from '@infrastructure/payments/cashfree/cashfree.adapter';
import { CashfreeHttpClient } from '@infrastructure/payments/cashfree/cashfree-http.client';
import { CashfreeSignatureVerifier } from '@infrastructure/payments/cashfree/cashfree.signature';
import type { ExternalCallPolicyPort } from '@application/common/ports/external-call-policy.port';
import { EXTERNAL_CALL_POLICY } from '@application/common/ports/external-call-policy.port';
import { AUDIT_RECORDER_PORT } from '@application/audit/ports/audit-recorder.port';
import type { AuditRecorderPort } from '@application/audit/ports/audit-recorder.port';
import { TRANSACTION_PORT } from '@application/common/transaction.port';
import type { TransactionPort } from '@application/common/transaction.port';
import { MongoTransactionService } from '@infrastructure/database/mongo-transaction.service';
import { AppConfigService } from '@shared/config/config.service';

const WEBHOOK_SIGNATURE_VERIFIER = Symbol('WEBHOOK_SIGNATURE_VERIFIER');

@Module({
  imports: [
    AuthModule,
    AcademyOnboardingModule,
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: SubscriptionPaymentModel.name, schema: SubscriptionPaymentSchema },
      { name: SubscriptionModel.name, schema: SubscriptionSchema },
      { name: StudentModel.name, schema: StudentSchema },
    ]),
  ],
  controllers: [
    SubscriptionPaymentsController,
    ...(process.env['APP_ENV'] === 'development' ? [SubscriptionPaymentsTestController] : []),
  ],
  providers: [
    { provide: SUBSCRIPTION_PAYMENT_REPOSITORY, useClass: MongoSubscriptionPaymentRepository },
    { provide: SUBSCRIPTION_REPOSITORY, useClass: MongoSubscriptionRepository },
    { provide: ACTIVE_STUDENT_COUNTER, useClass: MongoActiveStudentCounter },
    { provide: CLOCK_PORT, useClass: SystemClock },
    { provide: TRANSACTION_PORT, useClass: MongoTransactionService },

    // Cashfree HTTP client
    {
      provide: CashfreeHttpClient,
      useFactory: (config: AppConfigService, logger: LoggerPort, callPolicy: ExternalCallPolicyPort) =>
        new CashfreeHttpClient(
          {
            clientId: config.cashfreeClientId,
            clientSecret: config.cashfreeClientSecret,
            apiVersion: config.cashfreeApiVersion,
            baseUrl: config.cashfreeBaseUrl,
          },
          logger,
          callPolicy,
        ),
      inject: [AppConfigService, LOGGER_PORT, EXTERNAL_CALL_POLICY],
    },

    // Cashfree gateway adapter
    {
      provide: CASHFREE_GATEWAY,
      useFactory: (httpClient: CashfreeHttpClient, logger: LoggerPort) =>
        new CashfreeAdapter(httpClient, logger),
      inject: [CashfreeHttpClient, LOGGER_PORT],
    },

    // Webhook signature verifier
    {
      provide: WEBHOOK_SIGNATURE_VERIFIER,
      useFactory: (config: AppConfigService) =>
        new CashfreeSignatureVerifier(config.cashfreeWebhookSecret),
      inject: [AppConfigService],
    },

    // Use cases
    {
      provide: 'INITIATE_SUBSCRIPTION_PAYMENT_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        academyRepo: AcademyRepository,
        subscriptionRepo: SubscriptionRepository,
        paymentRepo: SubscriptionPaymentRepository,
        gateway: CashfreeGatewayPort,
        studentCounter: ActiveStudentCounterPort,
        clock: ClockPort,
        logger: LoggerPort,
        auditRecorder: AuditRecorderPort,
      ) =>
        new InitiateSubscriptionPaymentUseCase(
          userRepo,
          academyRepo,
          subscriptionRepo,
          paymentRepo,
          gateway,
          studentCounter,
          clock,
          logger,
          auditRecorder,
        ),
      inject: [
        USER_REPOSITORY,
        ACADEMY_REPOSITORY,
        SUBSCRIPTION_REPOSITORY,
        SUBSCRIPTION_PAYMENT_REPOSITORY,
        CASHFREE_GATEWAY,
        ACTIVE_STUDENT_COUNTER,
        CLOCK_PORT,
        LOGGER_PORT,
        AUDIT_RECORDER_PORT,
      ],
    },
    {
      provide: 'HANDLE_CASHFREE_WEBHOOK_USE_CASE',
      useFactory: (
        paymentRepo: SubscriptionPaymentRepository,
        subscriptionRepo: SubscriptionRepository,
        verifier: WebhookSignatureVerifier,
        clock: ClockPort,
        logger: LoggerPort,
        auditRecorder: AuditRecorderPort,
        transaction: TransactionPort,
      ) =>
        new HandleCashfreeWebhookUseCase(
          paymentRepo,
          subscriptionRepo,
          verifier,
          clock,
          logger,
          auditRecorder,
          transaction,
        ),
      inject: [
        SUBSCRIPTION_PAYMENT_REPOSITORY,
        SUBSCRIPTION_REPOSITORY,
        WEBHOOK_SIGNATURE_VERIFIER,
        CLOCK_PORT,
        LOGGER_PORT,
        AUDIT_RECORDER_PORT,
        TRANSACTION_PORT,
      ],
    },
    {
      provide: 'GET_SUBSCRIPTION_PAYMENT_STATUS_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        academyRepo: AcademyRepository,
        subscriptionRepo: SubscriptionRepository,
        paymentRepo: SubscriptionPaymentRepository,
        clock: ClockPort,
      ) =>
        new GetSubscriptionPaymentStatusUseCase(
          userRepo,
          academyRepo,
          subscriptionRepo,
          paymentRepo,
          clock,
        ),
      inject: [
        USER_REPOSITORY,
        ACADEMY_REPOSITORY,
        SUBSCRIPTION_REPOSITORY,
        SUBSCRIPTION_PAYMENT_REPOSITORY,
        CLOCK_PORT,
      ],
    },
  ],
})
export class SubscriptionPaymentsModule {}
