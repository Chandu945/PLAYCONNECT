import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type {
  PdfRenderer,
  StudentMonthlyAttendancePdfInput,
  MonthlyAttendanceSummaryPdfInput,
} from '@application/reports/ports/pdf-renderer.port';
import type { MonthlyRevenueSummaryDto } from '@application/reports/dtos/monthly-revenue.dto';
import type { StudentWiseDueItemDto } from '@application/reports/dtos/student-wise-dues.dto';
import { registerFonts, FONT_NAME, FONT_NAME_BOLD } from '../pdf/pdf-fonts';

function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

function formatLocalDate(d: string): string {
  // Input "YYYY-MM-DD" → "5 May 2026"
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

@Injectable()
export class PdfkitRenderer implements PdfRenderer {
  async renderMonthlyRevenue(month: string, data: MonthlyRevenueSummaryDto): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    registerFonts(doc);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    // Title
    doc.fontSize(18).text(`Monthly Revenue Report — ${month}`, { align: 'center' });
    doc.moveDown();

    // Summary
    doc.fontSize(12).text(`Total Revenue: ₹${data.totalAmount.toLocaleString('en-IN')}`);
    doc.text(`Transactions: ${data.transactionCount}`);
    doc.moveDown();

    // Table header
    const startX = 40;
    let y = doc.y;
    doc
      .fontSize(9)
      .font(FONT_NAME_BOLD)
      .text('Receipt #', startX, y, { width: 90 })
      .text('Student ID', startX + 90, y, { width: 100 })
      .text('Month', startX + 190, y, { width: 70 })
      .text('Amount', startX + 260, y, { width: 70, align: 'right' })
      .text('Source', startX + 340, y, { width: 90 })
      .text('Date', startX + 430, y, { width: 90 });
    y += 16;
    doc
      .moveTo(startX, y)
      .lineTo(startX + 520, y)
      .stroke();
    y += 6;

    // Rows
    doc.font(FONT_NAME).fontSize(8);
    for (const tx of data.transactions) {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
      doc
        .text(tx.receiptNumber, startX, y, { width: 90 })
        .text(tx.studentId.slice(0, 12), startX + 90, y, { width: 100 })
        .text(tx.monthKey, startX + 190, y, { width: 70 })
        .text(`₹${tx.amount}`, startX + 260, y, { width: 70, align: 'right' })
        .text(tx.source, startX + 340, y, { width: 90 })
        .text(tx.createdAt.slice(0, 10), startX + 430, y, { width: 90 });
      y += 14;
    }

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async renderPendingDues(month: string, items: StudentWiseDueItemDto[]): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    registerFonts(doc);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    // Title
    doc.fontSize(18).text(`Pending Dues Report — ${month}`, { align: 'center' });
    doc.moveDown();

    // Summary — total owed for the month includes late fees (base + late),
    // matching the dashboard Pending tile and the month-wise report.
    const totalPending = items.reduce((s, i) => s + i.totalPayable, 0);
    doc.fontSize(12).text(`Students with Dues: ${items.length}`);
    doc.text(`Total Pending: ₹${totalPending.toLocaleString('en-IN')}`);
    doc.moveDown();

    // Table header
    const startX = 40;
    let y = doc.y;
    doc
      .fontSize(9)
      .font(FONT_NAME_BOLD)
      .text('Student Name', startX, y, { width: 150 })
      .text('Month', startX + 150, y, { width: 70 })
      .text('Amount', startX + 220, y, { width: 80, align: 'right' })
      .text('Late Fee', startX + 310, y, { width: 70, align: 'right' })
      .text('Pending Months', startX + 380, y, { width: 70, align: 'right' })
      .text('Total Pending', startX + 450, y, { width: 70, align: 'right' });
    y += 16;
    doc
      .moveTo(startX, y)
      .lineTo(startX + 520, y)
      .stroke();
    y += 6;

    // Rows
    doc.font(FONT_NAME).fontSize(8);
    for (const item of items) {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
      doc
        .text(item.studentName, startX, y, { width: 150 })
        .text(item.monthKey, startX + 150, y, { width: 70 })
        .text(`₹${item.amount}`, startX + 220, y, { width: 80, align: 'right' })
        .text(`₹${item.lateFee}`, startX + 310, y, { width: 70, align: 'right' })
        .text(String(item.pendingMonthsCount), startX + 380, y, { width: 70, align: 'right' })
        .text(`₹${item.totalPendingAmount}`, startX + 450, y, { width: 70, align: 'right' });
      y += 14;
    }

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async renderStudentMonthlyAttendance(
    input: StudentMonthlyAttendancePdfInput,
  ): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    registerFonts(doc);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const pct =
      input.expectedDays > 0
        ? Math.round((input.presentDays / input.expectedDays) * 100)
        : null;

    // Header
    doc.fontSize(20).font(FONT_NAME_BOLD).text('Attendance Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).font(FONT_NAME).text(input.studentName, { align: 'center' });
    doc.fontSize(11).fillColor('#666').text(formatMonth(input.month), { align: 'center' });
    doc.fillColor('black');
    doc.moveDown(1);

    // Headline summary box
    const startX = 40;
    const boxY = doc.y;
    doc
      .roundedRect(startX, boxY, 515, 70, 8)
      .fillColor('#F4F5F7')
      .fill();
    doc.fillColor('black');

    doc
      .fontSize(28)
      .font(FONT_NAME_BOLD)
      .text(pct == null ? '—' : `${pct}%`, startX + 20, boxY + 15, { width: 100 });
    doc
      .fontSize(10)
      .font(FONT_NAME)
      .fillColor('#666')
      .text('Attendance', startX + 20, boxY + 50);
    doc.fillColor('black');

    // Stat columns inside the headline box
    const statY = boxY + 18;
    const statCols = [
      { label: 'Expected', value: input.expectedDays, x: startX + 150 },
      { label: 'Present', value: input.presentDays, x: startX + 230 },
      { label: 'Partial', value: input.partialDays, x: startX + 310 },
      { label: 'Absent', value: input.absentDays, x: startX + 380 },
      { label: 'Holidays', value: input.holidayCount, x: startX + 450 },
    ];
    for (const stat of statCols) {
      doc
        .fontSize(18)
        .font(FONT_NAME_BOLD)
        .text(String(stat.value), stat.x, statY, { width: 60, align: 'center' });
      doc
        .fontSize(8)
        .font(FONT_NAME)
        .fillColor('#666')
        .text(stat.label.toUpperCase(), stat.x, statY + 28, { width: 60, align: 'center' });
      doc.fillColor('black');
    }

    doc.y = boxY + 90;

    // Per-batch breakdown
    if (input.perBatch.length > 0) {
      doc.fontSize(13).font(FONT_NAME_BOLD).text('By Batch', startX);
      doc.moveDown(0.5);
      let by = doc.y;
      doc
        .fontSize(9)
        .font(FONT_NAME_BOLD)
        .text('Batch', startX, by, { width: 220 })
        .text('Sessions', startX + 220, by, { width: 90, align: 'right' })
        .text('Attended', startX + 310, by, { width: 90, align: 'right' })
        .text('%', startX + 400, by, { width: 60, align: 'right' });
      by += 14;
      doc.moveTo(startX, by).lineTo(startX + 515, by).strokeColor('#DDD').stroke();
      doc.strokeColor('black');
      by += 6;

      doc.font(FONT_NAME).fontSize(9);
      for (const b of input.perBatch) {
        if (by > 760) {
          doc.addPage();
          by = 40;
        }
        const bp =
          b.expectedCount > 0 ? Math.round((b.presentCount / b.expectedCount) * 100) : null;
        doc
          .text(b.batchName, startX, by, { width: 220 })
          .text(String(b.expectedCount), startX + 220, by, { width: 90, align: 'right' })
          .text(String(b.presentCount), startX + 310, by, { width: 90, align: 'right' })
          .text(bp == null ? '—' : `${bp}%`, startX + 400, by, { width: 60, align: 'right' });
        by += 14;
      }
      doc.y = by + 10;
    }

    // Absent dates
    if (input.absentDates.length > 0) {
      if (doc.y > 700) doc.addPage();
      doc.fontSize(13).font(FONT_NAME_BOLD).text('Absent Days', startX);
      doc.moveDown(0.4);
      doc.fontSize(9).font(FONT_NAME);
      for (const d of input.absentDates) {
        if (doc.y > 760) doc.addPage();
        doc.text(`• ${formatLocalDate(d)}`, startX + 8);
      }
      doc.moveDown(0.5);
    }

    // Holiday dates
    if (input.holidayDates.length > 0) {
      if (doc.y > 700) doc.addPage();
      doc.fontSize(13).font(FONT_NAME_BOLD).text('Holidays', startX);
      doc.moveDown(0.4);
      doc.fontSize(9).font(FONT_NAME);
      for (const d of input.holidayDates) {
        if (doc.y > 760) doc.addPage();
        doc.text(`• ${formatLocalDate(d)}`, startX + 8);
      }
    }

    doc.end();
    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async renderMonthlyAttendanceSummary(
    input: MonthlyAttendanceSummaryPdfInput,
  ): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    registerFonts(doc);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    // Header
    doc.fontSize(20).font(FONT_NAME_BOLD).text('Monthly Attendance Summary', {
      align: 'center',
    });
    doc.moveDown(0.3);
    doc.fontSize(13).font(FONT_NAME).text(input.academyName, { align: 'center' });
    doc.fontSize(11).fillColor('#666').text(formatMonth(input.month), { align: 'center' });
    doc.fillColor('black');
    doc.moveDown(1);

    // Sort: worst attendance first (most actionable for owners).
    const sorted = [...input.rows].sort((a, b) => {
      const ap = a.percentage ?? 101;
      const bp = b.percentage ?? 101;
      return ap - bp;
    });

    // Aggregate stats
    const withData = sorted.filter((r) => r.expectedDays > 0);
    const avgPct =
      withData.length > 0
        ? Math.round(
            withData.reduce((s, r) => s + (r.percentage ?? 0), 0) / withData.length,
          )
        : null;
    const below75 = withData.filter((r) => (r.percentage ?? 100) < 75).length;

    doc.fontSize(11).font(FONT_NAME);
    doc.text(`Total students: ${sorted.length}`);
    doc.text(`Average attendance: ${avgPct == null ? '—' : `${avgPct}%`}`);
    doc.text(`Below 75%: ${below75}`);
    doc.moveDown(0.5);

    // Table header
    const startX = 40;
    let y = doc.y;
    doc
      .fontSize(10)
      .font(FONT_NAME_BOLD)
      .text('Student', startX, y, { width: 230 })
      .text('Days', startX + 230, y, { width: 80, align: 'right' })
      .text('Absent', startX + 310, y, { width: 70, align: 'right' })
      .text('Attendance %', startX + 380, y, { width: 135, align: 'right' });
    y += 16;
    doc.moveTo(startX, y).lineTo(startX + 515, y).strokeColor('#999').stroke();
    doc.strokeColor('black');
    y += 6;

    doc.font(FONT_NAME).fontSize(9);
    for (const r of sorted) {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
      const flag = r.percentage != null && r.percentage < 75 ? '!' : ' ';
      const pctText = r.percentage == null ? '—' : `${r.percentage}%`;
      doc
        .text(`${flag} ${r.fullName}`, startX, y, { width: 230 })
        .text(`${r.presentDays} / ${r.expectedDays}`, startX + 230, y, {
          width: 80,
          align: 'right',
        })
        .text(String(r.absentDays), startX + 310, y, { width: 70, align: 'right' })
        .text(pctText, startX + 380, y, { width: 135, align: 'right' });
      y += 14;
    }

    doc.end();
    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}
