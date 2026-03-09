import type { Result } from '../../../domain/common/result';
import type { AppError } from '../../../domain/common/errors';
import type { PushTokenApiPort } from '../ports';
import { Platform } from 'react-native';

export type RegisterPushTokenDeps = {
  pushTokenApi: PushTokenApiPort;
};

export async function registerPushTokenUseCase(
  fcmToken: string,
  deps: RegisterPushTokenDeps,
): Promise<Result<void, AppError>> {
  const platform = Platform.OS; // 'android' | 'ios'
  return deps.pushTokenApi.registerToken(fcmToken, platform);
}
