import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FeesHomeScreen } from '../screens/common/FeesHomeScreen';
import { StudentFeeDetailScreen } from '../screens/common/StudentFeeDetailScreen';
import { PaymentRequestFormScreen } from '../screens/staff/PaymentRequestFormScreen';

export type FeesStackParamList = {
  FeesHome: undefined;
  StudentFeeDetail: { studentId: string; studentName: string };
  PaymentRequestForm: {
    studentId: string;
    monthKey: string;
    amount: number;
    requestId?: string;
    existingNotes?: string;
  };
};

const Stack = createNativeStackNavigator<FeesStackParamList>();

export function FeesStack() {
  return (
    // @ts-expect-error @types/react version mismatch in monorepo
    <Stack.Navigator>
      <Stack.Screen name="FeesHome" component={FeesHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="StudentFeeDetail"
        component={StudentFeeDetailScreen}
        options={({ route }) => ({
          title: route.params.studentName,
        })}
      />
      <Stack.Screen
        name="PaymentRequestForm"
        component={PaymentRequestFormScreen}
        options={{ title: 'Create Payment Request' }}
      />
    </Stack.Navigator>
  );
}
