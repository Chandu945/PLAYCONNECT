import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import { Screen } from '../../components/ui/Screen';
import { Input } from '../../components/ui/Input';
import { getParentProfileUseCase } from '../../../application/parent/use-cases/get-parent-profile.usecase';
import { updateParentProfileUseCase } from '../../../application/parent/use-cases/update-parent-profile.usecase';
import { parentApi } from '../../../infra/parent/parent-api';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { getInitials } from '../../utils/format';
import { useTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'ParentProfile'>;

export function ParentProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setError(null);
    const result = await getParentProfileUseCase({ parentApi });
    if (!mountedRef.current) return;
    if (result.ok) {
      setFullName(result.value.fullName);
      setEmail(result.value.email);
      setPhoneNumber(result.value.phoneNumber);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const result = await updateParentProfileUseCase(
      { fullName: fullName.trim(), phoneNumber: phoneNumber.trim() },
      { parentApi },
    );
    setSaving(false);
    if (result.ok) {
      Alert.alert('Success', 'Profile updated successfully');
    } else {
      setError(result.error.message);
    }
  }, [fullName, phoneNumber]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Avatar Header */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(fullName || 'P')}</Text>
        </View>
        <Text style={styles.avatarName}>{fullName}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>PARENT</Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="alert-circle-outline" size={16} color={colors.dangerText} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Form */}
      <View style={styles.formCard}>
        <Input
          label="Full Name"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          testID="profile-fullname"
        />

        <Input
          label="Email"
          value={email}
          onChangeText={() => {}}
          keyboardType="email-address"
          testID="profile-email"
        />
        <View style={styles.readOnlyRow}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="lock-outline" size={12} color={colors.textDisabled} />
          <Text style={styles.readOnlyHint}>Email cannot be changed</Text>
        </View>

        <Input
          label="Phone Number"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          testID="profile-phone"
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
          testID="profile-save"
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              {/* @ts-expect-error react-native-vector-icons types */}
              <Icon name="content-save-outline" size={18} color={colors.white} />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Change Password */}
      <TouchableOpacity
        style={styles.changePasswordButton}
        onPress={() => navigation.navigate('ChangePassword')}
        testID="profile-change-password"
      >
        <View style={styles.cpIconContainer}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="key-outline" size={20} color={colors.primary} />
        </View>
        <Text style={styles.changePasswordText}>Change Password</Text>
        {/* @ts-expect-error react-native-vector-icons types */}
        <Icon name="chevron-right" size={20} color={colors.textDisabled} />
      </TouchableOpacity>
    </Screen>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.md,
  },
  avatarText: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
  avatarName: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  roleBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  roleText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.base,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  errorText: {
    color: colors.dangerText,
    fontSize: fontSizes.sm,
    flex: 1,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    ...shadows.sm,
    marginBottom: spacing.base,
  },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: -spacing.sm,
    marginBottom: spacing.base,
  },
  readOnlyHint: {
    fontSize: fontSizes.xs,
    color: colors.textDisabled,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginTop: spacing.sm,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
  },
  changePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    ...shadows.sm,
  },
  cpIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  changePasswordText: {
    flex: 1,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.medium,
    color: colors.text,
  },
});
