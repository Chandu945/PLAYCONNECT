import type { Result } from '@shared/kernel';
import { ok, err, isDeleted } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRole } from '@playconnect/contracts';
import type { ExpenseRepository } from '@domain/expense/ports/expense.repository';
import type { ExpenseCategoryRepository } from '@domain/expense/ports/expense-category.repository';
import { canManageExpenses } from '@domain/expense/rules/expense.rules';
import { ExpenseErrors } from '@domain/expense/errors/expense.errors';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';

export interface UpdateExpenseInput {
  actorUserId: string;
  actorRole: UserRole;
  expenseId: string;
  categoryId?: string;
  date?: string;
  amount?: number;
  notes?: string | null;
}

export interface UpdateExpenseOutput {
  id: string;
  categoryId: string;
  categoryName: string;
  date: string;
  amount: number;
  notes: string | null;
}

export class UpdateExpenseUseCase {
  constructor(
    private readonly expenseRepo: ExpenseRepository,
    private readonly categoryRepo: ExpenseCategoryRepository,
    private readonly auditRecorder: AuditRecorderPort,
  ) {}

  async execute(input: UpdateExpenseInput): Promise<Result<UpdateExpenseOutput, AppError>> {
    const check = canManageExpenses(input.actorRole);
    if (!check.allowed) return err(ExpenseErrors.notAllowed());

    if (input.amount !== undefined && input.amount <= 0) return err(ExpenseErrors.invalidAmount());

    // Reject future-dated expenses (compare in IST)
    if (input.date !== undefined) {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const todayIST = new Date(now.getTime() + istOffset).toISOString().slice(0, 10);
      if (input.date > todayIST) return err(ExpenseErrors.invalidDate());
    }

    const expense = await this.expenseRepo.findById(input.expenseId);
    if (!expense || isDeleted(expense.softDelete)) {
      return err(ExpenseErrors.notFound(input.expenseId));
    }

    let categoryId = expense.categoryId;
    let categoryName = expense.categoryName;

    if (input.categoryId && input.categoryId !== expense.categoryId) {
      const category = await this.categoryRepo.findById(input.categoryId);
      if (!category || category.academyId !== expense.academyId) {
        return err(ExpenseErrors.invalidCategory());
      }
      categoryId = category.id.toString();
      categoryName = category.name;
    }

    const updated = expense.update({
      date: input.date,
      categoryId,
      categoryName,
      amount: input.amount,
      notes: input.notes,
    });

    await this.expenseRepo.save(updated);

    await this.auditRecorder.record({
      academyId: updated.academyId,
      actorUserId: input.actorUserId,
      action: 'EXPENSE_UPDATED',
      entityType: 'EXPENSE',
      entityId: updated.id.toString(),
    });

    return ok({
      id: updated.id.toString(),
      categoryId: updated.categoryId,
      categoryName: updated.categoryName,
      date: updated.date,
      amount: updated.amount,
      notes: updated.notes,
    });
  }
}
