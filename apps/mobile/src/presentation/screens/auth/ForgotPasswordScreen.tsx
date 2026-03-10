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
import { Screen } from '../../components/ui/Screen';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { InlineError } from '../../components/ui/InlineError';
import { usePasswordReset } from '../../hooks/usePasswordReset';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';

type ForgotNav = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

const STEPS = [
  { key: 'email', label: 'Email' },
  { key: 'otp', label: 'Verify' },
  { key: 'newPassword', label: 'Reset' },
] as const;

function StepIndicator({ current }: { current: string }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <View style={stepStyles.row}>
      {STEPS.map((s, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <View
                style={[stepStyles.line, (isDone || isActive) && stepStyles.lineDone]}
              />
            )}
            <View style={stepStyles.item}>
              <View
                style={[
                  stepStyles.dot,
                  isDone && stepStyles.dotDone,
                  isActive && stepStyles.dotActive,
                ]}
              >
                {isDone ? (
                  // @ts-expect-error react-native-vector-icons types incompatible with @types/react@19
                  <Icon name="check" size={12} color={colors.white} />
                ) : (
                  <Text
                    style={[
                      stepStyles.dotText,
                      isActive && stepStyles.dotTextActive,
                    ]}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  stepStyles.label,
                  (isDone || isActive) && stepStyles.labelActive,
                ]}
              >
                {s.label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  item: {
    alignItems: 'center',
  },
  line: {
    height: 2,
    width: 40,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.lg,
  },
  lineDone: {
    backgroundColor: colors.primary,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgSubtle,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  dotDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dotActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  dotText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
  dotTextActive: {
    color: colors.primary,
  },
  label: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  labelActive: {
    color: colors.primary,
  },
});

export function ForgotPasswordScreen() {
  const navigation = useNavigation<ForgotNav>();
  const {
    step,
    loading,
    error,
    cooldownRemaining,
    successMessage,
    requestOtp,
    confirmReset,
    resendOtp,
    goBack,
    setStep,
  } = usePasswordReset();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validateEmail = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (!email.trim()) errors['email'] = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email.trim())) errors['email'] = 'Invalid email address';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [email]);

  const validateOtp = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (!otp.trim()) errors['otp'] = 'Verification code is required';
    else if (!/^\d{6}$/.test(otp.trim())) errors['otp'] = 'Code must be 6 digits';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [otp]);

  const validatePasswords = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (!newPassword) errors['newPassword'] = 'Password is required';
    else if (newPassword.length < 8)
      errors['newPassword'] = 'Password must be at least 8 characters';
    if (!confirmPassword) errors['confirmPassword'] = 'Please confirm your password';
    else if (newPassword !== confirmPassword)
      errors['confirmPassword'] = 'Passwords do not match';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [newPassword, confirmPassword]);

  const handleRequestOtp = useCallback(async () => {
    if (!validateEmail()) return;
    await requestOtp(email.trim().toLowerCase());
  }, [email, validateEmail, requestOtp]);

  const handleVerifyOtp = useCallback(() => {
    if (!validateOtp()) return;
    setFieldErrors({});
    setStep('newPassword');
  }, [validateOtp, setStep]);

  const handleConfirmReset = useCallback(async () => {
    if (!validatePasswords()) return;
    const success = await confirmReset(email.trim().toLowerCase(), otp.trim(), newPassword);
    if (success) {
      navigation.navigate('Login');
    }
  }, [email, otp, newPassword, validatePasswords, confirmReset, navigation]);

  const handleResend = useCallback(async () => {
    await resendOtp(email.trim().toLowerCase());
  }, [email, resendOtp]);

  const stepConfig = {
    email: {
      icon: 'email-outline' as const,
      title: 'Forgot Password?',
      subtitle: "No worries. Enter your email and we'll send you a reset code.",
    },
    otp: {
      icon: 'shield-key-outline' as const,
      title: 'Verify Code',
      subtitle: `We sent a 6-digit code to ${email}`,
    },
    newPassword: {
      icon: 'lock-reset' as const,
      title: 'Set New Password',
      subtitle: 'Choose a strong password for your account',
    },
  };

  const config = stepConfig[step];

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
              <Icon name={config.icon} size={28} color={colors.primary} />
            </View>
            <Text style={styles.title}>{config.title}</Text>
            <Text style={styles.subtitle}>{config.subtitle}</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <StepIndicator current={step} />

            {error ? <InlineError message={error} /> : null}
            {successMessage ? (
              <View style={styles.successBox}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="check-circle-outline" size={18} color={colors.successText} />
                <Text style={styles.successText}>{successMessage}</Text>
              </View>
            ) : null}

            {step === 'email' && (
              <>
                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  error={fieldErrors['email']}
                  placeholder="Enter your email"
                  keyboardType="email-address"
                  testID="forgot-email"
                />
                <Button
                  title="Send Reset Code"
                  onPress={handleRequestOtp}
                  loading={loading}
                  testID="forgot-send"
                />
              </>
            )}

            {step === 'otp' && (
              <>
                <Input
                  label="Verification Code"
                  value={otp}
                  onChangeText={setOtp}
                  error={fieldErrors['otp']}
                  placeholder="Enter 6-digit code"
                  keyboardType="number-pad"
                  testID="forgot-otp"
                />
                <Button
                  title="Verify Code"
                  onPress={handleVerifyOtp}
                  loading={loading}
                  testID="forgot-verify"
                />
                <TouchableOpacity
                  style={styles.resendLink}
                  onPress={handleResend}
                  disabled={cooldownRemaining > 0}
                  testID="forgot-resend"
                >
                  <Text
                    style={[
                      styles.resendText,
                      cooldownRemaining > 0 && styles.resendDisabled,
                    ]}
                  >
                    {cooldownRemaining > 0
                      ? `Resend code in ${cooldownRemaining}s`
                      : 'Resend code'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'newPassword' && (
              <>
                <Input
                  label="New Password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  error={fieldErrors['newPassword']}
                  placeholder="Enter new password"
                  secureTextEntry
                  testID="forgot-new-password"
                />
                <Input
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  error={fieldErrors['confirmPassword']}
                  placeholder="Confirm new password"
                  secureTextEntry
                  testID="forgot-confirm-password"
                />
                <Button
                  title="Reset Password"
                  onPress={handleConfirmReset}
                  loading={loading}
                  testID="forgot-reset"
                />
              </>
            )}
          </View>

          {/* Back link */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={step === 'email' ? () => navigation.navigate('Login') : goBack}
              testID="forgot-back"
            >
              <View style={styles.backRow}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="arrow-left" size={16} color={colors.primary} />
                <Text style={styles.backText}>
                  {step === 'email' ? 'Back to Sign In' : 'Back'}
                </Text>
              </View>
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
    textAlign: 'center',
    paddingHorizontal: spacing.base,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadows.md,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  successText: {
    fontSize: fontSizes.base,
    color: colors.successText,
    flex: 1,
  },
  resendLink: {
    alignSelf: 'center',
    marginTop: spacing.base,
  },
  resendText: {
    fontSize: fontSizes.sm,
    color: colors.primary,
    fontWeight: fontWeights.medium,
  },
  resendDisabled: {
    color: colors.textDisabled,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing['2xl'],
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  backText: {
    fontSize: fontSizes.base,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
});
