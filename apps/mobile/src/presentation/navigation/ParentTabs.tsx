import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ParentHomeStack } from './ParentHomeStack';
import { ParentPaymentsStack } from './ParentPaymentsStack';
import { MoreStack } from './MoreStack';
import { colors, fontSizes, fontWeights } from '../theme';

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  Children: { active: 'account-child', inactive: 'account-child-outline' },
  Payments: { active: 'credit-card', inactive: 'credit-card-outline' },
  More: { active: 'menu', inactive: 'dots-horizontal' },
};

export type ParentTabParamList = {
  Children: undefined;
  Payments: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<ParentTabParamList>();

export function ParentTabs() {
  return (
    // @ts-expect-error React Navigation 6 types incompatible with @types/react@19 hoisted in monorepo
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontWeight: fontWeights.semibold, fontSize: fontSizes.lg },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDisabled,
        tabBarShowLabel: false,
        tabBarIcon: ({ color, size, focused }: { color: string; size: number; focused: boolean }) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons?.active : icons?.inactive;
          // @ts-expect-error react-native-vector-icons types incompatible with @types/react@19
          return <Icon name={iconName ?? 'circle'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Children" component={ParentHomeStack} options={{ headerShown: false }} />
      <Tab.Screen name="Payments" component={ParentPaymentsStack} options={{ headerShown: false }} />
      <Tab.Screen name="More" component={MoreStack} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
