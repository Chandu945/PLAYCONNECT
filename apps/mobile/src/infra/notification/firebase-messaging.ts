import { Platform, PermissionsAndroid } from 'react-native';
import type { RemoteNotification, NotificationType } from '../../domain/notification/notification.types';

// Lazy-load Firebase messaging so the app doesn't crash if the native module is missing
function getMessaging() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-firebase/messaging').default;
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const permission = PermissionsAndroid.PERMISSIONS['POST_NOTIFICATIONS'];
      if (!permission) return true;
      const granted = await PermissionsAndroid.request(permission);
      return granted === PermissionsAndroid.RESULTS['GRANTED'];
    }

    const messaging = getMessaging();
    // iOS permission request
    const authStatus = await messaging().requestPermission();
    return (
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

export async function getFcmToken(): Promise<string | null> {
  try {
    const messaging = getMessaging();
    return await messaging().getToken();
  } catch {
    return null;
  }
}

export function onTokenRefresh(handler: (token: string) => void): () => void {
  try {
    const messaging = getMessaging();
    return messaging().onTokenRefresh(handler);
  } catch {
    return () => {};
  }
}

function parseRemoteMessage(remoteMessage: {
  messageId?: string;
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
}): RemoteNotification {
  return {
    messageId: remoteMessage.messageId ?? '',
    title: remoteMessage.notification?.title ?? '',
    body: remoteMessage.notification?.body ?? '',
    type: (remoteMessage.data?.['type'] as NotificationType) ?? 'SYSTEM',
    data: remoteMessage.data,
    receivedAt: new Date().toISOString(),
  };
}

export function onForegroundMessage(
  handler: (notification: RemoteNotification) => void,
): () => void {
  try {
    const messaging = getMessaging();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return messaging().onMessage(async (remoteMessage: any) => {
      handler(parseRemoteMessage(remoteMessage));
    });
  } catch {
    return () => {};
  }
}

export function onNotificationOpenedApp(
  handler: (notification: RemoteNotification) => void,
): () => void {
  try {
    const messaging = getMessaging();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return messaging().onNotificationOpenedApp((remoteMessage: any) => {
      handler(parseRemoteMessage(remoteMessage));
    });
  } catch {
    return () => {};
  }
}

export async function getInitialNotification(): Promise<RemoteNotification | null> {
  try {
    const messaging = getMessaging();
    const remoteMessage = await messaging().getInitialNotification();
    if (!remoteMessage) return null;
    return parseRemoteMessage(remoteMessage);
  } catch {
    return null;
  }
}

export function setBackgroundMessageHandler(): void {
  try {
    const messaging = getMessaging();
    messaging().setBackgroundMessageHandler(async () => {
      // Background messages are handled by the system notification tray.
    });
  } catch {
    // Firebase messaging not available
  }
}
