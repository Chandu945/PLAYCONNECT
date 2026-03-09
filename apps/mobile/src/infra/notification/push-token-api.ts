import type { PushTokenApiPort } from '../../application/notification/ports';
import type { Result } from '../../domain/common/result';
import type { AppError } from '../../domain/common/errors';
import { apiPost } from '../http/api-client';

export const pushTokenApi: PushTokenApiPort = {
  registerToken(fcmToken: string, platform: string): Promise<Result<void, AppError>> {
    return apiPost<void>('/api/v1/device-tokens', { fcmToken, platform });
  },

  unregisterToken(fcmToken: string): Promise<Result<void, AppError>> {
    return apiPost<void>('/api/v1/device-tokens/unregister', { fcmToken });
  },
};
