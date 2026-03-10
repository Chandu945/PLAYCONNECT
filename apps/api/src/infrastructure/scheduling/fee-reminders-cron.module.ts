import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeeRemindersCronService } from './fee-reminders-cron.service';
import { AcademyModel, AcademySchema } from '@infrastructure/database/schemas/academy.schema';
import { FeeDueModel, FeeDueSchema } from '@infrastructure/database/schemas/fee-due.schema';
import { StudentModel, StudentSchema } from '@infrastructure/database/schemas/student.schema';
import {
  SubscriptionModel,
  SubscriptionSchema,
} from '@infrastructure/database/schemas/subscription.schema';
import {
  ParentStudentLinkModel,
  ParentStudentLinkSchema,
} from '@infrastructure/database/schemas/parent-student-link.schema';
import { MongoAcademyRepository } from '@infrastructure/repositories/mongo-academy.repository';
import { MongoFeeDueRepository } from '@infrastructure/repositories/mongo-fee-due.repository';
import { MongoStudentRepository } from '@infrastructure/repositories/mongo-student.repository';
import { MongoSubscriptionRepository } from '@infrastructure/repositories/mongo-subscription.repository';
import { MongoParentStudentLinkRepository } from '@infrastructure/repositories/mongo-parent-student-link.repository';
import { NodemailerEmailSender } from '@infrastructure/notifications/nodemailer-email-sender';
import { SystemClock } from '@application/common/system-clock';
import { ACADEMY_REPOSITORY } from '@domain/academy/ports/academy.repository';
import { FEE_DUE_REPOSITORY } from '@domain/fee/ports/fee-due.repository';
import { STUDENT_REPOSITORY } from '@domain/student/ports/student.repository';
import { SUBSCRIPTION_REPOSITORY } from '@domain/subscription/ports/subscription.repository';
import { PARENT_STUDENT_LINK_REPOSITORY } from '@domain/parent/ports/parent-student-link.repository';
import { EMAIL_SENDER_PORT } from '@application/notifications/ports/email-sender.port';
import { CLOCK_PORT } from '@application/common/clock.port';
import { SendFeeRemindersUseCase } from '@application/notifications/use-cases/send-fee-reminders.usecase';
import { SendOverduePushRemindersUseCase } from '@application/notifications/use-cases/send-overdue-push-reminders.usecase';
import { DeviceTokensModule } from '../../presentation/http/device-tokens/device-tokens.module';
import { PUSH_NOTIFICATION_SERVICE } from '../../presentation/http/device-tokens/device-tokens.module';
import type { PushNotificationService } from '@application/notifications/push-notification.service';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { SubscriptionRepository } from '@domain/subscription/ports/subscription.repository';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import type { EmailSenderPort } from '@application/notifications/ports/email-sender.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import { LOGGER_PORT } from '@shared/logging/logger.port';
import type { ClockPort } from '@application/common/clock.port';

@Module({
  imports: [
    DeviceTokensModule,
    MongooseModule.forFeature([
      { name: AcademyModel.name, schema: AcademySchema },
      { name: FeeDueModel.name, schema: FeeDueSchema },
      { name: StudentModel.name, schema: StudentSchema },
      { name: SubscriptionModel.name, schema: SubscriptionSchema },
      { name: ParentStudentLinkModel.name, schema: ParentStudentLinkSchema },
    ]),
  ],
  providers: [
    { provide: ACADEMY_REPOSITORY, useClass: MongoAcademyRepository },
    { provide: FEE_DUE_REPOSITORY, useClass: MongoFeeDueRepository },
    { provide: STUDENT_REPOSITORY, useClass: MongoStudentRepository },
    { provide: SUBSCRIPTION_REPOSITORY, useClass: MongoSubscriptionRepository },
    { provide: PARENT_STUDENT_LINK_REPOSITORY, useClass: MongoParentStudentLinkRepository },
    { provide: EMAIL_SENDER_PORT, useClass: NodemailerEmailSender },
    { provide: CLOCK_PORT, useClass: SystemClock },
    {
      provide: 'SEND_FEE_REMINDERS_USE_CASE',
      useFactory: (
        feeDueRepo: FeeDueRepository,
        studentRepo: StudentRepository,
        academyRepo: AcademyRepository,
        subscriptionRepo: SubscriptionRepository,
        emailSender: EmailSenderPort,
        logger: LoggerPort,
        clock: ClockPort,
        pushService: PushNotificationService,
      ) =>
        new SendFeeRemindersUseCase(
          feeDueRepo,
          studentRepo,
          academyRepo,
          subscriptionRepo,
          emailSender,
          logger,
          clock,
          pushService,
        ),
      inject: [
        FEE_DUE_REPOSITORY,
        STUDENT_REPOSITORY,
        ACADEMY_REPOSITORY,
        SUBSCRIPTION_REPOSITORY,
        EMAIL_SENDER_PORT,
        LOGGER_PORT,
        CLOCK_PORT,
        PUSH_NOTIFICATION_SERVICE,
      ],
    },
    {
      provide: 'SEND_OVERDUE_PUSH_REMINDERS_USE_CASE',
      useFactory: (
        feeDueRepo: FeeDueRepository,
        studentRepo: StudentRepository,
        parentLinkRepo: ParentStudentLinkRepository,
        pushService: PushNotificationService,
        logger: LoggerPort,
        clock: ClockPort,
      ) =>
        new SendOverduePushRemindersUseCase(
          feeDueRepo,
          studentRepo,
          parentLinkRepo,
          pushService,
          logger,
          clock,
        ),
      inject: [
        FEE_DUE_REPOSITORY,
        STUDENT_REPOSITORY,
        PARENT_STUDENT_LINK_REPOSITORY,
        PUSH_NOTIFICATION_SERVICE,
        LOGGER_PORT,
        CLOCK_PORT,
      ],
    },
    FeeRemindersCronService,
  ],
})
export class FeeRemindersCronModule {}
