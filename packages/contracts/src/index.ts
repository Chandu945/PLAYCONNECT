// HTTP contracts
export type { ApiSuccess, ApiError, ApiResponse, ValidationErrorDetail } from './http/api-envelope';
export type { PageMeta, Paginated } from './http/pagination';

// Role constants
export type { UserRole } from './constants/roles';
export { USER_ROLES } from './constants/roles';

// Subscription constants
export type { SubscriptionStatus, TierKey } from './constants/subscription';
export {
  SUBSCRIPTION_STATUSES,
  TRIAL_DURATION_DAYS,
  TIER_KEYS,
  TIER_PRICING_INR,
  TIER_RANGES,
} from './constants/subscription';

// Attendance constants
export type { StudentAttendanceStatus, StaffAttendanceStatus } from './constants/attendance';
export { STUDENT_ATTENDANCE_STATUSES, STAFF_ATTENDANCE_STATUSES } from './constants/attendance';

// Status constants
export type { StudentStatus, StaffStatus } from './constants/status';
export { STUDENT_STATUSES, STAFF_STATUSES } from './constants/status';

// Weekday constants
export type { Weekday } from './constants/weekdays';
export { WEEKDAYS } from './constants/weekdays';

// Student model
export type { Gender } from './models/student';
export { GENDERS } from './models/student';

// Date types
export type { LocalDate, MonthKey } from './types/dates';

// Fee due constants
export type { FeeDueStatus, PaidSource, PaymentLabel, LateFeeRepeatInterval, LateFeeConfig } from './constants/fee-due';
export {
  FEE_DUE_STATUSES,
  DEFAULT_DUE_DATE_DAY,
  DEFAULT_RECEIPT_PREFIX,
  CONVENIENCE_FEE_RATE,
  computeConvenienceFee,
  DEFAULT_LATE_FEE_ENABLED,
  DEFAULT_GRACE_PERIOD_DAYS,
  DEFAULT_LATE_FEE_AMOUNT_INR,
  DEFAULT_LATE_FEE_REPEAT_INTERVAL_DAYS,
  ALLOWED_REPEAT_INTERVALS,
  computeLateFee,
} from './constants/fee-due';

// Fee filter constants
export type { FeeFilter } from './constants/fee-filter';
export { FEE_FILTERS } from './constants/fee-filter';

// Payment request constants
export type { PaymentRequestStatus } from './constants/payment-request';
export { PAYMENT_REQUEST_STATUSES } from './constants/payment-request';

// Notification models
export type { FeeReminderRunSummary } from './models/notifications';

// Staff attendance models
export type { StaffAttendanceViewStatus } from './models/staff-attendance';

// Audit models
export type { AuditActionType, AuditEntityType } from './models/audit';
export { AUDIT_ACTION_TYPES, AUDIT_ENTITY_TYPES } from './models/audit';

// Expense models
export type { ExpenseCategory } from './models/expense';
export { EXPENSE_CATEGORIES } from './models/expense';

// Admin models
export type { AdminAcademyStatus } from './models/admin';
export { ADMIN_ACADEMY_STATUSES } from './models/admin';
