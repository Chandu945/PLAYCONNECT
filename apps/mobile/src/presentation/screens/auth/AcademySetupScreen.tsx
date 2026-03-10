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
import { useAuth } from '../../context/AuthContext';
import { Screen } from '../../components/ui/Screen';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { InlineError } from '../../components/ui/InlineError';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';

const PINCODE_REGEX = /^\d{6}$/;

export function AcademySetupScreen() {
  const { setupAcademy, logout } = useAuth();

  const [academyName, setAcademyName] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (!academyName.trim()) errors['academyName'] = 'Academy name is required';
    if (!line1.trim()) errors['line1'] = 'Address line 1 is required';
    if (!city.trim()) errors['city'] = 'City is required';
    if (!state.trim()) errors['state'] = 'State is required';
    if (!pincode.trim()) errors['pincode'] = 'Pincode is required';
    else if (!PINCODE_REGEX.test(pincode.trim())) errors['pincode'] = 'Pincode must be 6 digits';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [academyName, line1, city, state, pincode]);

  const handleSetup = useCallback(async () => {
    setError(null);
    if (!validate()) return;

    setLoading(true);
    const err = await setupAcademy({
      academyName: academyName.trim(),
      address: {
        line1: line1.trim(),
        line2: line2.trim() || undefined,
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        country: 'India',
      },
    });
    setLoading(false);

    if (err) {
      setError(err.message);
    }
  }, [academyName, line1, line2, city, state, pincode, setupAcademy, validate]);

  return (
    <Screen style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.wrapper}>
          {/* Header */}
          <View style={styles.headerSection}>
            <View style={styles.iconBadge}>
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="domain" size={28} color={colors.primary} />
            </View>
            <Text style={styles.title}>Set Up Your Academy</Text>
            <Text style={styles.subtitle}>
              Almost there! Tell us about your academy to get started.
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {error ? <InlineError message={error} /> : null}

            <View style={styles.sectionLabel}>
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="school-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.sectionLabelText}>Academy Details</Text>
            </View>

            <Input
              label="Academy Name"
              value={academyName}
              onChangeText={setAcademyName}
              error={fieldErrors['academyName']}
              placeholder="e.g. Sunrise Dance Academy"
              autoCapitalize="words"
              testID="setup-name"
            />

            <View style={styles.divider} />

            <View style={styles.sectionLabel}>
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="map-marker-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.sectionLabelText}>Address</Text>
            </View>

            <Input
              label="Address Line 1"
              value={line1}
              onChangeText={setLine1}
              error={fieldErrors['line1']}
              placeholder="Street address"
              testID="setup-line1"
            />

            <Input
              label="Address Line 2 (Optional)"
              value={line2}
              onChangeText={setLine2}
              placeholder="Floor, suite, etc."
              testID="setup-line2"
            />

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Input
                  label="City"
                  value={city}
                  onChangeText={setCity}
                  error={fieldErrors['city']}
                  placeholder="City"
                  autoCapitalize="words"
                  testID="setup-city"
                />
              </View>
              <View style={styles.halfField}>
                <Input
                  label="State"
                  value={state}
                  onChangeText={setStateName}
                  error={fieldErrors['state']}
                  placeholder="State"
                  autoCapitalize="words"
                  testID="setup-state"
                />
              </View>
            </View>

            <Input
              label="Pincode"
              value={pincode}
              onChangeText={setPincode}
              error={fieldErrors['pincode']}
              placeholder="6-digit pincode"
              keyboardType="number-pad"
              testID="setup-pincode"
            />

            <Button
              title="Complete Setup"
              onPress={handleSetup}
              loading={loading}
              testID="setup-submit"
            />
          </View>

          {/* Sign out link */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={logout} testID="setup-logout">
              <View style={styles.logoutRow}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="logout" size={16} color={colors.textSecondary} />
                <Text style={styles.logoutText}>Sign Out</Text>
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
  wrapper: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
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
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionLabelText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.base,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfField: {
    flex: 1,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing['2xl'],
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  logoutText: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
});
