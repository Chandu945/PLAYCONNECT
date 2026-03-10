import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Screen } from '../../components/ui/Screen';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getAcademyInfoUseCase } from '../../../application/parent/use-cases/get-academy-info.usecase';
import { parentApi } from '../../../infra/parent/parent-api';
import type { AcademyInfo } from '../../../domain/parent/parent.types';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rowStyles = useMemo(() => makeRowStyles(colors), [colors]);
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.iconContainer}>
        {/* @ts-expect-error react-native-vector-icons types */}
        <Icon name={icon} size={20} color={colors.primary} />
      </View>
      <View style={rowStyles.content}>
        <Text style={rowStyles.label}>{label}</Text>
        <Text style={rowStyles.value}>{value}</Text>
      </View>
    </View>
  );
}

const makeRowStyles = (colors: Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  value: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    color: colors.text,
    lineHeight: 22,
  },
});

export function AcademyInfoScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rowStyles = useMemo(() => makeRowStyles(colors), [colors]);
  const [info, setInfo] = useState<AcademyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setError(null);
    const result = await getAcademyInfoUseCase({ parentApi });
    if (!mountedRef.current) return;
    if (result.ok) {
      setInfo(result.value);
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

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading academy info...</Text>
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={styles.center}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="alert-circle-outline" size={48} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  if (!info) return null;

  const fullAddress = [
    info.address.line1,
    info.address.line2,
    info.address.city,
    `${info.address.state} - ${info.address.pincode}`,
    info.address.country,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <Screen>
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerIcon}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="school-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.academyName}>{info.academyName}</Text>
      </View>

      {/* Details */}
      <View style={styles.card}>
        <InfoRow icon="office-building-outline" label="Academy Name" value={info.academyName} />
        <InfoRow icon="map-marker-outline" label="Address" value={fullAddress} />
        <View style={[rowStyles.row, { borderBottomWidth: 0 }]}>
          <View style={rowStyles.iconContainer}>
            {/* @ts-expect-error react-native-vector-icons types */}
            <Icon name="city-variant-outline" size={20} color={colors.primary} />
          </View>
          <View style={rowStyles.content}>
            <Text style={rowStyles.label}>City</Text>
            <Text style={rowStyles.value}>{info.address.city}</Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['2xl'],
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSizes.md,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.base,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
  },
  retryText: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
    fontSize: fontSizes.base,
  },
  headerCard: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  academyName: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.primary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    ...shadows.sm,
  },
});
