import { AppError } from '@shared/kernel';

export const ExpenseErrors = {
  notAllowed: () => AppError.forbidden('Only owners can manage expenses'),
  notFound: (id?: string) => AppError.notFound('Expense', id),
  invalidAmount: () => AppError.validation('Amount must be greater than zero'),
  invalidDate: () => AppError.validation('Expense date cannot be in the future'),
  invalidCategory: () => AppError.validation('Selected category does not exist'),
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  notInAcademy: () => AppError.forbidden('Expense does not belong to your academy'),
  duplicateCategory: () => AppError.conflict('A category with this name already exists'),
  categoryInUse: () =>
    AppError.conflict('Cannot delete category that has expenses. Delete or reassign expenses first.'),
  categoryNotFound: (id?: string) => AppError.notFound('Expense category', id),
  invalidCategoryName: () => AppError.validation('Category name is required (1-50 characters)'),
} as const;
