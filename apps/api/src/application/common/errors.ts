import { AppError } from '@shared/kernel';

export const SubscriptionErrors = {
  academySetupRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  subscriptionBlocked: (status: string) =>
    new AppError(
      'SUBSCRIPTION_BLOCKED',
      'Subscription inactive. Access limited to subscription management.',
      {
        status,
      },
    ),
} as const;

export const StaffErrors = {
  notFound: (id: string) => AppError.notFound('Staff', id),
  notStaff: () => AppError.notFound('Staff'),
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  notInAcademy: () => AppError.forbidden('Staff does not belong to your academy'),
} as const;

export const BatchErrors = {
  notFound: (id: string) => AppError.notFound('Batch', id),
  nameAlreadyExists: () =>
    AppError.conflict('A batch with this name already exists in the academy'),
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  notInAcademy: () => AppError.forbidden('Batch does not belong to your academy'),
  notAllowed: () => AppError.forbidden('Only owners and staff can create or update batches'),
  readNotAllowed: () => AppError.forbidden('Only owners and staff can view batches'),
  deleteNotAllowed: () => AppError.forbidden('Only owners can delete batches'),
  notActive: (id: string) => AppError.validation(`Batch '${id}' is not active`),
  capacityFull: () => AppError.conflict('Batch has reached maximum student capacity'),
} as const;

export const StudentErrors = {
  notFound: (id: string) => AppError.notFound('Student', id),
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  notInAcademy: () => AppError.forbidden('Student does not belong to your academy'),
  alreadyDeleted: () => AppError.conflict('Student has already been deleted'),
  feeChangeNotAllowed: () => AppError.forbidden('Only owners can change student fees'),
  statusChangeNotAllowed: () => AppError.forbidden('Only owners can change student status'),
  deleteNotAllowed: () => AppError.forbidden('Only owners can delete students'),
  manageNotAllowed: () => AppError.forbidden('Only owners and staff can manage students'),
} as const;

export const AttendanceErrors = {
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  studentNotFound: (id: string) => AppError.notFound('Student', id),
  studentNotInAcademy: () => AppError.forbidden('Student does not belong to your academy'),
  holidayDeclared: () =>
    AppError.conflict('Cannot mark attendance on a holiday. Remove the holiday first.'),
  holidayNotFound: (date: string) => AppError.notFound('Holiday', date),
  markNotAllowed: () => AppError.forbidden('Only owners and staff can mark attendance'),
  viewNotAllowed: () => AppError.forbidden('Only owners and staff can view attendance'),
  holidayDeclareNotAllowed: () => AppError.forbidden('Only owners can declare holidays'),
  holidayRemoveNotAllowed: () => AppError.forbidden('Only owners can remove holidays'),
  studentNotActive: (id: string) => AppError.validation(`Student '${id}' is not active`),
} as const;

export const FeeErrors = {
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  settingsNotAllowed: () => AppError.forbidden('Only owners can update settings'),
  settingsViewNotAllowed: () => AppError.forbidden('Only owners and staff can view settings'),
  dueNotFound: (id: string) => AppError.notFound('FeeDue', id),
  studentNotFound: (id: string) => AppError.notFound('Student', id),
  studentNotInAcademy: () => AppError.forbidden('Student does not belong to your academy'),
  alreadyPaid: () => AppError.conflict('Fee due has already been paid'),
  markPaidNotAllowed: () => AppError.forbidden('Only owners can mark fees as paid'),
  viewNotAllowed: () => AppError.forbidden('Only owners and staff can view fees'),
  invalidMonthKey: () => AppError.validation('Invalid month key format. Expected YYYY-MM'),
  invalidMonthRange: () => AppError.validation('"from" month must not be after "to" month'),
  dashboardNotAllowed: () => AppError.forbidden('Only owners can view the dashboard'),
  reportsNotAllowed: () => AppError.forbidden('Only owners can view reports'),
} as const;

export const PaymentRequestErrors = {
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  dueNotFound: (id: string) => AppError.notFound('FeeDue', id),
  studentNotFound: (id: string) => AppError.notFound('Student', id),
  studentNotInAcademy: () => AppError.forbidden('Student does not belong to your academy'),
  alreadyPaid: () => AppError.conflict('Fee due has already been paid'),
  duplicatePending: () =>
    AppError.conflict('A pending payment request already exists for this fee due'),
  requestNotFound: (id: string) => AppError.notFound('PaymentRequest', id),
  requestNotInAcademy: () => AppError.forbidden('Payment request does not belong to your academy'),
  notPending: () => AppError.conflict('Payment request is not in PENDING status'),
  notOwnRequest: () => AppError.forbidden('You can only cancel your own payment requests'),
  createNotAllowed: () => AppError.forbidden('Only staff can create payment requests'),
  reviewNotAllowed: () => AppError.forbidden('Only owners can approve or reject payment requests'),
  cancelNotAllowed: () => AppError.forbidden('Only staff can cancel payment requests'),
  invalidNotes: (reason: string) => AppError.validation(reason),
  viewNotAllowed: () => AppError.forbidden('Only owners and staff can view payment requests'),
  rejectionReasonRequired: () => AppError.validation('Rejection reason is required'),
} as const;

export const StaffAttendanceErrors = {
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  staffNotFound: (id: string) => AppError.notFound('Staff', id),
  staffNotInAcademy: () => AppError.forbidden('Staff does not belong to your academy'),
  staffNotActive: () => AppError.conflict('Cannot mark attendance for inactive staff'),
  holidayDeclared: () =>
    AppError.conflict('Cannot mark staff attendance on a holiday. Remove the holiday first.'),
  markNotAllowed: () => AppError.forbidden('Only owners can mark staff attendance'),
  viewNotAllowed: () => AppError.forbidden('Only owners can view staff attendance'),
} as const;

export const AuthErrors = {
  duplicateEmail: () => AppError.conflict('A user with this email already exists'),
  duplicatePhone: () => AppError.conflict('A user with this phone number already exists'),
  invalidCredentials: () => AppError.unauthorized('Invalid credentials'),
  inactiveUser: (reason: string) => AppError.forbidden(reason),
  invalidRefreshToken: () => AppError.unauthorized('Invalid or expired refresh token'),
  academyAlreadyExists: () => AppError.conflict('Academy already exists for this owner'),
  notOwner: () => AppError.forbidden('Only owners can perform this action'),
  accountLocked: () =>
    AppError.forbidden('Too many failed login attempts. Please try again after 15 minutes.'),
} as const;

export const PasswordResetErrors = {
  cooldownActive: () => new AppError('COOLDOWN_ACTIVE', 'Please wait before requesting another code'),
  invalidOrExpiredOtp: () => AppError.unauthorized('Invalid or expired verification code'),
  tooManyAttempts: () => AppError.forbidden('Too many failed attempts. Please request a new code.'),
} as const;

export const StudentBatchErrors = {
  studentNotFound: (id: string) => AppError.notFound('Student', id),
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  studentNotInAcademy: () => AppError.forbidden('Student does not belong to your academy'),
  batchNotInAcademy: (id: string) =>
    AppError.validation(`Batch '${id}' does not belong to your academy`),
  manageNotAllowed: () =>
    AppError.forbidden('Only owners and staff can manage student batch assignments'),
  viewNotAllowed: () =>
    AppError.forbidden('Only owners and staff can view student batch assignments'),
} as const;

export const ParentErrors = {
  inviteNotAllowed: () => AppError.forbidden('Only owners can invite parents'),
  parentNotFound: (id: string) => AppError.notFound('Parent', id),
  linkNotFound: () => AppError.notFound('ParentStudentLink'),
  linkAlreadyExists: () => AppError.conflict('Parent is already linked to this student'),
  childNotLinked: () => AppError.forbidden('You are not linked to this student'),
  payNotAllowed: () => AppError.forbidden('Only parents can pay fees online'),
  feeDueNotFound: (id: string) => AppError.notFound('FeeDue', id),
  feeDueAlreadyPaid: () => AppError.conflict('Fee due has already been paid'),
  paymentAlreadyPending: () => AppError.conflict('A payment is already in progress for this fee'),
  paymentProviderUnavailable: () =>
    new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 'Payment provider is temporarily unavailable. Please try again.'),
  guardianEmailRequired: () => AppError.validation('Student guardian email is required to invite a parent'),
  guardianPhoneRequired: () => AppError.validation('Student guardian phone number is required to invite a parent'),
} as const;

export const EnquiryErrors = {
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  notFound: (id: string) => AppError.notFound('Enquiry', id),
  alreadyClosed: () => AppError.validation('This enquiry has already been closed'),
  closedCannotFollowUp: () => AppError.validation('Cannot add follow-up to a closed enquiry'),
  closeNotAllowed: () => AppError.forbidden('Only academy owner can close enquiries'),
  convertNotAllowed: () => AppError.forbidden('Only academy owner can convert enquiries to students'),
  manageNotAllowed: () => AppError.forbidden('Only owners and staff can manage enquiries'),
} as const;

export const InstituteInfoErrors = {
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  viewNotAllowed: () => AppError.forbidden('Only owners can view institute info'),
  updateNotAllowed: () => AppError.forbidden('Only owners can update institute info'),
  invalidIfsc: () => AppError.validation('IFSC code must match format: 4 letters, 0, then 6 alphanumeric characters'),
  invalidAccountNumber: () => AppError.validation('Account number must be 9-18 digits'),
  invalidUpiId: () => AppError.validation('UPI ID must be in format: name@provider'),
  invalidFile: () => AppError.validation('Invalid file. Only JPEG, PNG, and WebP images are allowed (max 5MB)'),
} as const;

export const EventErrors = {
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  notFound: (id: string) => AppError.notFound('Event', id),
  notInAcademy: () => AppError.forbidden('Event does not belong to your academy'),
  manageNotAllowed: () => AppError.forbidden('Only owners and staff can manage events'),
  deleteNotAllowed: () => AppError.forbidden('Only academy owner can delete events'),
  statusChangeNotAllowed: () => AppError.forbidden('Only academy owner can change event status'),
  editNotAllowed: () => AppError.forbidden('You can only edit events you created'),
  invalidDateRange: () => AppError.validation('End date must be on or after start date'),
  invalidTimeRange: () => AppError.validation('End time must be after start time'),
  missingStartTime: () => AppError.validation('Start time is required for non-all-day events'),
  invalidStatusTransition: (from: string, to: string) =>
    AppError.validation(`Cannot change event status from ${from} to ${to}`),
} as const;

export const AdminErrors = {
  academyNotFound: (id: string) => AppError.notFound('Academy', id),
  ownerNotFound: (id: string) => AppError.notFound('Owner', id),
  subscriptionNotFound: (academyId: string) =>
    AppError.notFound('Subscription for academy', academyId),
  notSuperAdmin: () => AppError.forbidden('Only super admins can perform this action'),
  invalidDates: () => AppError.validation('paidStartAt must be before paidEndAt'),
} as const;
