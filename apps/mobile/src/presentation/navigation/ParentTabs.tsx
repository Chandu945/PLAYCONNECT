import React, { useMemo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ParentDashboardScreen } from '../screens/parent/ParentDashboardScreen';
import { ParentHomeStack } from './ParentHomeStack';
import { ParentPaymentsStack } from './ParentPaymentsStack';
import { MoreStack } from './MoreStack';
import { fontSizes, fontWeights } from '../theme';
import type { Colors } from '../theme';
import { useTheme } from '../context/ThemeContext';

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  Dashboard: { active: 'view-dashboard', inactive: 'view-dashboard-outline' },
  Children: { active: 'account-child', inactive: 'account-child-outline' },
  Payments: { active: 'credit-card', inactive: 'credit-card-outline' },
  More: { active: 'menu', inactive: 'dots-horizontal' },
};

export type ParentTabParamList = {
  Dashboard: undefined;
  Children: undefined;
  Payments: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<ParentTabParamList>();

export function ParentTabs() {
  const { colors } = useTheme();
  return (
    // @ts-expect-error @types/react version mismatch in monorepo
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.surface, elevation: 0, shadowOpacity: 0, borderBottomWidth: 0 },
        headerTitleStyle: { fontWeight: fontWeights.semibold, fontSize: fontSizes.lg },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDisabled,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: fontWeights.medium, marginTop: -2, marginBottom: 2 },
        tabBarStyle: { backgroundColor: colors.surface, borderTopWidth: 0, elevation: 8, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, height: 60, paddingTop: 4 },
        tabBarIcon: ({ color, size, focused }: { color: string; size: number; focused: boolean }) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons?.active : icons?.inactive;
          // @ts-expect-error react-native-vector-icons types incompatible with @types/react@19
          return <Icon name={iconName ?? 'circle'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={ParentDashboardScreen}
        options={{ title: 'Dashboard', headerShown: false }}
      />
      <Tab.Screen name="Children" component={ParentHomeStack} options={{ headerShown: false }} />
      <Tab.Screen name="Payments" component={ParentPaymentsStack} options={{ headerShown: false }} />
      <Tab.Screen name="More" component={MoreStack} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
