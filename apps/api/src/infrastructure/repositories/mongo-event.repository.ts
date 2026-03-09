import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { EventRepository, EventListFilter } from '@domain/event/ports/event.repository';
import { CalendarEvent } from '@domain/event/entities/event.entity';
import type { EventStatus, EventType, TargetAudience } from '@domain/event/entities/event.entity';
import { EventModel } from '../database/schemas/event.schema';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoEventRepository implements EventRepository {
  constructor(@InjectModel(EventModel.name) private readonly model: Model<EventModel>) {}

  async save(event: CalendarEvent): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: event.id.toString() },
      {
        _id: event.id.toString(),
        academyId: event.academyId,
        title: event.title,
        description: event.description,
        eventType: event.eventType,
        startDate: event.startDate,
        endDate: event.endDate,
        startTime: event.startTime,
        endTime: event.endTime,
        isAllDay: event.isAllDay,
        location: event.location,
        targetAudience: event.targetAudience,
        batchIds: event.batchIds,
        status: event.status,
        createdBy: event.createdBy,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async findById(id: string): Promise<CalendarEvent | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async list(
    filter: EventListFilter,
    page: number,
    pageSize: number,
  ): Promise<{ events: CalendarEvent[]; total: number }> {
    const query: Record<string, unknown> = { academyId: filter.academyId };

    if (filter.status) {
      query['status'] = filter.status;
    }

    if (filter.eventType) {
      query['eventType'] = filter.eventType;
    }

    // Date range filtering
    if (filter.month) {
      const [y, m] = filter.month.split('-').map(Number);
      const monthStart = new Date(Date.UTC(y!, m! - 1, 1));
      const monthEnd = new Date(Date.UTC(y!, m!, 0, 23, 59, 59, 999));
      // Events that overlap with this month
      query['startDate'] = { $lte: monthEnd };
      query['$or'] = [
        { endDate: { $gte: monthStart } },
        { endDate: null, startDate: { $gte: monthStart } },
      ];
    } else if (filter.fromDate || filter.toDate) {
      if (filter.fromDate) {
        const from = new Date(filter.fromDate);
        query['$or'] = [
          { endDate: { $gte: from } },
          { endDate: null, startDate: { $gte: from } },
        ];
      }
      if (filter.toDate) {
        const to = new Date(filter.toDate + 'T23:59:59.999Z');
        query['startDate'] = { ...(query['startDate'] as Record<string, unknown> || {}), $lte: to };
      }
    }

    const [docs, total] = await Promise.all([
      this.model
        .find(query)
        .sort({ startDate: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);

    return {
      events: docs.map((d) => this.toDomain(d)),
      total,
    };
  }

  async delete(id: string): Promise<void> {
    await this.model.deleteOne({ _id: id }, { session: getTransactionSession() }).exec();
  }

  async countByAcademyAndMonth(
    academyId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<{ total: number; upcoming: number }> {
    const baseQuery = {
      academyId,
      startDate: { $lte: monthEnd },
      $or: [
        { endDate: { $gte: monthStart } },
        { endDate: null, startDate: { $gte: monthStart } },
      ],
    };

    const [total, upcoming] = await Promise.all([
      this.model.countDocuments(baseQuery).exec(),
      this.model.countDocuments({
        ...baseQuery,
        status: { $in: ['UPCOMING', 'ONGOING'] },
      }).exec(),
    ]);

    return { total, upcoming };
  }

  private toDomain(doc: Record<string, unknown>): CalendarEvent {
    const d = doc as {
      _id: string;
      academyId: string;
      title: string;
      description: string | null;
      eventType: string | null;
      startDate: Date;
      endDate: Date | null;
      startTime: string | null;
      endTime: string | null;
      isAllDay: boolean;
      location: string | null;
      targetAudience: string | null;
      batchIds: string[];
      status: string;
      createdBy: string;
      createdAt: Date;
      updatedAt: Date;
    };

    return CalendarEvent.reconstitute(String(d._id), {
      academyId: String(d.academyId),
      title: d.title,
      description: d.description,
      eventType: d.eventType as EventType | null,
      startDate: new Date(d.startDate),
      endDate: d.endDate ? new Date(d.endDate) : null,
      startTime: d.startTime,
      endTime: d.endTime,
      isAllDay: d.isAllDay,
      location: d.location,
      targetAudience: d.targetAudience as TargetAudience | null,
      batchIds: (d.batchIds ?? []).map(String),
      status: d.status as EventStatus,
      createdBy: String(d.createdBy),
      audit: {
        createdAt: d.createdAt ?? new Date(),
        updatedAt: d.updatedAt ?? new Date(),
        version: 1,
      },
    });
  }
}
