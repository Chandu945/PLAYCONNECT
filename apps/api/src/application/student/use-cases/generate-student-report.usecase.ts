import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { AppError as AppErrorClass } from '@shared/kernel';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import { StudentErrors } from '../../common/errors';
import { PdfGeneratorService } from '@infrastructure/pdf/pdf-generator.service';
import type { UserRole } from '@academyflo/contracts';

export interface GenerateStudentReportInput {
  actorUserId: string;
  actorRole: UserRole;
  studentId: string;
  fromMonth?: string;
  toMonth?: string;
}

export class GenerateStudentReportUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly academyRepo: AcademyRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly attendanceRepo: StudentAttendanceRepository,
  ) {}

  async execute(input: GenerateStudentReportInput): Promise<Result<{ buffer: Buffer; filename: string }, AppError>> {
    if (input.actorRole !== 'OWNER') {
      return err(StudentErrors.manageNotAllowed());
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) return err(StudentErrors.academyRequired());

    const student = await this.studentRepo.findById(input.studentId);
    if (!student || student.isDeleted()) return err(StudentErrors.notFound(input.studentId));
    if (student.academyId !== actor.academyId) return err(StudentErrors.notInAcademy());

    const academy = await this.academyRepo.findById(actor.academyId);
    const academyName = academy?.academyName ?? 'Academy';

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const fromMonth = input.fromMonth ?? currentMonth;
    const toMonth = input.toMonth ?? currentMonth;

    // Fetch fee dues for range
    const feeDues = await this.feeDueRepo.listByStudentAndRange(
      actor.academyId, input.studentId, fromMonth, toMonth,
    );

    // Fetch attendance for each month in range. Records are PRESENT records
    // keyed by (student, batch, date) — count distinct dates so a two-batch
    // student isn't double-counted in the report.
    const months = this.getMonthRange(fromMonth, toMonth);
    const attendanceByMonth: { month: string; presentCount: number }[] = [];
    for (const month of months) {
      const records = await this.attendanceRepo.findPresentByAcademyStudentAndMonth(
        actor.academyId, input.studentId, month,
      );
      const distinctPresentDates = new Set(records.map((r) => r.date)).size;
      // This is the count of days the student was PRESENT (attendance is stored
      // as present-only records). It is reported under a "Present Days" column.
      attendanceByMonth.push({ month, presentCount: distinctPresentDates });
    }

    try {
      const pdf = new PdfGeneratorService();
      const doc = pdf.createDocument();

      // Header
      doc.fontSize(18).font('AppSans-Bold').text(academyName, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(14).font('AppSans').text('Student Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      // Student Info
      doc.fontSize(11).font('AppSans-Bold').text('Student Information');
      doc.moveDown(0.3);
      doc.font('AppSans').fontSize(10);
      const info = [
        ['Name', student.fullName],
        ['Guardian', student.guardian?.name ?? ''],
        ['Mobile', student.guardian?.mobile ?? ''],
        ['DOB', student.dateOfBirth.toISOString().slice(0, 10)],
        ['Joining Date', student.joiningDate.toISOString().slice(0, 10)],
        ['Monthly Fee', `₹${student.monthlyFee}`],
        ['Status', student.status],
      ];
      for (const [label, value] of info) {
        doc.text(`${label}: ${value}`);
      }
      doc.moveDown(0.5);

      // Attendance Summary
      doc.fontSize(11).font('AppSans-Bold').text('Attendance Summary');
      doc.moveDown(0.3);
      if (attendanceByMonth.length === 0) {
        doc.font('AppSans').fontSize(10).text('No attendance records found for this period.');
      } else {
        doc.font('AppSans').fontSize(10);
        // Table header
        const tableTop = doc.y;
        doc.text('Month', 50, tableTop, { width: 150 });
        doc.text('Present Days', 200, tableTop, { width: 100 });
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(350, doc.y).stroke();
        doc.moveDown(0.2);
        for (const row of attendanceByMonth) {
          const y = doc.y;
          doc.text(row.month, 50, y, { width: 150 });
          doc.text(String(row.presentCount), 200, y, { width: 100 });
          doc.moveDown(0.3);
        }
      }
      doc.moveDown(0.5);

      // Fee Summary
      doc.fontSize(11).font('AppSans-Bold').text('Fee Summary');
      doc.moveDown(0.3);
      if (feeDues.length === 0) {
        doc.font('AppSans').fontSize(10).text('No fee records found for this period.');
      } else {
        doc.font('AppSans').fontSize(10);
        const feeTop = doc.y;
        doc.text('Month', 50, feeTop, { width: 100 });
        doc.text('Amount', 150, feeTop, { width: 100 });
        doc.text('Status', 250, feeTop, { width: 100 });
        doc.text('Due Date', 350, feeTop, { width: 100 });
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(500, doc.y).stroke();
        doc.moveDown(0.2);
        for (const due of feeDues) {
          const y = doc.y;
          doc.text(due.monthKey, 50, y, { width: 100 });
          doc.text(`₹${due.amount}`, 150, y, { width: 100 });
          doc.text(due.status, 250, y, { width: 100 });
          doc.text(due.dueDate, 350, y, { width: 100 });
          doc.moveDown(0.3);
        }
      }

      // Footer with signature
      doc.moveDown(1);
      if (academy?.instituteInfo?.signatureStampUrl) {
        doc.fontSize(9).text('Authorized Signature / Stamp', { align: 'right' });
      }
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor('#888888')
        .text(`Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { align: 'center' });

      const buffer = await pdf.toBuffer(doc);
      const safeName = student.fullName.replace(/\s+/g, '_').toLowerCase();
      return ok({ buffer, filename: `report_${safeName}_${fromMonth}.pdf` });
    } catch {
      return err(AppErrorClass.validation('Failed to generate report. Please try again.'));
    }
  }

  private getMonthRange(from: string, to: string): string[] {
    const months: string[] = [];
    const parts = from.split('-').map(Number);
    const toParts = to.split('-').map(Number);
    let year = parts[0] ?? 2026;
    let month = parts[1] ?? 1;
    const toYear = toParts[0] ?? 2026;
    const toMonth = toParts[1] ?? 12;
    while (year < toYear || (year === toYear && month <= toMonth)) {
      months.push(`${year}-${String(month).padStart(2, '0')}`);
      month++;
      if (month > 12) { month = 1; year++; }
    }
    return months;
  }
}
