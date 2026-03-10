import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { AuthUser } from '../../../domain/auth/auth.types';
import type { SubscriptionInfo, TierKey } from '../../../domain/subscription/subscription.types';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Props = {
  visible: boolean;
  user: AuthUser;
  subscription: SubscriptionInfo | null;
  onClose: () => void;
  onViewSubscription: () => void;
  onLogout: () => void;
};

const TIER_LABELS: Record<TierKey, string> = {
  TIER_0_50: 'Starter',
  TIER_51_100: 'Growth',
  TIER_101_PLUS: 'Professional',
};

const TIER_STUDENT_LIMITS: Record<TierKey, string> = {
  TIER_0_50: 'Up to 50 students',
  TIER_51_100: '51-100 students',
  TIER_101_PLUS: '101+ students',
};

function getStatusLabel(status: string): string {
  switch (status) {
    case 'TRIAL': return 'Free Trial';
    case 'ACTIVE_PAID': return 'Active';
    case 'EXPIRED_GRACE': return 'Grace Period';
    case 'BLOCKED': return 'Blocked';
    case 'DISABLED': return 'Disabled';
    default: return status;
  }
}

function getStatusColor(status: string, colors: Colors): string {
  switch (status) {
    case 'TRIAL': return colors.primary;
    case 'ACTIVE_PAID': return colors.success;
    case 'EXPIRED_GRACE': return colors.warning;
    case 'BLOCKED':
    case 'DISABLED': return colors.danger;
    default: return colors.textSecondary;
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function InfoRow({ icon, value }: { icon: string; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.infoRow}>
      {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
      <Icon name={icon} size={18} color={colors.textSecondary} />
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function ProfileModal({
  visible, user, subscription, onClose, onViewSubscription, onLogout,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const initials = getInitials(user.fullName);
  const tierKey = subscription?.currentTierKey;
  const tierLabel = tierKey ? TIER_LABELS[tierKey] : null;
  const tierLimit = tierKey ? TIER_STUDENT_LIMITS[tierKey] : null;
  const renewalDate = subscription?.status === 'TRIAL' ? subscription.trialEndAt : subscription?.paidEndAt;
  const renewalLabel = subscription?.status === 'TRIAL' ? 'Trial ends' : 'Renews on';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} testID="profile-modal-overlay">
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {/* Close */}
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} testID="profile-modal-close">
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Avatar + Name */}
            <View style={styles.profileSection}>
              <View style={styles.avatarLarge}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={styles.profileName}>{user.fullName}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{user.role}</Text>
              </View>
            </View>

            {/* Contact */}
            <View style={styles.card}>
              <InfoRow icon="email-outline" value={user.email} />
              <InfoRow icon="phone-outline" value={user.phoneNumber} />
            </View>

            {/* Subscription */}
            {subscription && (
              <View style={styles.card}>
                <View style={styles.subHeader}>
                  <Text style={styles.cardTitle}>Current Plan</Text>
                  <View style={[styles.statusPill, { backgroundColor: getStatusColor(subscription.status, colors) + '20' }]}>
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(subscription.status, colors) }]} />
                    <Text style={[styles.statusText, { color: getStatusColor(subscription.status, colors) }]}>
                      {getStatusLabel(subscription.status)}
                    </Text>
                  </View>
                </View>

                {tierLabel && (
                  <View style={styles.tierCard}>
                    <View style={styles.tierIcon}>
                      {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                      <Icon name="shield-star-outline" size={22} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={styles.tierName}>{tierLabel}</Text>
                      <Text style={styles.tierLimit}>{tierLimit}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.subStats}>
                  <View style={styles.subStatItem}>
                    <Text style={styles.subStatValue}>{subscription.activeStudentCount}</Text>
                    <Text style={styles.subStatLabel}>Active Students</Text>
                  </View>
                  {renewalDate && (
                    <View style={styles.subStatItem}>
                      <Text style={styles.subStatValue}>{formatDate(renewalDate)}</Text>
                      <Text style={styles.subStatLabel}>{renewalLabel}</Text>
                    </View>
                  )}
                  {subscription.daysRemaining > 0 && (
                    <View style={styles.subStatItem}>
                      <Text style={styles.subStatValue}>{subscription.daysRemaining}</Text>
                      <Text style={styles.subStatLabel}>Days Left</Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.subscriptionBtn}
                  onPress={() => { onClose(); onViewSubscription(); }}
                  testID="view-subscription-btn"
                >
                  <Text style={styles.subscriptionBtnText}>View Subscription Plan</Text>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="chevron-right" size={18} color={colors.white} />
                </TouchableOpacity>
              </View>
            )}

            {/* Logout */}
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={() => { onClose(); onLogout(); }}
              testID="profile-modal-logout"
            >
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="logout" size={18} color={colors.danger} />
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const AVATAR_SIZE = 76;

const makeStyles = (colors: Colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.bg,
    borderRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: '85%',
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: spacing.xs,
  },
  // Profile
  profileSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatarLarge: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
  profileName: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  roleBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  roleBadgeText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  infoValue: {
    fontSize: fontSizes.base,
    color: colors.text,
    flex: 1,
  },
  // Subscription
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  tierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  tierIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierName: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  tierLimit: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  subStats: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  subStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  subStatValue: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  subStatLabel: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  subscriptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  subscriptionBtnText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.white,
  },
  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerBg,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  logoutText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.danger,
  },
});
