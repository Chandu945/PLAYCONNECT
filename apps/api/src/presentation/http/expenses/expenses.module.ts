import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExpensesController } from './expenses.controller';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { AuthModule } from '../auth/auth.module';
import { AcademyOnboardingModule } from '../academy-onboarding/academy-onboarding.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ExpenseModel, ExpenseSchema } from '@infrastructure/database/schemas/expense.schema';
import {
  ExpenseCategoryModel,
  ExpenseCategorySchema,
} from '@infrastructure/database/schemas/expense-category.schema';
import { MongoExpenseRepository } from '@infrastructure/repositories/mongo-expense.repository';
import { MongoExpenseCategoryRepository } from '@infrastructure/repositories/mongo-expense-category.repository';
import { EXPENSE_REPOSITORY } from '@domain/expense/ports/expense.repository';
import { EXPENSE_CATEGORY_REPOSITORY } from '@domain/expense/ports/expense-category.repository';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { AUDIT_RECORDER_PORT } from '@application/audit/ports/audit-recorder.port';
import { CreateExpenseUseCase } from '@application/expense/use-cases/create-expense.usecase';
import { UpdateExpenseUseCase } from '@application/expense/use-cases/update-expense.usecase';
import { DeleteExpenseUseCase } from '@application/expense/use-cases/delete-expense.usecase';
import { ListExpensesUseCase } from '@application/expense/use-cases/list-expenses.usecase';
import { GetExpenseSummaryUseCase } from '@application/expense/use-cases/get-expense-summary.usecase';
import { CreateCategoryUseCase } from '@application/expense/use-cases/create-category.usecase';
import { ListCategoriesUseCase } from '@application/expense/use-cases/list-categories.usecase';
import { DeleteCategoryUseCase } from '@application/expense/use-cases/delete-category.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { ExpenseRepository } from '@domain/expense/ports/expense.repository';
import type { ExpenseCategoryRepository } from '@domain/expense/ports/expense-category.repository';
import type { AuditRecorderPort } from '@application/audit/ports/audit-recorder.port';

@Module({
  imports: [
    AuthModule,
    AcademyOnboardingModule,
    SubscriptionModule,
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: ExpenseModel.name, schema: ExpenseSchema },
      { name: ExpenseCategoryModel.name, schema: ExpenseCategorySchema },
    ]),
  ],
  controllers: [ExpensesController, ExpenseCategoriesController],
  providers: [
    { provide: EXPENSE_REPOSITORY, useClass: MongoExpenseRepository },
    { provide: EXPENSE_CATEGORY_REPOSITORY, useClass: MongoExpenseCategoryRepository },
    {
      provide: 'CREATE_EXPENSE_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        expenseRepo: ExpenseRepository,
        categoryRepo: ExpenseCategoryRepository,
        auditRecorder: AuditRecorderPort,
      ) => new CreateExpenseUseCase(userRepo, expenseRepo, categoryRepo, auditRecorder),
      inject: [USER_REPOSITORY, EXPENSE_REPOSITORY, EXPENSE_CATEGORY_REPOSITORY, AUDIT_RECORDER_PORT],
    },
    {
      provide: 'UPDATE_EXPENSE_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        expenseRepo: ExpenseRepository,
        categoryRepo: ExpenseCategoryRepository,
        auditRecorder: AuditRecorderPort,
      ) => new UpdateExpenseUseCase(userRepo, expenseRepo, categoryRepo, auditRecorder),
      inject: [USER_REPOSITORY, EXPENSE_REPOSITORY, EXPENSE_CATEGORY_REPOSITORY, AUDIT_RECORDER_PORT],
    },
    {
      provide: 'DELETE_EXPENSE_USE_CASE',
      useFactory: (userRepo: UserRepository, expenseRepo: ExpenseRepository, auditRecorder: AuditRecorderPort) =>
        new DeleteExpenseUseCase(userRepo, expenseRepo, auditRecorder),
      inject: [USER_REPOSITORY, EXPENSE_REPOSITORY, AUDIT_RECORDER_PORT],
    },
    {
      provide: 'LIST_EXPENSES_USE_CASE',
      useFactory: (userRepo: UserRepository, expenseRepo: ExpenseRepository) =>
        new ListExpensesUseCase(userRepo, expenseRepo),
      inject: [USER_REPOSITORY, EXPENSE_REPOSITORY],
    },
    {
      provide: 'GET_EXPENSE_SUMMARY_USE_CASE',
      useFactory: (userRepo: UserRepository, expenseRepo: ExpenseRepository) =>
        new GetExpenseSummaryUseCase(userRepo, expenseRepo),
      inject: [USER_REPOSITORY, EXPENSE_REPOSITORY],
    },
    {
      provide: 'CREATE_CATEGORY_USE_CASE',
      useFactory: (userRepo: UserRepository, categoryRepo: ExpenseCategoryRepository) =>
        new CreateCategoryUseCase(userRepo, categoryRepo),
      inject: [USER_REPOSITORY, EXPENSE_CATEGORY_REPOSITORY],
    },
    {
      provide: 'LIST_CATEGORIES_USE_CASE',
      useFactory: (userRepo: UserRepository, categoryRepo: ExpenseCategoryRepository) =>
        new ListCategoriesUseCase(userRepo, categoryRepo),
      inject: [USER_REPOSITORY, EXPENSE_CATEGORY_REPOSITORY],
    },
    {
      provide: 'DELETE_CATEGORY_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        categoryRepo: ExpenseCategoryRepository,
        expenseRepo: ExpenseRepository,
      ) => new DeleteCategoryUseCase(userRepo, categoryRepo, expenseRepo),
      inject: [USER_REPOSITORY, EXPENSE_CATEGORY_REPOSITORY, EXPENSE_REPOSITORY],
    },
  ],
  exports: [EXPENSE_REPOSITORY],
})
export class ExpensesModule {}
