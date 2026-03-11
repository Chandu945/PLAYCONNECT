import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChildrenListScreen } from '../screens/parent/ChildrenListScreen';
import { ChildDetailScreen } from '../screens/parent/ChildDetailScreen';
import { FeePaymentScreen } from '../screens/parent/FeePaymentScreen';
import { ReceiptScreen } from '../screens/parent/ReceiptScreen';

export type ParentHomeStackParamList = {
  ChildrenList: undefined;
  ChildDetail: { studentId: string; fullName: string };
  FeePayment: { feeDueId: string; monthKey: string; amount: number };
  Receipt: { feeDueId: string };
};

const Stack = createNativeStackNavigator<ParentHomeStackParamList>();

export function ParentHomeStack() {
  return (
    // @ts-expect-error @types/react version mismatch in monorepo
    <Stack.Navigator>
      <Stack.Screen
        name="ChildrenList"
        component={ChildrenListScreen}
        options={{ title: 'My Children' }}
      />
      <Stack.Screen
        name="ChildDetail"
        component={ChildDetailScreen}
        options={({ route }) => ({ title: route.params.fullName })}
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
