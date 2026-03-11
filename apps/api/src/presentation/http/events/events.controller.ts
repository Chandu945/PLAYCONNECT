import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import type { CreateEventUseCase } from '@application/event/use-cases/create-event.usecase';
import type { UpdateEventUseCase } from '@application/event/use-cases/update-event.usecase';
import type { DeleteEventUseCase } from '@application/event/use-cases/delete-event.usecase';
import type { GetEventsUseCase } from '@application/event/use-cases/get-events.usecase';
import type { GetEventDetailUseCase } from '@application/event/use-cases/get-event-detail.usecase';
import type { GetEventSummaryUseCase } from '@application/event/use-cases/get-event-summary.usecase';
import type { ChangeEventStatusUseCase } from '@application/event/use-cases/change-event-status.usecase';
import type { EventType, EventStatus, TargetAudience } from '@domain/event/entities/event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ChangeEventStatusDto } from './dto/change-event-status.dto';
import { ListEventsQuery } from './dto/list-events.query';
import { mapResultToResponse } from '../common/result-mapper';
import type { Request } from 'express';

@ApiTags('Events')
@ApiBearerAuth()
@Controller('events')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('OWNER', 'STAFF')
export class EventsController {
  constructor(
    @Inject('CREATE_EVENT_USE_CASE')
    private readonly createEvent: CreateEventUseCase,
    @Inject('UPDATE_EVENT_USE_CASE')
    private readonly updateEvent: UpdateEventUseCase,
    @Inject('DELETE_EVENT_USE_CASE')
    private readonly deleteEvent: DeleteEventUseCase,
    @Inject('GET_EVENTS_USE_CASE')
    private readonly getEvents: GetEventsUseCase,
    @Inject('GET_EVENT_DETAIL_USE_CASE')
    private readonly getEventDetail: GetEventDetailUseCase,
    @Inject('GET_EVENT_SUMMARY_USE_CASE')
    private readonly getEventSummary: GetEventSummaryUseCase,
    @Inject('CHANGE_EVENT_STATUS_USE_CASE')
    private readonly changeEventStatus: ChangeEventStatusUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new event' })
  async create(
    @Body() dto: CreateEventDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.createEvent.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      title: dto.title,
      description: dto.description,
      eventType: dto.eventType as EventType | undefined,
      startDate: dto.startDate,
      endDate: dto.endDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      isAllDay: dto.isAllDay,
      location: dto.location,
      targetAudience: dto.targetAudience as TargetAudience | undefined,
      batchIds: dto.batchIds,
    });
    return mapResultToResponse(result, req, HttpStatus.CREATED);
  }

  @Get()
  @ApiOperation({ summary: 'List events with filters' })
  async list(
    @Query() query: ListEventsQuery,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getEvents.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      month: query.month,
      status: query.status as EventStatus | undefined,
      eventType: query.eventType as EventType | undefined,
      fromDate: query.fromDate,
      toDate: query.toDate,
      page: query.page ?? 1,
      pageSize: query.limit ?? 20,
    });
    return mapResultToResponse(result, req);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get event summary for dashboard' })
  async summary(@CurrentUser() user: CurrentUserType, @Req() req: Request) {
    const result = await this.getEventSummary.execute({
      actorUserId: user.userId,
      actorRole: user.role,
    });
    return mapResultToResponse(result, req);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event detail' })
  async detail(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getEventDetail.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      eventId: id,
    });
    return mapResultToResponse(result, req);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an event' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.updateEvent.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      eventId: id,
      title: dto.title,
      description: dto.description,
      eventType: dto.eventType as EventType | undefined | null,
      startDate: dto.startDate,
      endDate: dto.endDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      isAllDay: dto.isAllDay,
      location: dto.location,
      targetAudience: dto.targetAudience as TargetAudience | undefined | null,
      batchIds: dto.batchIds,
    });
    return mapResultToResponse(result, req);
  }

  @Delete(':id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Delete an event (owner only)' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.deleteEvent.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      eventId: id,
    });
    return mapResultToResponse(result, req);
  }

  @Put(':id/status')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Change event status (owner only)' })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeEventStatusDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.changeEventStatus.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      eventId: id,
      status: dto.status as EventStatus,
    });
    return mapResultToResponse(result, req);
  }
}
