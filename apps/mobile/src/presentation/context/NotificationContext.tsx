import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import {
  requestNotificationPermission,
  getFcmToken,
  onTokenRefresh,
  onForegroundMessage,
  onNotificationOpenedApp,
  getInitialNotification,
} from '../../infra/notification/firebase-messaging';
import { pushTokenApi } from '../../infra/notification/push-token-api';
import { registerPushTokenUseCase } from '../../application/notification/use-cases/register-push-token.usecase';
import type { RemoteNotification } from '../../domain/notification/notification.types';

type NotificationContextValue = {
  requestPermission: () => Promise<boolean>;
};

const defaultValue: NotificationContextValue = {
  requestPermission: async () => false,
};

const NotificationContext = createContext<NotificationContextValue>(defaultValue);

export function useNotifications(): NotificationContextValue {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { phase, user } = useAuth();
  const registeredTokenRef = useRef<string | null>(null);

  const registerToken = useCallback(async (token: string) => {
    if (registeredTokenRef.current === token) return;
    const result = await registerPushTokenUseCase(token, { pushTokenApi });
    if (result.ok) {
      registeredTokenRef.current = token;
    }
  }, []);

  const handleForegroundNotification = useCallback((notification: RemoteNotification) => {
    // Show an in-app alert for foreground notifications
    Alert.alert(notification.title, notification.body);
  }, []);

  const handleNotificationTap = useCallback((_notification: RemoteNotification) => {
    // Future: navigate to relevant screen based on notification.type / notification.data
  }, []);

  // Register FCM token when user is authenticated
  useEffect(() => {
    if (phase !== 'ready' || !user) {
      registeredTokenRef.current = null;
      return;
    }

    let tokenRefreshUnsubscribe: (() => void) | undefined;

    (async () => {
      const hasPermission = await requestNotificationPermission();
      if (!hasPermission) return;

      const token = await getFcmToken();
      if (token) {
        await registerToken(token);
      }

      // Listen for token refreshes
      tokenRefreshUnsubscribe = onTokenRefresh((newToken) => {
        registerToken(newToken);
      });
    })();

    return () => {
      tokenRefreshUnsubscribe?.();
    };
  }, [phase, user, registerToken]);

  // Listen for foreground notifications
  useEffect(() => {
    if (phase !== 'ready') return;

    const unsubForeground = onForegroundMessage(handleForegroundNotification);
    const unsubOpenedApp = onNotificationOpenedApp(handleNotificationTap);

    // Check if app was opened from a notification (cold start)
    getInitialNotification().then((notification) => {
      if (notification) {
        handleNotificationTap(notification);
      }
    });

    return () => {
      unsubForeground();
      unsubOpenedApp();
    };
  }, [phase, handleForegroundNotification, handleNotificationTap]);

  const doRequestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await requestNotificationPermission();
    if (granted) {
      const token = await getFcmToken();
      if (token) {
        await registerToken(token);
      }
    }
    return granted;
  }, [registerToken]);

  return (
    <NotificationContext.Provider value={{ requestPermission: doRequestPermission }}>
      {children}
    </NotificationContext.Provider>
  );
}
