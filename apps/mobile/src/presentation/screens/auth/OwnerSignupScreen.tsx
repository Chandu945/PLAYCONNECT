import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { AuthStackParamList } from '../../navigation/AuthStack';
import { useAuth } from '../../context/AuthContext';
import { Screen } from '../../components/ui/Screen';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { InlineError } from '../../components/ui/InlineError';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';

type SignupNav = NativeStackNavigationProp<AuthStackParamList, 'OwnerSignup'>;

const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OwnerSignupScreen() {
  const navigation = useNavigation<SignupNav>();
  const { signup } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors['fullName'] = 'Full name is required';
    if (!email.trim()) errors['email'] = 'Email is required';
    else if (!EMAIL_REGEX.test(email.trim())) errors['email'] = 'Invalid email format';
    if (!phoneNumber.trim()) errors['phoneNumber'] = 'Phone number is required';
    else if (!E164_REGEX.test(phoneNumber.trim()))
      errors['phoneNumber'] = 'Phone must be in E.164 format (e.g. +919876543210)';
    if (!password) errors['password'] = 'Password is required';
    else if (password.length < 8)
      errors['password'] = 'Password must be at least 8 characters';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [fullName, email, phoneNumber, password]);

  const handleSignup = useCallback(async () => {
    setError(null);
    if (!validate()) return;

    setLoading(true);
    const err = await signup({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phoneNumber: phoneNumber.trim(),
      password,
    });
    setLoading(false);

    if (err) {
      setError(err.message);
    }
  }, [fullName, email, phoneNumber, password, signup, validate]);

  return (
    <Screen style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.headerSection}>
            <View style={styles.iconBadge}>
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="account-plus-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Set up your academy in minutes</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {error ? <InlineError message={error} /> : null}

            <Input
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              error={fieldErrors['fullName']}
              placeholder="Enter your full name"
              autoCapitalize="words"
              testID="signup-name"
            />

            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={fieldErrors['email']}
              placeholder="you@example.com"
              keyboardType="email-address"
              testID="signup-email"
            />

            <Input
              label="Phone Number"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              error={fieldErrors['phoneNumber']}
              placeholder="+919876543210"
              keyboardType="phone-pad"
              testID="signup-phone"
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              error={fieldErrors['password']}
              placeholder="Min 8 characters"
              secureTextEntry
              testID="signup-password"
            />

            <Button
              title="Create Account"
              onPress={handleSignup}
              loading={loading}
              testID="signup-submit"
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              testID="goto-login"
            >
              <Text style={styles.footerLink}> Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadows.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing['2xl'],
  },
  footerText: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  footerLink: {
    fontSize: fontSizes.base,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
});
