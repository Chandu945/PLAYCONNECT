import messaging, { type FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid } from 'react-native';
import type { RemoteNotification, NotificationType } from '../../domain/notification/notification.types';

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const permission = PermissionsAndroid.PERMISSIONS['POST_NOTIFICATIONS'];
    if (!permission) return true; // Older RN typings may not have it
    const granted = await PermissionsAndroid.request(permission);
    return granted === PermissionsAndroid.RESULTS['GRANTED'];
  }

  // iOS permission request
  const authStatus = await messaging().requestPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
}

export async function getFcmToken(): Promise<string | null> {
  try {
    return await messaging().getToken();
  } catch {
    return null;
  }
}

export function onTokenRefresh(handler: (token: string) => void): () => void {
  return messaging().onTokenRefresh(handler);
}

function parseRemoteMessage(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage,
): RemoteNotification {
  return {
    messageId: remoteMessage.messageId ?? '',
    title: remoteMessage.notification?.title ?? '',
    body: remoteMessage.notification?.body ?? '',
    type: (remoteMessage.data?.['type'] as NotificationType) ?? 'SYSTEM',
    data: remoteMessage.data as Record<string, string> | undefined,
    receivedAt: new Date().toISOString(),
  };
}

export function onForegroundMessage(
  handler: (notification: RemoteNotification) => void,
): () => void {
  return messaging().onMessage(async (remoteMessage) => {
    handler(parseRemoteMessage(remoteMessage));
  });
}

export function onNotificationOpenedApp(
  handler: (notification: RemoteNotification) => void,
): () => void {
  return messaging().onNotificationOpenedApp((remoteMessage) => {
    handler(parseRemoteMessage(remoteMessage));
  });
}

export async function getInitialNotification(): Promise<RemoteNotification | null> {
  const remoteMessage = await messaging().getInitialNotification();
  if (!remoteMessage) return null;
  return parseRemoteMessage(remoteMessage);
}

export function setBackgroundMessageHandler(): void {
  messaging().setBackgroundMessageHandler(async (_remoteMessage) => {
    // Background messages are handled by the system notification tray.
    // This handler is required to be registered for background notifications to work.
  });
}
