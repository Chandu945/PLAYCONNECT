import type { Result } from '../../domain/common/result';
import type { AppError } from '../../domain/common/errors';

export interface PushTokenApiPort {
  registerToken(fcmToken: string, platform: string): Promise<Result<void, AppError>>;
  unregisterToken(fcmToken: string): Promise<Result<void, AppError>>;
}
