import type { UserRepository } from '../../src/domain/identity/ports/user.repository';
import type { SessionRepository } from '../../src/domain/identity/ports/session.repository';
import type { AcademyRepository } from '../../src/domain/academy/ports/academy.repository';
import type { SubscriptionRepository } from '../../src/domain/subscription/ports/subscription.repository';
import type { BatchRepository } from '../../src/domain/batch/ports/batch.repository';
import type {
  StudentRepository,
  StudentListFilter,
  BirthdayStudent,
} from '../../src/domain/student/ports/student.repository';
import type { User } from '../../src/domain/identity/entities/user.entity';
import type { Session } from '../../src/domain/identity/entities/session.entity';
import type { Academy } from '../../src/domain/academy/entities/academy.entity';
import type { Subscription } from '../../src/domain/subscription/entities/subscription.entity';
import type { Batch } from '../../src/domain/batch/entities/batch.entity';
import type { Student } from '../../src/domain/student/entities/student.entity';
import type { StudentAttendanceRepository } from '../../src/domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '../../src/domain/attendance/ports/holiday.repository';
import type { StudentAttendance } from '../../src/domain/attendance/entities/student-attendance.entity';
import type { Holiday } from '../../src/domain/attendance/entities/holiday.entity';
import type { FeeDueRepository } from '../../src/domain/fee/ports/fee-due.repository';
import type { PaymentRequestRepository } from '../../src/domain/fee/ports/payment-request.repository';
import type { TransactionLogRepository } from '../../src/domain/fee/ports/transaction-log.repository';
import type { FeeDue } from '../../src/domain/fee/entities/fee-due.entity';
import type { PaymentRequest } from '../../src/domain/fee/entities/payment-request.entity';
import type { TransactionLog } from '../../src/domain/fee/entities/transaction-log.entity';
import type { StaffAttendanceRepository } from '../../src/domain/staff-attendance/ports/staff-attendance.repository';
import type { StaffAttendance } from '../../src/domain/staff-attendance/entities/staff-attendance.entity';
import type { UserRole, FeeDueStatus, PaymentRequestStatus } from '@playconnect/contracts';

export class InMemoryUserRepository implements UserRepository {
  private users: Map<string, User> = new Map();

  async save(user: User): Promise<void> {
    this.users.set(user.id.toString(), user);
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByEmail(emailNormalized: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.emailNormalized === emailNormalized.toLowerCase()) {
        return user;
      }
    }
    return null;
  }

  async findByPhone(phoneE164: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.phoneE164 === phoneE164) {
        return user;
      }
    }
    return null;
  }

  async updateAcademyId(userId: string, academyId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const { User: UserClass } = await import('../../src/domain/identity/entities/user.entity');
      const updated = UserClass.reconstitute(userId, {
        ...user['props'],
        academyId,
      });
      this.users.set(userId, updated);
    }
  }

  async listByAcademyAndRole(
    academyId: string,
    role: UserRole,
    page: number,
    pageSize: number,
  ): Promise<{ users: User[]; total: number }> {
    const filtered = Array.from(this.users.values()).filter(
      (u) => u.academyId === academyId && u.role === role,
    );
    // Sort newest first
    filtered.sort((a, b) => b.audit.createdAt.getTime() - a.audit.createdAt.getTime());
    const start = (page - 1) * pageSize;
    const users = filtered.slice(start, start + pageSize);
    return { users, total: filtered.length };
  }

  async incrementTokenVersionByAcademyId(academyId: string): Promise<string[]> {
    const { User: UserClass } = await import('../../src/domain/identity/entities/user.entity');
    const ids: string[] = [];
    for (const [id, user] of this.users) {
      if (user.academyId === academyId && !user.softDelete.deletedAt) {
        const updated = UserClass.reconstitute(id, {
          ...user['props'],
          tokenVersion: user.tokenVersion + 1,
        });
        this.users.set(id, updated);
        ids.push(id);
      }
    }
    return ids;
  }

  async listByAcademyId(academyId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(
      (u) => u.academyId === academyId && !u.softDelete.deletedAt,
    );
  }

  clear(): void {
    this.users.clear();
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private sessions: Map<string, Session> = new Map();

  async save(session: Session): Promise<void> {
    // Upsert: key by (userId, deviceId) — remove old session first
    for (const [key, s] of this.sessions) {
      if (s.userId === session.userId && s.deviceId === session.deviceId) {
        this.sessions.delete(key);
      }
    }
    this.sessions.set(session.id.toString(), session);
  }

  async findByUserAndDevice(userId: string, deviceId: string): Promise<Session | null> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.deviceId === deviceId && !session.isRevoked()) {
        return session;
      }
    }
    return null;
  }

  async findActiveByDeviceId(userId: string, deviceId: string): Promise<Session | null> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.deviceId === deviceId && !session.isRevoked()) {
        return session;
      }
    }
    return null;
  }

  async revokeByUserAndDevice(userId: string, deviceId: string): Promise<void> {
    for (const [key, session] of this.sessions) {
      if (session.userId === userId && session.deviceId === deviceId) {
        // Replace with a revoked version
        const { Session: SessionClass } =
          await import('../../src/domain/identity/entities/session.entity');
        const revoked = SessionClass.reconstitute(session.id.toString(), {
          userId: session.userId,
          deviceId: session.deviceId,
          refreshTokenHash: session.refreshTokenHash,
          createdAt: new Date(),
          expiresAt: session.expiresAt,
          revokedAt: new Date(),
          lastRotatedAt: null,
        });
        this.sessions.set(key, revoked);
      }
    }
  }

  async updateRefreshToken(sessionId: string, newHash: string, expiresAt: Date, expectedCurrentHash?: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (expectedCurrentHash && session.refreshTokenHash !== expectedCurrentHash) {
      return false;
    }
    const { Session: SessionClass } =
      await import('../../src/domain/identity/entities/session.entity');
    const updated = SessionClass.reconstitute(sessionId, {
      userId: session.userId,
      deviceId: session.deviceId,
      refreshTokenHash: newHash,
      createdAt: new Date(),
      expiresAt,
      revokedAt: null,
      lastRotatedAt: new Date(),
    });
    this.sessions.set(sessionId, updated);
    return true;
  }

  async revokeAllByUserIds(userIds: string[]): Promise<void> {
    const idSet = new Set(userIds);
    const { Session: SessionClass } =
      await import('../../src/domain/identity/entities/session.entity');
    for (const [key, session] of this.sessions) {
      if (idSet.has(session.userId) && !session.isRevoked()) {
        const revoked = SessionClass.reconstitute(session.id.toString(), {
          userId: session.userId,
          deviceId: session.deviceId,
          refreshTokenHash: session.refreshTokenHash,
          createdAt: new Date(),
          expiresAt: session.expiresAt,
          revokedAt: new Date(),
          lastRotatedAt: null,
        });
        this.sessions.set(key, revoked);
      }
    }
  }

  clear(): void {
    this.sessions.clear();
  }
}

// ── Password Reset Challenge ──────────────────────────────────────────

import type { PasswordResetChallengeRepository } from '../../src/domain/identity/ports/password-reset-challenge.repository';
import type { PasswordResetChallenge } from '../../src/domain/identity/entities/password-reset-challenge.entity';

export class InMemoryPasswordResetChallengeRepository
  implements PasswordResetChallengeRepository
{
  private challenges: Map<string, PasswordResetChallenge> = new Map();

  async save(challenge: PasswordResetChallenge): Promise<void> {
    this.challenges.set(challenge.id.toString(), challenge);
  }

  async findLatestActiveByUserId(userId: string): Promise<PasswordResetChallenge | null> {
    const active = Array.from(this.challenges.values())
      .filter(
        (c) =>
          c.userId === userId &&
          c.usedAt === null &&
          c.expiresAt > new Date(),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return active[0] ?? null;
  }

  async invalidateActiveByUserId(userId: string): Promise<void> {
    const now = new Date();
    for (const [id, challenge] of this.challenges) {
      if (challenge.userId === userId && challenge.usedAt === null && challenge.expiresAt > now) {
        const { PasswordResetChallenge: Cls } = await import(
          '../../src/domain/identity/entities/password-reset-challenge.entity'
        );
        const updated = Cls.reconstitute(id, {
          userId: challenge.userId,
          otpHash: challenge.otpHash,
          expiresAt: challenge.expiresAt,
          attempts: challenge.attempts,
          maxAttempts: challenge.maxAttempts,
          usedAt: now,
          createdAt: challenge.createdAt,
        });
        this.challenges.set(id, updated);
      }
    }
  }

  async markUsed(challengeId: string): Promise<void> {
    const challenge = this.challenges.get(challengeId);
    if (challenge) {
      const { PasswordResetChallenge: Cls } = await import(
        '../../src/domain/identity/entities/password-reset-challenge.entity'
      );
      const updated = Cls.reconstitute(challengeId, {
        userId: challenge.userId,
        otpHash: challenge.otpHash,
        expiresAt: challenge.expiresAt,
        attempts: challenge.attempts,
        maxAttempts: challenge.maxAttempts,
        usedAt: new Date(),
        createdAt: challenge.createdAt,
      });
      this.challenges.set(challengeId, updated);
    }
  }

  async incrementAttempts(challengeId: string): Promise<void> {
    const challenge = this.challenges.get(challengeId);
    if (challenge) {
      const { PasswordResetChallenge: Cls } = await import(
        '../../src/domain/identity/entities/password-reset-challenge.entity'
      );
      const updated = Cls.reconstitute(challengeId, {
        userId: challenge.userId,
        otpHash: challenge.otpHash,
        expiresAt: challenge.expiresAt,
        attempts: challenge.attempts + 1,
        maxAttempts: challenge.maxAttempts,
        usedAt: challenge.usedAt,
        createdAt: challenge.createdAt,
      });
      this.challenges.set(challengeId, updated);
    }
  }

  clear(): void {
    this.challenges.clear();
  }
}

// ── Student Batch ─────────────────────────────────────────────────────

import type { StudentBatchRepository } from '../../src/domain/batch/ports/student-batch.repository';
import type { StudentBatch } from '../../src/domain/batch/entities/student-batch.entity';

export class InMemoryStudentBatchRepository implements StudentBatchRepository {
  private assignments: Map<string, StudentBatch> = new Map();

  async replaceForStudent(studentId: string, newAssignments: StudentBatch[]): Promise<void> {
    // Remove existing assignments for this student
    for (const [key, a] of this.assignments) {
      if (a.studentId === studentId) {
        this.assignments.delete(key);
      }
    }
    // Add new
    for (const a of newAssignments) {
      this.assignments.set(a.id.toString(), a);
    }
  }

  async findByStudentId(studentId: string): Promise<StudentBatch[]> {
    return Array.from(this.assignments.values()).filter((a) => a.studentId === studentId);
  }

  async findByBatchId(batchId: string): Promise<StudentBatch[]> {
    return Array.from(this.assignments.values()).filter((a) => a.batchId === batchId);
  }

  async deleteByBatchId(batchId: string): Promise<number> {
    let count = 0;
    for (const [key, a] of this.assignments) {
      if (a.batchId === batchId) {
        this.assignments.delete(key);
        count++;
      }
    }
    return count;
  }

  async countByBatchId(batchId: string): Promise<number> {
    return Array.from(this.assignments.values()).filter((a) => a.batchId === batchId).length;
  }

  clear(): void {
    this.assignments.clear();
  }
}

export class InMemoryAcademyRepository implements AcademyRepository {
  private academies: Map<string, Academy> = new Map();

  async save(academy: Academy): Promise<void> {
    this.academies.set(academy.id.toString(), academy);
  }

  async findById(id: string): Promise<Academy | null> {
    return this.academies.get(id) ?? null;
  }

  async findByOwnerUserId(ownerUserId: string): Promise<Academy | null> {
    for (const academy of this.academies.values()) {
      if (academy.ownerUserId === ownerUserId) {
        return academy;
      }
    }
    return null;
  }

  async findAllIds(): Promise<string[]> {
    return Array.from(this.academies.keys());
  }

  clear(): void {
    this.academies.clear();
  }
}

export class InMemorySubscriptionRepository implements SubscriptionRepository {
  private subscriptions: Map<string, Subscription> = new Map();

  async save(subscription: Subscription): Promise<void> {
    this.subscriptions.set(subscription.id.toString(), subscription);
  }

  async findByAcademyId(academyId: string): Promise<Subscription | null> {
    for (const sub of this.subscriptions.values()) {
      if (sub.academyId === academyId) {
        return sub;
      }
    }
    return null;
  }

  clear(): void {
    this.subscriptions.clear();
  }
}

export class InMemoryBatchRepository implements BatchRepository {
  private batches: Map<string, Batch> = new Map();

  async save(batch: Batch): Promise<void> {
    this.batches.set(batch.id.toString(), batch);
  }

  async findById(id: string): Promise<Batch | null> {
    return this.batches.get(id) ?? null;
  }

  async findByAcademyAndName(
    academyId: string,
    batchNameNormalized: string,
  ): Promise<Batch | null> {
    for (const batch of this.batches.values()) {
      if (batch.academyId === academyId && batch.batchNameNormalized === batchNameNormalized) {
        return batch;
      }
    }
    return null;
  }

  async listByAcademy(
    academyId: string,
    page: number,
    pageSize: number,
  ): Promise<{ batches: Batch[]; total: number }> {
    const filtered = Array.from(this.batches.values()).filter((b) => b.academyId === academyId);
    filtered.sort((a, b) => b.audit.createdAt.getTime() - a.audit.createdAt.getTime());
    const start = (page - 1) * pageSize;
    const batches = filtered.slice(start, start + pageSize);
    return { batches, total: filtered.length };
  }

  async deleteById(id: string): Promise<void> {
    this.batches.delete(id);
  }

  clear(): void {
    this.batches.clear();
  }
}

export class InMemoryStudentRepository implements StudentRepository {
  private students: Map<string, Student> = new Map();

  async save(student: Student): Promise<void> {
    this.students.set(student.id.toString(), student);
  }

  async findById(id: string): Promise<Student | null> {
    return this.students.get(id) ?? null;
  }

  async list(
    filter: StudentListFilter,
    page: number,
    pageSize: number,
  ): Promise<{ students: Student[]; total: number }> {
    let filtered = Array.from(this.students.values()).filter(
      (s) => s.academyId === filter.academyId && !s.isDeleted(),
    );

    if (filter.status) {
      filtered = filtered.filter((s) => s.status === filter.status);
    }

    if (filter.search) {
      const normalizedSearch = filter.search.trim().toLowerCase();
      filtered = filtered.filter((s) => s.fullNameNormalized.startsWith(normalizedSearch));
    }

    filtered.sort((a, b) => b.audit.createdAt.getTime() - a.audit.createdAt.getTime());
    const start = (page - 1) * pageSize;
    const students = filtered.slice(start, start + pageSize);
    return { students, total: filtered.length };
  }

  async listActiveByAcademy(academyId: string): Promise<Student[]> {
    return Array.from(this.students.values()).filter(
      (s) => s.academyId === academyId && s.status === 'ACTIVE' && !s.isDeleted(),
    );
  }

  async countActiveByAcademy(academyId: string): Promise<number> {
    return Array.from(this.students.values()).filter(
      (s) => s.academyId === academyId && s.status === 'ACTIVE' && !s.isDeleted(),
    ).length;
  }

  async findByIds(ids: string[]): Promise<Student[]> {
    return ids.map((id) => this.students.get(id)).filter((s): s is Student => s !== undefined);
  }

  async countInactiveByAcademy(academyId: string): Promise<number> {
    return Array.from(this.students.values()).filter(
      (s) => s.academyId === academyId && s.status === 'INACTIVE' && !s.isDeleted(),
    ).length;
  }

  async countNewAdmissionsByAcademyAndDateRange(
    academyId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return Array.from(this.students.values()).filter(
      (s) =>
        s.academyId === academyId &&
        s.status === 'ACTIVE' &&
        !s.isDeleted() &&
        s.joiningDate >= from &&
        s.joiningDate <= to,
    ).length;
  }

  async findBirthdaysByAcademy(
    academyId: string,
    month: number,
    day?: number,
  ): Promise<BirthdayStudent[]> {
    return Array.from(this.students.values())
      .filter((s) => {
        if (s.academyId !== academyId || s.status !== 'ACTIVE' || s.isDeleted()) return false;
        const dob = s.dateOfBirth;
        if (dob.getMonth() + 1 !== month) return false;
        if (day !== undefined && dob.getDate() !== day) return false;
        return true;
      })
      .map((s) => ({
        id: s.id.toString(),
        fullName: s.fullName,
        profilePhotoUrl: s.profilePhotoUrl,
        dateOfBirth: s.dateOfBirth,
        guardianMobile: s.guardian.mobile,
      }));
  }

  clear(): void {
    this.students.clear();
  }
}

export class InMemoryStudentAttendanceRepository implements StudentAttendanceRepository {
  private records: Map<string, StudentAttendance> = new Map();

  private key(academyId: string, studentId: string, date: string): string {
    return `${academyId}:${studentId}:${date}`;
  }

  async save(record: StudentAttendance): Promise<void> {
    this.records.set(this.key(record.academyId, record.studentId, record.date), record);
  }

  async deleteByAcademyStudentDate(
    academyId: string,
    studentId: string,
    date: string,
  ): Promise<void> {
    this.records.delete(this.key(academyId, studentId, date));
  }

  async findByAcademyStudentDate(
    academyId: string,
    studentId: string,
    date: string,
  ): Promise<StudentAttendance | null> {
    return this.records.get(this.key(academyId, studentId, date)) ?? null;
  }

  async findAbsentByAcademyAndDate(academyId: string, date: string): Promise<StudentAttendance[]> {
    return Array.from(this.records.values()).filter(
      (r) => r.academyId === academyId && r.date === date,
    );
  }

  async findAbsentByAcademyStudentAndMonth(
    academyId: string,
    studentId: string,
    monthPrefix: string,
  ): Promise<StudentAttendance[]> {
    return Array.from(this.records.values()).filter(
      (r) =>
        r.academyId === academyId && r.studentId === studentId && r.date.startsWith(monthPrefix),
    );
  }

  async findAbsentByAcademyAndMonth(
    academyId: string,
    monthPrefix: string,
  ): Promise<StudentAttendance[]> {
    return Array.from(this.records.values()).filter(
      (r) => r.academyId === academyId && r.date.startsWith(monthPrefix),
    );
  }

  async deleteByAcademyAndDate(academyId: string, date: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.academyId === academyId && record.date === date) {
        this.records.delete(key);
      }
    }
  }

  async countAbsentByAcademyAndDate(academyId: string, date: string): Promise<number> {
    return Array.from(this.records.values()).filter(
      (r) => r.academyId === academyId && r.date === date,
    ).length;
  }

  clear(): void {
    this.records.clear();
  }
}

export class InMemoryHolidayRepository implements HolidayRepository {
  private holidays: Map<string, Holiday> = new Map();

  private key(academyId: string, date: string): string {
    return `${academyId}:${date}`;
  }

  async save(holiday: Holiday): Promise<void> {
    this.holidays.set(this.key(holiday.academyId, holiday.date), holiday);
  }

  async findByAcademyAndDate(academyId: string, date: string): Promise<Holiday | null> {
    return this.holidays.get(this.key(academyId, date)) ?? null;
  }

  async deleteByAcademyAndDate(academyId: string, date: string): Promise<void> {
    this.holidays.delete(this.key(academyId, date));
  }

  async findByAcademyAndMonth(academyId: string, monthPrefix: string): Promise<Holiday[]> {
    return Array.from(this.holidays.values()).filter(
      (h) => h.academyId === academyId && h.date.startsWith(monthPrefix),
    );
  }

  clear(): void {
    this.holidays.clear();
  }
}

export class InMemoryFeeDueRepository implements FeeDueRepository {
  private dues: Map<string, FeeDue> = new Map();

  private compositeKey(academyId: string, studentId: string, monthKey: string): string {
    return `${academyId}:${studentId}:${monthKey}`;
  }

  async findById(id: string): Promise<FeeDue | null> {
    return this.dues.get(id) ?? null;
  }

  async save(feeDue: FeeDue): Promise<void> {
    this.dues.set(feeDue.id.toString(), feeDue);
  }

  async bulkSave(feeDues: FeeDue[]): Promise<void> {
    for (const fd of feeDues) {
      this.dues.set(fd.id.toString(), fd);
    }
  }

  async bulkUpdateStatus(ids: string[], status: FeeDueStatus): Promise<void> {
    const { FeeDue: FeeDueClass } = await import('../../src/domain/fee/entities/fee-due.entity');
    for (const id of ids) {
      const due = this.dues.get(id);
      if (due) {
        const updated = FeeDueClass.reconstitute(id, {
          ...due['props'],
          status,
        });
        this.dues.set(id, updated);
      }
    }
  }

  async findByAcademyStudentMonth(
    academyId: string,
    studentId: string,
    monthKey: string,
  ): Promise<FeeDue | null> {
    for (const due of this.dues.values()) {
      if (due.academyId === academyId && due.studentId === studentId && due.monthKey === monthKey) {
        return due;
      }
    }
    return null;
  }

  async listByAcademyMonthAndStatuses(
    academyId: string,
    monthKey: string,
    statuses: FeeDueStatus[],
  ): Promise<FeeDue[]> {
    return Array.from(this.dues.values()).filter(
      (d) => d.academyId === academyId && d.monthKey === monthKey && statuses.includes(d.status),
    );
  }

  async listByAcademyMonthPaid(academyId: string, monthKey: string): Promise<FeeDue[]> {
    return Array.from(this.dues.values()).filter(
      (d) => d.academyId === academyId && d.monthKey === monthKey && d.status === 'PAID',
    );
  }

  async listByStudentAndRange(
    academyId: string,
    studentId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<FeeDue[]> {
    return Array.from(this.dues.values())
      .filter(
        (d) =>
          d.academyId === academyId &&
          d.studentId === studentId &&
          d.monthKey >= fromMonth &&
          d.monthKey <= toMonth,
      )
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }

  async listUpcomingByAcademyAndMonth(academyId: string, monthKey: string): Promise<FeeDue[]> {
    return Array.from(this.dues.values()).filter(
      (d) => d.academyId === academyId && d.monthKey === monthKey && d.status === 'UPCOMING',
    );
  }

  async listByAcademyAndMonth(academyId: string, monthKey: string): Promise<FeeDue[]> {
    return Array.from(this.dues.values()).filter(
      (d) => d.academyId === academyId && d.monthKey === monthKey,
    );
  }

  async listUnpaidByAcademy(academyId: string): Promise<FeeDue[]> {
    return Array.from(this.dues.values()).filter(
      (d) => d.academyId === academyId && (d.status === 'UPCOMING' || d.status === 'DUE'),
    );
  }

  async findUnpaidByDueDate(dueDate: string): Promise<FeeDue[]> {
    return Array.from(this.dues.values()).filter(
      (d) => d.dueDate === dueDate && (d.status === 'UPCOMING' || d.status === 'DUE'),
    );
  }

  async findOverdueDues(upToDate: string): Promise<FeeDue[]> {
    return Array.from(this.dues.values()).filter(
      (d) => d.status === 'DUE' && d.dueDate <= upToDate,
    );
  }

  async findDueWithoutSnapshot(academyId: string): Promise<FeeDue[]> {
    return Array.from(this.dues.values()).filter(
      (d) => d.academyId === academyId && d.status === 'DUE' && d.lateFeeConfigSnapshot === null,
    );
  }

  async deleteUpcomingByStudent(academyId: string, studentId: string): Promise<number> {
    let count = 0;
    for (const [key, due] of this.dues) {
      if (due.academyId === academyId && due.studentId === studentId && due.status === 'UPCOMING') {
        this.dues.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.dues.clear();
  }
}

export class InMemoryPaymentRequestRepository implements PaymentRequestRepository {
  private requests: Map<string, PaymentRequest> = new Map();

  async save(request: PaymentRequest): Promise<void> {
    this.requests.set(request.id.toString(), request);
  }

  async findById(id: string): Promise<PaymentRequest | null> {
    return this.requests.get(id) ?? null;
  }

  async findPendingByFeeDue(feeDueId: string): Promise<PaymentRequest | null> {
    for (const req of this.requests.values()) {
      if (req.feeDueId === feeDueId && req.status === 'PENDING') {
        return req;
      }
    }
    return null;
  }

  async listByAcademyAndStatuses(
    academyId: string,
    statuses: PaymentRequestStatus[],
  ): Promise<PaymentRequest[]> {
    return Array.from(this.requests.values())
      .filter((r) => r.academyId === academyId && statuses.includes(r.status))
      .sort((a, b) => b.audit.createdAt.getTime() - a.audit.createdAt.getTime());
  }

  async listByStaffAndAcademy(staffUserId: string, academyId: string): Promise<PaymentRequest[]> {
    return Array.from(this.requests.values())
      .filter((r) => r.staffUserId === staffUserId && r.academyId === academyId)
      .sort((a, b) => b.audit.createdAt.getTime() - a.audit.createdAt.getTime());
  }

  async countPendingByAcademy(academyId: string): Promise<number> {
    return Array.from(this.requests.values()).filter(
      (r) => r.academyId === academyId && r.status === 'PENDING',
    ).length;
  }

  clear(): void {
    this.requests.clear();
  }
}

export class InMemoryTransactionLogRepository implements TransactionLogRepository {
  private logs: Map<string, TransactionLog> = new Map();

  async save(log: TransactionLog): Promise<void> {
    this.logs.set(log.id.toString(), log);
  }

  async findByPaymentRequestId(paymentRequestId: string): Promise<TransactionLog | null> {
    for (const log of this.logs.values()) {
      if (log.paymentRequestId === paymentRequestId) {
        return log;
      }
    }
    return null;
  }

  async listByAcademy(
    academyId: string,
    page: number,
    pageSize: number,
  ): Promise<TransactionLog[]> {
    const all = Array.from(this.logs.values())
      .filter((l) => l.academyId === academyId)
      .sort((a, b) => b.audit.createdAt.getTime() - a.audit.createdAt.getTime());
    const start = (page - 1) * pageSize;
    return all.slice(start, start + pageSize);
  }

  async countByAcademyAndPrefix(academyId: string, prefix: string): Promise<number> {
    return Array.from(this.logs.values()).filter(
      (l) => l.academyId === academyId && l.receiptNumber.startsWith(`${prefix}-`),
    ).length;
  }

  async sumRevenueByAcademyAndDateRange(academyId: string, from: Date, to: Date): Promise<number> {
    return Array.from(this.logs.values())
      .filter(
        (l) => l.academyId === academyId && l.audit.createdAt >= from && l.audit.createdAt <= to,
      )
      .reduce((sum, l) => sum + l.amount, 0);
  }

  async listByAcademyAndDateRange(
    academyId: string,
    from: Date,
    to: Date,
  ): Promise<TransactionLog[]> {
    return Array.from(this.logs.values())
      .filter(
        (l) => l.academyId === academyId && l.audit.createdAt >= from && l.audit.createdAt <= to,
      )
      .sort((a, b) => b.audit.createdAt.getTime() - a.audit.createdAt.getTime());
  }

  async findByFeeDueId(feeDueId: string): Promise<TransactionLog | null> {
    for (const log of this.logs.values()) {
      if (log.feeDueId === feeDueId) {
        return log;
      }
    }
    return null;
  }

  async listByStudentIds(studentIds: string[]): Promise<TransactionLog[]> {
    const idSet = new Set(studentIds);
    return Array.from(this.logs.values())
      .filter((l) => idSet.has(l.studentId))
      .sort((a, b) => b.audit.createdAt.getTime() - a.audit.createdAt.getTime());
  }

  async sumRevenueByAcademyGroupedByMonth(
    academyId: string,
    from: Date,
    to: Date,
  ): Promise<{ month: string; total: number }[]> {
    const map = new Map<string, number>();
    for (const log of this.logs.values()) {
      if (log.academyId === academyId && log.audit.createdAt >= from && log.audit.createdAt <= to) {
        const d = log.audit.createdAt;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        map.set(key, (map.get(key) ?? 0) + log.amount);
      }
    }
    return Array.from(map.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  clear(): void {
    this.logs.clear();
  }
}

export class InMemoryStaffAttendanceRepository implements StaffAttendanceRepository {
  private records: Map<string, StaffAttendance> = new Map();

  private key(academyId: string, staffUserId: string, date: string): string {
    return `${academyId}:${staffUserId}:${date}`;
  }

  async save(record: StaffAttendance): Promise<void> {
    this.records.set(this.key(record.academyId, record.staffUserId, record.date), record);
  }

  async deleteByAcademyStaffDate(
    academyId: string,
    staffUserId: string,
    date: string,
  ): Promise<void> {
    this.records.delete(this.key(academyId, staffUserId, date));
  }

  async findAbsentByAcademyAndDate(academyId: string, date: string): Promise<StaffAttendance[]> {
    return Array.from(this.records.values()).filter(
      (r) => r.academyId === academyId && r.date === date,
    );
  }

  async findAbsentByAcademyDateAndStaffIds(
    academyId: string,
    date: string,
    staffUserIds: string[],
  ): Promise<StaffAttendance[]> {
    const idSet = new Set(staffUserIds);
    return Array.from(this.records.values()).filter(
      (r) => r.academyId === academyId && r.date === date && idSet.has(r.staffUserId),
    );
  }

  async findAbsentByAcademyAndMonth(
    academyId: string,
    monthPrefix: string,
  ): Promise<StaffAttendance[]> {
    return Array.from(this.records.values()).filter(
      (r) => r.academyId === academyId && r.date.startsWith(monthPrefix),
    );
  }

  async countAbsentByAcademyStaffAndMonth(
    academyId: string,
    staffUserId: string,
    monthPrefix: string,
  ): Promise<number> {
    return Array.from(this.records.values()).filter(
      (r) =>
        r.academyId === academyId &&
        r.staffUserId === staffUserId &&
        r.date.startsWith(monthPrefix),
    ).length;
  }

  clear(): void {
    this.records.clear();
  }
}

// ── Enquiry ──────────────────────────────────────────────────────────

import type {
  EnquiryRepository,
  EnquiryListFilter,
  EnquirySummaryResult,
} from '../../src/domain/enquiry/ports/enquiry.repository';
import type { Enquiry } from '../../src/domain/enquiry/entities/enquiry.entity';

export class InMemoryEnquiryRepository implements EnquiryRepository {
  private enquiries: Map<string, Enquiry> = new Map();

  async save(enquiry: Enquiry): Promise<void> {
    this.enquiries.set(enquiry.id.toString(), enquiry);
  }

  async findById(id: string): Promise<Enquiry | null> {
    return this.enquiries.get(id) ?? null;
  }

  async findActiveByMobileAndAcademy(
    academyId: string,
    mobileNumber: string,
  ): Promise<Enquiry | null> {
    for (const e of this.enquiries.values()) {
      if (
        e.academyId === academyId &&
        e.mobileNumber === mobileNumber &&
        e.status === 'ACTIVE'
      ) {
        return e;
      }
    }
    return null;
  }

  async list(
    filter: EnquiryListFilter,
    page: number,
    pageSize: number,
  ): Promise<{ enquiries: Enquiry[]; total: number }> {
    let items = Array.from(this.enquiries.values()).filter(
      (e) => e.academyId === filter.academyId,
    );

    if (filter.status) {
      items = items.filter((e) => e.status === filter.status);
    }

    if (filter.search) {
      const s = filter.search.toLowerCase();
      items = items.filter(
        (e) =>
          e.prospectName.toLowerCase().includes(s) ||
          e.mobileNumber.includes(s),
      );
    }

    if (filter.followUpToday) {
      const today = new Date().toISOString().slice(0, 10);
      items = items.filter((e) => {
        if (!e.nextFollowUpDate) return false;
        return e.nextFollowUpDate.toISOString().slice(0, 10) === today;
      });
    }

    items.sort((a, b) => b.audit.createdAt.getTime() - a.audit.createdAt.getTime());
    const total = items.length;
    const start = (page - 1) * pageSize;
    const enquiries = items.slice(start, start + pageSize);
    return { enquiries, total };
  }

  async summary(academyId: string): Promise<EnquirySummaryResult> {
    const all = Array.from(this.enquiries.values()).filter(
      (e) => e.academyId === academyId,
    );
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: all.length,
      active: all.filter((e) => e.status === 'ACTIVE').length,
      closed: all.filter((e) => e.status === 'CLOSED').length,
      todayFollowUp: all.filter((e) => {
        if (!e.nextFollowUpDate) return false;
        return e.nextFollowUpDate.toISOString().slice(0, 10) === today;
      }).length,
    };
  }

  clear(): void {
    this.enquiries.clear();
  }
}

// ── Student Query ────────────────────────────────────────────────────

import type {
  StudentQueryRepository,
  StudentListQuery,
  StudentListRow,
} from '../../src/domain/student/ports/student-query.repository';
import { toMonthKeyFromDate } from '../../src/shared/date-utils';

export class InMemoryStudentQueryRepository implements StudentQueryRepository {
  constructor(
    private readonly studentRepo: InMemoryStudentRepository,
    private readonly feeDueRepo: InMemoryFeeDueRepository,
  ) {}

  async listWithFeeFilter(
    query: StudentListQuery,
    page: number,
    pageSize: number,
  ): Promise<{ rows: StudentListRow[]; total: number }> {
    const { students } = await this.studentRepo.list(
      {
        academyId: query.academyId,
        status: query.status,
        search: query.search,
      },
      1,
      10000,
    );

    let filtered = students;

    if (query.feeFilter && query.feeFilter !== 'ALL') {
      const monthKey = query.month ?? toMonthKeyFromDate(new Date());
      const targetStatuses = query.feeFilter === 'DUE' ? ['UPCOMING', 'DUE'] : ['PAID'];

      const withFees: Student[] = [];
      for (const student of filtered) {
        const feeDue = await this.feeDueRepo.findByAcademyStudentMonth(
          query.academyId,
          student.id.toString(),
          monthKey,
        );
        if (feeDue && targetStatuses.includes(feeDue.status)) {
          withFees.push(student);
        }
      }
      filtered = withFees;
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    const rows: StudentListRow[] = paged.map((s) => ({
      id: s.id.toString(),
      academyId: s.academyId,
      fullName: s.fullName,
      dateOfBirth: s.dateOfBirth.toISOString().slice(0, 10),
      gender: s.gender,
      address: {
        line1: s.address.line1,
        line2: s.address.line2 ?? null,
        city: s.address.city,
        state: s.address.state,
        pincode: s.address.pincode,
      },
      guardian: {
        name: s.guardian.name,
        mobile: s.guardian.mobile,
        email: s.guardian.email,
      },
      joiningDate: s.joiningDate.toISOString().slice(0, 10),
      monthlyFee: s.monthlyFee,
      mobileNumber: s.mobileNumber,
      email: s.email,
      profilePhotoUrl: s.profilePhotoUrl,
      fatherName: s.fatherName,
      motherName: s.motherName,
      aadhaarNumber: s.aadhaarNumber,
      caste: s.caste,
      whatsappNumber: s.whatsappNumber,
      addressText: s.addressText,
      instituteInfo: s.instituteInfo,
      hasPassword: s.passwordHash !== null,
      status: s.status,
      createdAt: s.audit.createdAt,
      updatedAt: s.audit.updatedAt,
    }));

    return { rows, total };
  }
}

// ── Audit Log ────────────────────────────────────────────────────────

import type {
  AuditLogRepository,
  AuditLogFilter,
} from '../../src/domain/audit/ports/audit-log.repository';
import type { AuditLog } from '../../src/domain/audit/entities/audit-log.entity';
import type { Paginated } from '@playconnect/contracts';

export class InMemoryAuditLogRepository implements AuditLogRepository {
  private logs: AuditLog[] = [];

  async save(log: AuditLog): Promise<void> {
    this.logs.push(log);
  }

  async listByAcademy(academyId: string, filter: AuditLogFilter): Promise<Paginated<AuditLog>> {
    let items = this.logs.filter((l) => l.academyId === academyId);

    if (filter.action) {
      items = items.filter((l) => l.action === filter.action);
    }
    if (filter.entityType) {
      items = items.filter((l) => l.entityType === filter.entityType);
    }
    if (filter.from) {
      const from = new Date(`${filter.from}T00:00:00.000Z`);
      items = items.filter((l) => l.createdAt >= from);
    }
    if (filter.to) {
      const to = new Date(`${filter.to}T23:59:59.999Z`);
      items = items.filter((l) => l.createdAt <= to);
    }

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const totalItems = items.length;
    const page = filter.page;
    const pageSize = filter.pageSize;
    const skip = (page - 1) * pageSize;
    const paged = items.slice(skip, skip + pageSize);
    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items: paged,
      meta: { page, pageSize, totalItems, totalPages },
    };
  }

  clear(): void {
    this.logs = [];
  }
}

// ── Expense ────────────────────────────────────────────────────────────

import type { ExpenseRepository } from '@domain/expense/ports/expense.repository';
import { Expense } from '@domain/expense/entities/expense.entity';

export class InMemoryExpenseRepository implements ExpenseRepository {
  private expenses: Expense[] = [];

  async save(expense: Expense): Promise<void> {
    const idx = this.expenses.findIndex((e) => e.id.toString() === expense.id.toString());
    if (idx >= 0) {
      this.expenses[idx] = expense;
    } else {
      this.expenses.push(expense);
    }
  }

  async findById(id: string): Promise<Expense | null> {
    return this.expenses.find((e) => e.id.toString() === id) ?? null;
  }

  async listByAcademy(
    academyId: string,
    filter: { month: string; categoryId?: string; page: number; pageSize: number },
  ): Promise<{ data: Expense[]; total: number }> {
    let items = this.expenses.filter(
      (e) => e.academyId === academyId && e.softDelete.deletedAt === null && e.date.startsWith(filter.month),
    );
    if (filter.categoryId) {
      items = items.filter((e) => e.categoryId === filter.categoryId);
    }
    const total = items.length;
    const skip = (filter.page - 1) * filter.pageSize;
    return { data: items.slice(skip, skip + filter.pageSize), total };
  }

  async sumByAcademyAndMonth(academyId: string, month: string): Promise<number> {
    return this.expenses
      .filter((e) => e.academyId === academyId && e.softDelete.deletedAt === null && e.date.startsWith(month))
      .reduce((sum, e) => sum + e.amount, 0);
  }

  async sumByAcademyAndDateRange(academyId: string, from: Date, to: Date): Promise<number> {
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    return this.expenses
      .filter(
        (e) =>
          e.academyId === academyId &&
          e.softDelete.deletedAt === null &&
          e.date >= fromStr &&
          e.date <= toStr,
      )
      .reduce((sum, e) => sum + e.amount, 0);
  }

  async summarizeByCategory(
    academyId: string,
    month: string,
  ): Promise<{ category: string; total: number }[]> {
    const map = new Map<string, number>();
    this.expenses
      .filter((e) => e.academyId === academyId && e.softDelete.deletedAt === null && e.date.startsWith(month))
      .forEach((e) => {
        map.set(e.categoryName, (map.get(e.categoryName) ?? 0) + e.amount);
      });
    return Array.from(map.entries()).map(([category, total]) => ({ category, total }));
  }

  async countByCategoryId(academyId: string, categoryId: string): Promise<number> {
    return this.expenses.filter(
      (e) => e.academyId === academyId && e.categoryId === categoryId && e.softDelete.deletedAt === null,
    ).length;
  }

  async sumByAcademyGroupedByMonth(
    academyId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<{ month: string; total: number }[]> {
    const map = new Map<string, number>();
    for (const e of this.expenses) {
      if (e.academyId !== academyId || e.softDelete.deletedAt !== null) continue;
      const monthKey = e.date.slice(0, 7);
      if (monthKey < fromMonth || monthKey > toMonth) continue;
      map.set(monthKey, (map.get(monthKey) ?? 0) + e.amount);
    }
    return Array.from(map.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  clear(): void {
    this.expenses = [];
  }
}
