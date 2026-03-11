import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { OwnerSignupScreen } from '../screens/auth/OwnerSignupScreen';
import { AcademySetupScreen } from '../screens/auth/AcademySetupScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';

export type AuthStackParamList = {
  Login: undefined;
  OwnerSignup: undefined;
  AcademySetup: undefined;
  ForgotPassword: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    // @ts-expect-error @types/react version mismatch in monorepo
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="OwnerSignup" component={OwnerSignupScreen} />
      <Stack.Screen name="AcademySetup" component={AcademySetupScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}
