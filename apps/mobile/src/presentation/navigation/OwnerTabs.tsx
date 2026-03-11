import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { DashboardScreen } from '../screens/owner/DashboardScreen';
import { DashboardHeaderLeft, DashboardHeaderRight } from '../components/dashboard/DashboardNavHeader';
import { StudentsStack } from './StudentsStack';
import { AttendanceStack } from './AttendanceStack';
import { FeesStack } from './FeesStack';
import { MoreStack } from './MoreStack';
import { GlobalFAB } from '../components/global/GlobalFAB';
import { FABProvider } from '../context/FABContext';
import { fontSizes, fontWeights } from '../theme';
import type { Colors } from '../theme';
import { useTheme } from '../context/ThemeContext';

const TAB_ICONS: Record<string, string> = {
  Dashboard: 'view-dashboard-outline',
  Students: 'school-outline',
  Attendance: 'calendar-check-outline',
  Fees: 'currency-inr',
  More: 'dots-horizontal',
};

export type OwnerTabParamList = {
  Dashboard: undefined;
  Students: undefined;
  Attendance: undefined;
  Fees: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<OwnerTabParamList>();

function OwnerTabsInner() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      {/* @ts-expect-error @types/react version mismatch in monorepo */}
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: colors.surface, elevation: 0, shadowOpacity: 0, borderBottomWidth: 0 },
          headerTitleStyle: { fontWeight: fontWeights.semibold, fontSize: fontSizes.lg },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textDisabled,
          tabBarShowLabel: true,
          tabBarLabelStyle: { fontSize: 11, fontWeight: fontWeights.medium, marginTop: -2, marginBottom: 2 },
          tabBarStyle: { backgroundColor: colors.surface, borderTopWidth: 0, elevation: 8, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, height: 60, paddingTop: 4 },
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            // @ts-expect-error react-native-vector-icons types incompatible with @types/react@19
            <Icon name={TAB_ICONS[route.name] ?? 'circle'} size={size} color={color} />
          ),
        })}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            headerTitle: () => <DashboardHeaderLeft />,
            headerRight: () => <DashboardHeaderRight />,
            headerTitleAlign: 'left',
          }}
        />
        <Tab.Screen name="Students" component={StudentsStack} options={{ headerShown: false }} />
        <Tab.Screen name="Attendance" component={AttendanceStack} options={{ headerShown: false }} />
        <Tab.Screen name="Fees" component={FeesStack} options={{ headerShown: false }} />
        <Tab.Screen name="More" component={MoreStack} options={{ headerShown: false }} />
      </Tab.Navigator>
      <GlobalFAB />
    </View>
  );
}

export function OwnerTabs() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <FABProvider>
      <OwnerTabsInner />
    </FABProvider>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
});
