import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MoreScreen } from '../screens/settings/MoreScreen';
import { AcademySettingsScreen } from '../screens/settings/AcademySettingsScreen';
import { AuditLogsScreen } from '../screens/owner/AuditLogsScreen';
import { SubscriptionScreen } from '../screens/subscription/SubscriptionScreen';
import { ExpensesHomeScreen } from '../screens/expenses/ExpensesHomeScreen';
import { ExpenseFormScreen } from '../screens/expenses/ExpenseFormScreen';
import { ParentProfileScreen } from '../screens/parent/ParentProfileScreen';
import { ChangePasswordScreen } from '../screens/parent/ChangePasswordScreen';
import { AcademyInfoScreen } from '../screens/parent/AcademyInfoScreen';
import { PaymentHistoryScreen } from '../screens/parent/PaymentHistoryScreen';
import { InstituteInfoScreen } from '../screens/settings/InstituteInfoScreen';
import { EnquiryListScreen } from '../screens/enquiry/EnquiryListScreen';
import { AddEnquiryScreen } from '../screens/enquiry/AddEnquiryScreen';
import { EnquiryDetailScreen } from '../screens/enquiry/EnquiryDetailScreen';
import { EventListScreen } from '../screens/event/EventListScreen';
import { AddEventScreen } from '../screens/event/AddEventScreen';
import { EditEventScreen } from '../screens/event/EditEventScreen';
import { EventDetailScreen } from '../screens/event/EventDetailScreen';
import { BatchesListScreen } from '../screens/batches/BatchesListScreen';
import { BatchFormScreen } from '../screens/batches/BatchFormScreen';
import { BatchDetailScreen } from '../screens/batches/BatchDetailScreen';
import { AddStudentToBatchScreen } from '../screens/batches/AddStudentToBatchScreen';
import { StaffListScreen } from '../screens/owner/StaffListScreen';
import { StaffFormScreen } from '../screens/owner/StaffFormScreen';
import { StaffAttendanceScreen } from '../screens/owner/StaffAttendanceScreen';
import { StaffAttendanceDailyReportScreen } from '../screens/owner/StaffAttendanceDailyReportScreen';
import { StaffAttendanceMonthlySummaryScreen } from '../screens/owner/StaffAttendanceMonthlySummaryScreen';
import { ReportsHomeScreen } from '../screens/owner/ReportsHomeScreen';
import type { ExpenseItem } from '../../domain/expense/expense.types';
import type { EventDetail } from '../../domain/event/event.types';
import type { BatchListItem } from '../../domain/batch/batch.types';
import type { StaffListItem } from '../../domain/staff/staff.types';

export type MoreStackParamList = {
  MoreHome: undefined;
  AcademySettings: undefined;
  ExpensesHome: undefined;
  ExpenseForm: { mode: 'create' } | { mode: 'edit'; expense: ExpenseItem };
  InstituteInfo: undefined;
  EnquiryList: { filter?: string } | undefined;
  AddEnquiry: undefined;
  EnquiryDetail: { enquiryId: string };
  EventList: undefined;
  AddEvent: undefined;
  EditEvent: { event: EventDetail };
  EventDetail: { eventId: string };
  AuditLogs: undefined;
  Subscription: undefined;
  ParentProfile: undefined;
  ChangePassword: undefined;
  AcademyInfo: undefined;
  PaymentHistory: undefined;
  BatchesList: undefined;
  BatchForm: { mode: 'create' | 'edit'; batch?: BatchListItem };
  BatchDetail: { batch: BatchListItem };
  AddStudentToBatch: { batchId: string; existingStudentIds: string[] };
  StaffList: undefined;
  StaffForm: { mode: 'create' | 'edit'; staff?: StaffListItem };
  StaffAttendance: undefined;
  StaffAttendanceDailyReport: { date: string };
  StaffAttendanceMonthlySummary: { month: string };
  ReportsHome: undefined;
};

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStack() {
  return (
    // @ts-expect-error @types/react version mismatch in monorepo
    <Stack.Navigator>
      <Stack.Screen
        name="MoreHome"
        component={MoreScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AcademySettings"
        component={AcademySettingsScreen}
        options={{ title: 'Academy Settings' }}
      />
      <Stack.Screen
        name="ExpensesHome"
        component={ExpensesHomeScreen}
        options={{ title: 'Expenses' }}
      />
      <Stack.Screen
        name="ExpenseForm"
        component={ExpenseFormScreen}
        options={({ route }) => ({
          title: (route.params as { mode: string }).mode === 'create' ? 'Add Expense' : 'Edit Expense',
        })}
      />
      <Stack.Screen
        name="InstituteInfo"
        component={InstituteInfoScreen}
        options={{ title: 'Institute Information' }}
      />
      <Stack.Screen
        name="EnquiryList"
        component={EnquiryListScreen}
        options={{ title: 'Enquiries' }}
      />
      <Stack.Screen
        name="AddEnquiry"
        component={AddEnquiryScreen}
        options={{ title: 'Add Enquiry' }}
      />
      <Stack.Screen
        name="EnquiryDetail"
        component={EnquiryDetailScreen}
        options={{ title: 'Enquiry Detail' }}
      />
      <Stack.Screen
        name="EventList"
        component={EventListScreen}
        options={{ title: 'Events' }}
      />
      <Stack.Screen
        name="AddEvent"
        component={AddEventScreen}
        options={{ title: 'Add Event' }}
      />
      <Stack.Screen
        name="EditEvent"
        component={EditEventScreen}
        options={{ title: 'Edit Event' }}
      />
      <Stack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ title: 'Event Detail' }}
      />
      <Stack.Screen
        name="AuditLogs"
        component={AuditLogsScreen}
        options={{ title: 'Audit Logs' }}
      />
      <Stack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{ title: 'Subscription' }}
      />
      <Stack.Screen
        name="ParentProfile"
        component={ParentProfileScreen}
        options={{ title: 'My Profile' }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ title: 'Change Password' }}
      />
      <Stack.Screen
        name="AcademyInfo"
        component={AcademyInfoScreen}
        options={{ title: 'Academy Info' }}
      />
      <Stack.Screen
        name="PaymentHistory"
        component={PaymentHistoryScreen}
        options={{ title: 'Payment History' }}
      />
      <Stack.Screen
        name="BatchesList"
        component={BatchesListScreen}
        options={{ title: 'Batches' }}
      />
      <Stack.Screen
        name="BatchForm"
        component={BatchFormScreen}
        options={({ route }) => ({
          title: route.params.mode === 'create' ? 'Add Batch' : 'Edit Batch',
        })}
      />
      <Stack.Screen
        name="BatchDetail"
        component={BatchDetailScreen}
        options={{ title: 'Batch Details' }}
      />
      <Stack.Screen
        name="AddStudentToBatch"
        component={AddStudentToBatchScreen}
        options={{ title: 'Add Student' }}
      />
      <Stack.Screen
        name="StaffList"
        component={StaffListScreen}
        options={{ title: 'Staff' }}
      />
      <Stack.Screen
        name="StaffForm"
        component={StaffFormScreen}
        options={({ route }) => ({
          title: route.params.mode === 'create' ? 'Add Staff' : 'Edit Staff',
        })}
      />
      <Stack.Screen
        name="StaffAttendance"
        component={StaffAttendanceScreen}
        options={{ title: 'Staff Attendance' }}
      />
      <Stack.Screen
        name="StaffAttendanceDailyReport"
        component={StaffAttendanceDailyReportScreen}
        options={{ title: 'Staff Daily Report' }}
      />
      <Stack.Screen
        name="StaffAttendanceMonthlySummary"
        component={StaffAttendanceMonthlySummaryScreen}
        options={{ title: 'Staff Monthly Summary' }}
      />
      <Stack.Screen
        name="ReportsHome"
        component={ReportsHomeScreen}
        options={{ title: 'Reports' }}
      />
    </Stack.Navigator>
  );
}
