import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StudentsStack } from './StudentsStack';
import { AttendanceStack } from './AttendanceStack';
import { FeesStack } from './FeesStack';
import { MoreStack } from './MoreStack';
import { GlobalFAB } from '../components/global/GlobalFAB';
import { FABProvider } from '../context/FABContext';
import { colors, fontSizes, fontWeights } from '../theme';

const TAB_ICONS: Record<string, string> = {
  Students: 'school-outline',
  Attendance: 'calendar-check-outline',
  Fees: 'currency-inr',
  More: 'dots-horizontal',
};

export type StaffTabParamList = {
  Students: undefined;
  Attendance: undefined;
  Fees: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<StaffTabParamList>();

function StaffTabsInner() {
  return (
    <View style={styles.container}>
      {/* @ts-expect-error React Navigation 6 types incompatible with @types/react@19 hoisted in monorepo */}
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { fontWeight: fontWeights.semibold, fontSize: fontSizes.lg },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textDisabled,
          tabBarShowLabel: false,
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            // @ts-expect-error react-native-vector-icons types incompatible with @types/react@19
            <Icon name={TAB_ICONS[route.name] ?? 'circle'} size={size} color={color} />
          ),
        })}
      >
        <Tab.Screen name="Students" component={StudentsStack} options={{ headerShown: false }} />
        <Tab.Screen name="Attendance" component={AttendanceStack} options={{ headerShown: false }} />
        <Tab.Screen name="Fees" component={FeesStack} options={{ headerShown: false }} />
        <Tab.Screen name="More" component={MoreStack} options={{ headerShown: false }} />
      </Tab.Navigator>
      <GlobalFAB />
    </View>
  );
}

export function StaffTabs() {
  return (
    <FABProvider>
      <StaffTabsInner />
    </FABProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
