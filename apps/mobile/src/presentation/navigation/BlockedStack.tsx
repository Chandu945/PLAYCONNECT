import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SubscriptionScreen } from '../screens/subscription/SubscriptionScreen';

export type BlockedStackParamList = {
  SubscriptionBlocked: undefined;
};

const Stack = createNativeStackNavigator<BlockedStackParamList>();

export function BlockedStack() {
  return (
    // @ts-expect-error @types/react version mismatch in monorepo
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SubscriptionBlocked" component={SubscriptionScreen} />
    </Stack.Navigator>
  );
}
