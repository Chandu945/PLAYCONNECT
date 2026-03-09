import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './presentation/context/AuthContext';
import { NotificationProvider } from './presentation/context/NotificationContext';
import { RootNavigator } from './presentation/navigation/RootNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NotificationProvider>
            {/* @ts-expect-error React Navigation 6 types incompatible with @types/react@19 hoisted in monorepo */}
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </NotificationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
