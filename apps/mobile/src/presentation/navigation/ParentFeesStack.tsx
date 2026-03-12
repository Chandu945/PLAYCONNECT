import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChildDetailScreen } from '../screens/parent/ChildDetailScreen';
import { FeePaymentScreen } from '../screens/parent/FeePaymentScreen';
import { ReceiptScreen } from '../screens/parent/ReceiptScreen';

export type ParentFeesStackParamList = {
  ParentFeesOverview: { studentId: string; fullName: string };
  FeePayment: { feeDueId: string; monthKey: string; amount: number; lateFee?: number };
  Receipt: { feeDueId: string };
};

const Stack = createNativeStackNavigator<ParentFeesStackParamList>();

export function ParentFeesStack() {
  return (
    // @ts-expect-error @types/react version mismatch in monorepo
    <Stack.Navigator>
      <Stack.Screen
        name="ParentFeesOverview"
        component={ChildDetailScreen}
        options={{ title: 'Fees' }}
      />
      <Stack.Screen
        name="FeePayment"
        component={FeePaymentScreen}
        options={{ title: 'Pay Fee' }}
      />
      <Stack.Screen
        name="Receipt"
        component={ReceiptScreen}
        options={{ title: 'Receipt' }}
      />
    </Stack.Navigator>
  );
}
