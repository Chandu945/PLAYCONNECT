import { randomUUID } from 'crypto';
import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRole } from '@playconnect/contracts';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { ExpenseRepository } from '@domain/expense/ports/expense.repository';
import type { ExpenseCategoryRepository } from '@domain/expense/ports/expense-category.repository';
import { Expense } from '@domain/expense/entities/expense.entity';
import { canManageExpenses } from '@domain/expense/rules/expense.rules';
import { ExpenseErrors } from '@domain/expense/errors/expense.errors';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';

export interface CreateExpenseInput {
  actorUserId: string;
  actorRole: UserRole;
  categoryId: string;
  date: string;
  amount: number;
  notes: string | null;
}

export interface CreateExpenseOutput {
  id: string;
  categoryId: string;
  categoryName: string;
  date: string;
  amount: number;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
}

export class CreateExpenseUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly expenseRepo: ExpenseRepository,
    private readonly categoryRepo: ExpenseCategoryRepository,
    private readonly auditRecorder: AuditRecorderPort,
  ) {}

  async execute(input: CreateExpenseInput): Promise<Result<CreateExpenseOutput, AppError>> {
    const check = canManageExpenses(input.actorRole);
    if (!check.allowed) return err(ExpenseErrors.notAllowed());

    if (input.amount <= 0) return err(ExpenseErrors.invalidAmount());

    // Reject future-dated expenses (compare in IST)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const todayIST = new Date(now.getTime() + istOffset).toISOString().slice(0, 10);
    if (input.date > todayIST) return err(ExpenseErrors.invalidDate());

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(ExpenseErrors.academyRequired());

    const category = await this.categoryRepo.findById(input.categoryId);
    if (!category || category.academyId !== user.academyId) {
      return err(ExpenseErrors.invalidCategory());
    }

    const expense = Expense.create({
      id: randomUUID(),
      academyId: user.academyId,
      date: input.date,
      categoryId: category.id.toString(),
      categoryName: category.name,
      amount: input.amount,
      notes: input.notes,
      createdBy: input.actorUserId,
    });

    await this.expenseRepo.save(expense);

    await this.auditRecorder.record({
      academyId: user.academyId,
      actorUserId: input.actorUserId,
      action: 'EXPENSE_CREATED',
      entityType: 'EXPENSE',
      entityId: expense.id.toString(),
    });

    return ok({
      id: expense.id.toString(),
      categoryId: expense.categoryId,
      categoryName: expense.categoryName,
      date: expense.date,
      amount: expense.amount,
      notes: expense.notes,
      createdBy: expense.createdBy,
      createdAt: expense.audit.createdAt,
    });
  }
}
