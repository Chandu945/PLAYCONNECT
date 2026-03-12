import type { FeeDue } from '../entities/fee-due.entity';
import type { FeeDueStatus } from '@playconnect/contracts';

export const FEE_DUE_REPOSITORY = Symbol('FEE_DUE_REPOSITORY');

export interface FeeDueRepository {
  save(feeDue: FeeDue): Promise<void>;
  bulkSave(feeDues: FeeDue[]): Promise<void>;
  findById(id: string): Promise<FeeDue | null>;
  bulkUpdateStatus(ids: string[], status: FeeDueStatus): Promise<void>;
  findByAcademyStudentMonth(
    academyId: string,
    studentId: string,
    monthKey: string,
  ): Promise<FeeDue | null>;
  listByAcademyMonthAndStatuses(
    academyId: string,
    monthKey: string,
    statuses: FeeDueStatus[],
  ): Promise<FeeDue[]>;
  listByAcademyMonthPaid(academyId: string, monthKey: string): Promise<FeeDue[]>;
  listByStudentAndRange(
    academyId: string,
    studentId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<FeeDue[]>;
  listUpcomingByAcademyAndMonth(academyId: string, monthKey: string): Promise<FeeDue[]>;
  listByAcademyAndMonth(academyId: string, monthKey: string): Promise<FeeDue[]>;
  listUnpaidByAcademy(academyId: string): Promise<FeeDue[]>;
  findUnpaidByDueDate(dueDate: string): Promise<FeeDue[]>;
  findOverdueDues(upToDate: string): Promise<FeeDue[]>;
  findDueWithoutSnapshot(academyId: string): Promise<FeeDue[]>;
  deleteUpcomingByStudent(academyId: string, studentId: string): Promise<number>;
}
