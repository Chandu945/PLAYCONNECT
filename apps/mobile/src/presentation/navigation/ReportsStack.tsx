import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ReportsHomeScreen } from '../screens/owner/ReportsHomeScreen';

export type ReportsStackParamList = {
  ReportsHome: undefined;
};

const Stack = createNativeStackNavigator<ReportsStackParamList>();

export function ReportsStack() {
  return (
    // @ts-expect-error @types/react version mismatch in monorepo
    <Stack.Navigator>
      <Stack.Screen
        name="ReportsHome"
        component={ReportsHomeScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
