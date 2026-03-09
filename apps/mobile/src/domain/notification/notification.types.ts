export type NotificationType =
  | 'FEE_REMINDER'
  | 'PAYMENT_UPDATE'
  | 'ATTENDANCE_ALERT'
  | 'ANNOUNCEMENT'
  | 'SYSTEM';

export type RemoteNotification = {
  messageId: string;
  title: string;
  body: string;
  type: NotificationType;
  data?: Record<string, string>;
  receivedAt: string;
};
