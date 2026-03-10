import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PaymentHistoryScreen } from '../screens/parent/PaymentHistoryScreen';

export type ParentPaymentsStackParamList = {
  PaymentHistory: undefined;
};

const Stack = createNativeStackNavigator<ParentPaymentsStackParamList>();

export function ParentPaymentsStack() {
  return (
    // @ts-expect-error React Navigation 6 types incompatible with @types/react@19 hoisted in monorepo
    <Stack.Navigator>
      <Stack.Screen
        name="PaymentHistory"
        component={PaymentHistoryScreen}
        options={{ title: 'Payments' }}
      />
    </Stack.Navigator>
  );
}
