import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { EnquiryRepository, EnquiryListFilter, EnquirySummaryResult } from '@domain/enquiry/ports/enquiry.repository';
import { Enquiry } from '@domain/enquiry/entities/enquiry.entity';
import type { EnquirySource, ClosureReason, FollowUp } from '@domain/enquiry/entities/enquiry.entity';
import { EnquiryModel } from '../database/schemas/enquiry.schema';
import type { EnquiryDocument } from '../database/schemas/enquiry.schema';
import { getTransactionSession } from '../database/transaction-context';

@Injectable()
export class MongoEnquiryRepository implements EnquiryRepository {
  constructor(@InjectModel(EnquiryModel.name) private readonly model: Model<EnquiryDocument>) {}

  async save(enquiry: Enquiry): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: enquiry.id.toString() },
      {
        _id: enquiry.id.toString(),
        academyId: enquiry.academyId,
        prospectName: enquiry.prospectName,
        guardianName: enquiry.guardianName,
        mobileNumber: enquiry.mobileNumber,
        whatsappNumber: enquiry.whatsappNumber,
        email: enquiry.email,
        address: enquiry.address,
        interestedIn: enquiry.interestedIn,
        source: enquiry.source,
        notes: enquiry.notes,
        status: enquiry.status,
        closureReason: enquiry.closureReason,
        convertedStudentId: enquiry.convertedStudentId,
        nextFollowUpDate: enquiry.nextFollowUpDate,
        followUps: enquiry.followUps.map((f) => ({
          _id: f.id,
          date: f.date,
          notes: f.notes,
          nextFollowUpDate: f.nextFollowUpDate,
          createdBy: f.createdBy,
          createdAt: f.createdAt,
        })),
        createdBy: enquiry.createdBy,
        version: enquiry.audit.version,
      },
      { upsert: true, session: getTransactionSession() },
    );
  }

  async findById(id: string): Promise<Enquiry | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findActiveByMobileAndAcademy(academyId: string, mobileNumber: string): Promise<Enquiry | null> {
    const doc = await this.model.findOne({ academyId, mobileNumber, status: 'ACTIVE' }).lean().exec();
    return doc ? this.toDomain(doc) : null;
  }

  async list(
    filter: EnquiryListFilter,
    page: number,
    pageSize: number,
  ): Promise<{ enquiries: Enquiry[]; total: number }> {
    const query: Record<string, unknown> = { academyId: filter.academyId };

    if (filter.status) {
      query['status'] = filter.status;
    }

    if (filter.search) {
      const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query['$or'] = [
        { prospectName: { $regex: escaped, $options: 'i' } },
        { mobileNumber: { $regex: escaped } },
      ];
    }

    if (filter.followUpToday) {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      query['nextFollowUpDate'] = { $gte: startOfDay, $lt: endOfDay };
    }

    const [docs, total] = await Promise.all([
      this.model
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);

    return {
      enquiries: docs.map((d) => this.toDomain(d)),
      total,
    };
  }

  async summary(academyId: string): Promise<EnquirySummaryResult> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const result = await this.model.aggregate([
      { $match: { academyId } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          active: [{ $match: { status: 'ACTIVE' } }, { $count: 'count' }],
          closed: [{ $match: { status: 'CLOSED' } }, { $count: 'count' }],
          todayFollowUp: [
            {
              $match: {
                status: 'ACTIVE',
                nextFollowUpDate: { $gte: startOfDay, $lt: endOfDay },
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ]).exec();

    const facet = result[0] ?? {};
    return {
      total: facet.total?.[0]?.count ?? 0,
      active: facet.active?.[0]?.count ?? 0,
      closed: facet.closed?.[0]?.count ?? 0,
      todayFollowUp: facet.todayFollowUp?.[0]?.count ?? 0,
    };
  }

  private toDomain(doc: Record<string, unknown>): Enquiry {
    const d = doc as {
      _id: string;
      academyId: string;
      prospectName: string;
      guardianName: string | null;
      mobileNumber: string;
      whatsappNumber: string | null;
      email: string | null;
      address: string | null;
      interestedIn: string | null;
      source: string | null;
      notes: string | null;
      status: string;
      closureReason: string | null;
      convertedStudentId: string | null;
      nextFollowUpDate: Date | null;
      followUps: {
        _id: string;
        date: Date;
        notes: string;
        nextFollowUpDate: Date | null;
        createdBy: string;
        createdAt: Date;
      }[];
      createdBy: string;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    };

    const followUps: FollowUp[] = (d.followUps ?? []).map((f) => ({
      id: String(f._id),
      date: new Date(f.date),
      notes: f.notes,
      nextFollowUpDate: f.nextFollowUpDate ? new Date(f.nextFollowUpDate) : null,
      createdBy: f.createdBy,
      createdAt: new Date(f.createdAt),
    }));

    return Enquiry.reconstitute(String(d._id), {
      academyId: d.academyId,
      prospectName: d.prospectName,
      guardianName: d.guardianName ?? null,
      mobileNumber: d.mobileNumber,
      whatsappNumber: d.whatsappNumber ?? null,
      email: d.email ?? null,
      address: d.address ?? null,
      interestedIn: d.interestedIn ?? null,
      source: (d.source as EnquirySource) ?? null,
      notes: d.notes ?? null,
      status: d.status as 'ACTIVE' | 'CLOSED',
      closureReason: (d.closureReason as ClosureReason) ?? null,
      convertedStudentId: d.convertedStudentId ?? null,
      nextFollowUpDate: d.nextFollowUpDate ? new Date(d.nextFollowUpDate) : null,
      followUps,
      createdBy: d.createdBy,
      audit: {
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        version: d.version ?? 1,
      },
    });
  }
}
