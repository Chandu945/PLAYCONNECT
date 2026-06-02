import { AppError } from '@shared/kernel';

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
  duplicateEmail: () =>
    AppError.conflict('A student with this email already exists in your academy'),
  duplicatePhone: () =>
    AppError.conflict('A student with this phone number already exists in your academy'),
  feeChangeNotAllowed: () => AppError.forbidden('Only owners can change student fees'),
  statusChangeNotAllowed: () => AppError.forbidden('Only owners can change student status'),
  deleteNotAllowed: () => AppError.forbidden('Only owners can delete students'),
  manageNotAllowed: () => AppError.forbidden('Only owners and staff can manage students'),
  concurrencyConflict: () =>
    AppError.conflict('This student was modified by someone else. Please reload and try again.'),
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
  batchNotInAcademy: () => AppError.forbidden('Batch does not belong to your academy'),
  batchNotFound: (id: string) => AppError.notFound('Batch', id),
  studentNotInBatch: () => AppError.validation('Student is not enrolled in this batch'),
  // BUG-032: rejects attendance writes for dates strictly before the student
  // was assigned to the batch, so the monthly summary (which expects rows
  // only from the enrollment date forward) stays consistent with the write
  // path. Without this guard, coaches could backfill attendance for past
  // dates that the summary then silently ignored — orphan rows on disk.
  dateBeforeEnrollment: (enrolledOn: string) =>
    AppError.validation(`Student was not enrolled in this batch on this date (enrolled ${enrolledOn})`),
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
  notOwnRequest: () => AppError.forbidden('You can only modify your own payment requests'),
  createNotAllowed: () => AppError.forbidden('Only staff can create payment requests'),
  reviewNotAllowed: () => AppError.forbidden('Only owners can approve or reject payment requests'),
  cancelNotAllowed: () => AppError.forbidden('Only staff can cancel payment requests'),
  editNotAllowed: () => AppError.forbidden('Only staff can edit payment requests'),
  invalidNotes: (reason: string) => AppError.validation(reason),
  viewNotAllowed: () => AppError.forbidden('Only owners and staff can view payment requests'),
  rejectionReasonRequired: () => AppError.validation('Rejection reason is required'),
  /**
   * Approving a request for less than the principal due would silently mark
   * the whole fee PAID while collecting less — under-collection. The app has
   * no partial-payment concept, so reject it. Overpayment is fine (the excess
   * is recorded as late fee). Realistic trigger: a stale request created
   * before the fee amount increased.
   */
  amountBelowDue: (paid: number, due: number) =>
    AppError.validation(
      `Payment amount (₹${paid}) is less than the fee due (₹${due}). Partial payments are not supported — collect the full amount.`,
    ),
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
  // BUG-037: rejects attendance writes for dates strictly before the staff
  // member's startDate. Mirrors the per-batch enrollment guard for student
  // attendance (BUG-032). Without this, monthly summaries silently expand
  // back to the start of the month and report an incorrect attendance
  // percentage for staff who joined mid-month.
  dateBeforeStartDate: (startedOn: string) =>
    AppError.validation(`Staff had not joined the academy on this date (started ${startedOn})`),
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
  cooldownActive: () =>
    new AppError('COOLDOWN_ACTIVE', 'Please wait before requesting another code'),
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

export const ReviewErrors = {
  submitNotAllowed: () => AppError.forbidden('Only parents can review the academy'),
  viewNotAllowed: () => AppError.forbidden('Only the academy owner can view reviews'),
  noLinkedAcademy: () => AppError.forbidden('You are not linked to any academy'),
  ownerAcademyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  notFound: () => AppError.notFound('AcademyReview'),
} as const;

export const ParentErrors = {
  inviteNotAllowed: () => AppError.forbidden('Only owners can invite parents'),
  parentNotFound: (id: string) => AppError.notFound('Parent', id),
  linkNotFound: () => AppError.notFound('ParentStudentLink'),
  childNotLinked: () => AppError.forbidden('You are not linked to this student'),
  payNotAllowed: () => AppError.forbidden('Only parents can pay fees online'),
  feeDueNotFound: (id: string) => AppError.notFound('FeeDue', id),
  feeDueAlreadyPaid: () => AppError.conflict('Fee due has already been paid'),
  paymentAlreadyPending: () => AppError.conflict('A payment is already in progress for this fee'),
  paymentProviderUnavailable: () =>
    new AppError(
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'Payment provider is temporarily unavailable. Please try again.',
    ),
  onlinePaymentsDisabled: () =>
    new AppError(
      'FEATURE_DISABLED',
      'Online fee payment is currently unavailable. Please pay at the academy.',
    ),
  guardianEmailRequired: () =>
    AppError.validation('Student guardian email is required to invite a parent'),
  guardianPhoneRequired: () =>
    AppError.validation('Student guardian phone number is required to invite a parent'),
} as const;

export const EnquiryErrors = {
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  notFound: (id: string) => AppError.notFound('Enquiry', id),
  alreadyClosed: () => AppError.validation('This enquiry has already been closed'),
  closedCannotFollowUp: () => AppError.validation('Cannot add follow-up to a closed enquiry'),
  closeNotAllowed: () => AppError.forbidden('Only academy owner can close enquiries'),
  convertNotAllowed: () =>
    AppError.forbidden('Only academy owner can convert enquiries to students'),
  manageNotAllowed: () => AppError.forbidden('Only owners and staff can manage enquiries'),
  concurrencyConflict: () =>
    AppError.conflict('This enquiry was modified by someone else. Please reload and try again.'),
} as const;

export const InstituteInfoErrors = {
  academyRequired: () =>
    new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'),
  viewNotAllowed: () => AppError.forbidden('Only owners can view institute info'),
  updateNotAllowed: () => AppError.forbidden('Only owners can update institute info'),
  invalidIfsc: () =>
    AppError.validation(
      'IFSC code must match format: 4 letters, 0, then 6 alphanumeric characters',
    ),
  invalidAccountNumber: () => AppError.validation('Account number must be 9-18 digits'),
  invalidUpiId: () => AppError.validation('UPI ID must be in format: name@provider'),
  invalidFile: () =>
    AppError.validation('Invalid file. Only JPEG, PNG, and WebP images are allowed (max 5MB)'),
  /** M5 academy-onboarding fix: surfaced when two concurrent owner sessions
   *  saved to the same academy and the second lost the version race. */
  concurrencyConflict: () =>
    AppError.conflict(
      'Academy settings were modified by someone else. Please reload and try again.',
    ),
  /** M4 academy-onboarding fix: hard storage failure on R2. Distinguish
   *  from NETWORK so the client can decide whether retry is sensible. */
  uploadFailed: () => new AppError('UPLOAD_FAILED', 'Failed to upload image. Please try again.'),
  networkUnavailable: () =>
    new AppError('NETWORK', 'Could not reach storage service. Please retry.'),
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
  concurrencyConflict: () =>
    AppError.conflict('This event was modified by someone else. Please reload and try again.'),
} as const;

export const AdminErrors = {
  academyNotFound: (id: string) => AppError.notFound('Academy', id),
  ownerNotFound: (id: string) => AppError.notFound('Owner', id),
  subscriptionNotFound: (academyId: string) =>
    AppError.notFound('Subscription for academy', academyId),
  notSuperAdmin: () => AppError.forbidden('Only super admins can perform this action'),
  invalidDates: () => AppError.validation('paidStartAt must be before paidEndAt'),
  /** M2 admin audit fix: surfaced when two concurrent super-admin sessions
   *  saved to the same subscription and the second lost the version race. */
  concurrencyConflict: () =>
    AppError.conflict(
      'This subscription was modified by another admin. Please reload and try again.',
    ),
} as const;

export const GalleryErrors = {
  eventNotFound: () => AppError.notFound('Event'),
  photoNotFound: () => AppError.notFound('Gallery photo'),
  notAllowed: () => AppError.forbidden('You do not have permission for this gallery action'),
  uploadFailed: () => new AppError('UPLOAD_FAILED', 'Failed to upload photo. Please try again.'),
  maxPhotosReached: (max = 50) =>
    AppError.validation(`Maximum number of photos (${max}) reached for this event`),
} as const;
