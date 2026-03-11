import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AttendanceScreen } from '../screens/common/AttendanceScreen';
import { AttendanceDailyReportScreen } from '../screens/common/AttendanceDailyReportScreen';
import { AttendanceMonthlySummaryScreen } from '../screens/common/AttendanceMonthlySummaryScreen';
import { StudentMonthlyAttendanceScreen } from '../screens/common/StudentMonthlyAttendanceScreen';

export type AttendanceStackParamList = {
  AttendanceMain: undefined;
  DailyReport: { date: string };
  MonthlySummary: { month: string };
  StudentMonthlyAttendance: { studentId: string; fullName: string; month: string };
};

const Stack = createNativeStackNavigator<AttendanceStackParamList>();

export function AttendanceStack() {
  return (
    // @ts-expect-error @types/react version mismatch in monorepo
    <Stack.Navigator>
      <Stack.Screen
        name="AttendanceMain"
        component={AttendanceScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DailyReport"
        component={AttendanceDailyReportScreen}
        options={{ title: 'Daily Report' }}
      />
      <Stack.Screen
        name="MonthlySummary"
        component={AttendanceMonthlySummaryScreen}
        options={{ title: 'Monthly Summary' }}
      />
      <Stack.Screen
        name="StudentMonthlyAttendance"
        component={StudentMonthlyAttendanceScreen}
        options={({ route }) => ({
          title: route.params.fullName,
        })}
      />
    </Stack.Navigator>
  );
}
