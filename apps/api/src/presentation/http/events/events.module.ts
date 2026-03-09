import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsController } from './events.controller';
import { AuthModule } from '../auth/auth.module';
import { EventModel, EventSchema } from '@infrastructure/database/schemas/event.schema';
import { MongoEventRepository } from '@infrastructure/repositories/mongo-event.repository';
import { EVENT_REPOSITORY } from '@domain/event/ports/event.repository';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { CreateEventUseCase } from '@application/event/use-cases/create-event.usecase';
import { UpdateEventUseCase } from '@application/event/use-cases/update-event.usecase';
import { DeleteEventUseCase } from '@application/event/use-cases/delete-event.usecase';
import { GetEventsUseCase } from '@application/event/use-cases/get-events.usecase';
import { GetEventDetailUseCase } from '@application/event/use-cases/get-event-detail.usecase';
import { GetEventSummaryUseCase } from '@application/event/use-cases/get-event-summary.usecase';
import { ChangeEventStatusUseCase } from '@application/event/use-cases/change-event-status.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { EventRepository } from '@domain/event/ports/event.repository';
import type { AuditRecorderPort } from '@application/audit/ports/audit-recorder.port';
import { AUDIT_RECORDER_PORT } from '@application/audit/ports/audit-recorder.port';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    AuthModule,
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: EventModel.name, schema: EventSchema },
    ]),
  ],
  controllers: [EventsController],
  providers: [
    { provide: EVENT_REPOSITORY, useClass: MongoEventRepository },
    {
      provide: 'CREATE_EVENT_USE_CASE',
      useFactory: (userRepo: UserRepository, eventRepo: EventRepository, auditRecorder: AuditRecorderPort) =>
        new CreateEventUseCase(userRepo, eventRepo, auditRecorder),
      inject: [USER_REPOSITORY, EVENT_REPOSITORY, AUDIT_RECORDER_PORT],
    },
    {
      provide: 'UPDATE_EVENT_USE_CASE',
      useFactory: (userRepo: UserRepository, eventRepo: EventRepository, auditRecorder: AuditRecorderPort) =>
        new UpdateEventUseCase(userRepo, eventRepo, auditRecorder),
      inject: [USER_REPOSITORY, EVENT_REPOSITORY, AUDIT_RECORDER_PORT],
    },
    {
      provide: 'DELETE_EVENT_USE_CASE',
      useFactory: (userRepo: UserRepository, eventRepo: EventRepository, auditRecorder: AuditRecorderPort) =>
        new DeleteEventUseCase(userRepo, eventRepo, auditRecorder),
      inject: [USER_REPOSITORY, EVENT_REPOSITORY, AUDIT_RECORDER_PORT],
    },
    {
      provide: 'GET_EVENTS_USE_CASE',
      useFactory: (userRepo: UserRepository, eventRepo: EventRepository) =>
        new GetEventsUseCase(userRepo, eventRepo),
      inject: [USER_REPOSITORY, EVENT_REPOSITORY],
    },
    {
      provide: 'GET_EVENT_DETAIL_USE_CASE',
      useFactory: (userRepo: UserRepository, eventRepo: EventRepository) =>
        new GetEventDetailUseCase(userRepo, eventRepo),
      inject: [USER_REPOSITORY, EVENT_REPOSITORY],
    },
    {
      provide: 'GET_EVENT_SUMMARY_USE_CASE',
      useFactory: (userRepo: UserRepository, eventRepo: EventRepository) =>
        new GetEventSummaryUseCase(userRepo, eventRepo),
      inject: [USER_REPOSITORY, EVENT_REPOSITORY],
    },
    {
      provide: 'CHANGE_EVENT_STATUS_USE_CASE',
      useFactory: (userRepo: UserRepository, eventRepo: EventRepository) =>
        new ChangeEventStatusUseCase(userRepo, eventRepo),
      inject: [USER_REPOSITORY, EVENT_REPOSITORY],
    },
  ],
})
export class EventsModule {}
