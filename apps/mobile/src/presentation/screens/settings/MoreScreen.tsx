import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import { useAuth } from '../../context/AuthContext';
import { Screen } from '../../components/ui/Screen';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MoreHome'>;

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

type MenuItem = {
  key: string;
  icon: string;
  label: string;
  screen: keyof MoreStackParamList;
  ownerOnly?: boolean;
  staffVisible?: boolean;
  parentOnly?: boolean;
};

const OWNER_STAFF_ITEMS: MenuItem[] = [
  { key: 'batches', icon: 'account-group-outline', label: 'Batches', screen: 'BatchesList' },
  { key: 'staff', icon: 'account-tie-outline', label: 'Staff', screen: 'StaffList', ownerOnly: true },
  { key: 'staff-attendance', icon: 'calendar-account-outline', label: 'Staff Attendance', screen: 'StaffAttendance', ownerOnly: true },
  { key: 'reports', icon: 'chart-bar', label: 'Reports', screen: 'ReportsHome', ownerOnly: true },
  { key: 'expenses', icon: 'calculator-variant-outline', label: 'Expenses', screen: 'ExpensesHome', ownerOnly: true },
  { key: 'enquiries', icon: 'account-question-outline', label: 'Enquiries', screen: 'EnquiryList' },
  { key: 'events', icon: 'calendar-plus', label: 'Events', screen: 'EventList' },
  { key: 'academy-settings', icon: 'cog-outline', label: 'Academy Settings', screen: 'AcademySettings' },
  { key: 'institute-info', icon: 'office-building-outline', label: 'Institute Information', screen: 'InstituteInfo', ownerOnly: true },
  { key: 'subscription', icon: 'card-account-details-outline', label: 'Subscription', screen: 'Subscription' },
  { key: 'audit-logs', icon: 'clipboard-text-clock-outline', label: 'Audit Logs', screen: 'AuditLogs', ownerOnly: true },
];

const PARENT_ITEMS: MenuItem[] = [
  { key: 'parent-profile', icon: 'account-outline', label: 'My Profile', screen: 'ParentProfile', parentOnly: true },
  { key: 'academy-info', icon: 'school-outline', label: 'Academy Info', screen: 'AcademyInfo', parentOnly: true },
];

export function MoreScreen() {
  const navigation = useNavigation<Nav>();
  const { logout, user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const isParent = user?.role === 'PARENT';

  const menuItems = isParent
    ? PARENT_ITEMS
    : OWNER_STAFF_ITEMS.filter((item) => !item.ownerOnly || isOwner);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title} testID="more-title">
          More
        </Text>

        {/* Profile Card */}
        {user && (
          <View style={styles.profileCard} testID="profile-card">
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{getInitials(user.fullName)}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>{user.fullName}</Text>
              <View style={styles.profileRoleBadge}>
                <Text style={styles.profileRoleBadgeText}>{user.role}</Text>
              </View>
              <View style={styles.profileContactRow}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="email-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.profileContactText} numberOfLines={1}>{user.email}</Text>
              </View>
              <View style={styles.profileContactRow}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="phone-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.profileContactText}>{user.phoneNumber}</Text>
              </View>
            </View>
          </View>
        )}

        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.menuItem}
            onPress={() => navigation.navigate(item.screen as any)}
            testID={`menu-${item.key}`}
          >
            <View style={styles.iconContainer}>
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name={item.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
            {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
            <Icon name="chevron-right" size={20} color={colors.textDisabled} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.menuItem, styles.logoutItem]}
          onPress={logout}
          testID="more-logout"
        >
          <View style={styles.iconContainer}>
            {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
            <Icon name="logout" size={22} color={colors.danger} />
          </View>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xl,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.base,
  },
  profileAvatarText: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  profileRoleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  profileRoleBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  profileContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  profileContactText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuLabel: {
    flex: 1,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.medium,
    color: colors.text,
  },
  logoutItem: {
    marginTop: spacing.base,
  },
  logoutText: {
    flex: 1,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.danger,
  },
});
