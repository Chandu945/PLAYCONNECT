import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Linking,
  TouchableOpacity} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../components/ui/AppIcon';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { StudentsStackParamList } from '../../navigation/StudentsStack';
import type { StudentListItem } from '../../../domain/student/student.types';
import { ActivityIndicator } from 'react-native';
import { ProfilePhotoUploader } from '../../components/common/ProfilePhotoUploader';
import { getStudentPhotoUploadPath, getStudent } from '../../../infra/student/student-api';
import { getStudentFees } from '../../../infra/fees/fees-api';
import type { FeeDueItem } from '../../../domain/fees/fees.types';
import { computeOutstandingSummary } from '../../../domain/fees/fee-summary';
import { formatCurrency, formatMonthShort } from '../../utils/format';
import { StudentActionMenu } from '../../components/student/StudentActionMenu';
import { EmptyState } from '../../components/ui/EmptyState';
import { InlineError } from '../../components/ui/InlineError';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { useToast } from '../../context/ToastContext';
import LinearGradient from 'react-native-linear-gradient';
import { spacing, fontSizes, fontWeights, radius, shadows, gradient } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<StudentsStackParamList, 'StudentDetail'>;
type DetailRoute = RouteProp<StudentsStackParamList, 'StudentDetail'>;

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function StatusBadge({ status, colors }: { status: string; colors: Colors }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bgColor =
    status === 'ACTIVE' ? colors.successBg : status === 'INACTIVE' ? colors.warningBg : colors.dangerBg;
  const textColor =
    status === 'ACTIVE' ? colors.successText : status === 'INACTIVE' ? colors.warningText : colors.dangerText;
  const dotColor =
    status === 'ACTIVE' ? colors.success : status === 'INACTIVE' ? colors.warning : colors.danger;
  const borderColor =
    status === 'ACTIVE'
      ? colors.successBorder
      : status === 'INACTIVE'
        ? colors.warningBorder
        : colors.dangerBorder;

  return (
    <View
      style={[styles.badge, { backgroundColor: bgColor, borderColor }]}
      accessibilityLabel={`Status: ${status}`}
    >
      <View style={[styles.badgeDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.badgeText, { color: textColor }]}>{status}</Text>
    </View>
  );
}

function InfoRow({ label, value, styles: s }: { label: string; value: string | null | undefined; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={s.infoRow} accessibilityLabel={`${label}: ${value || 'not provided'}`}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value || '—'}</Text>
    </View>
  );
}

export function StudentDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { showToast } = useToast();
  const navigation = useNavigation<Nav>();
  const route = useRoute<DetailRoute>();
  // Prefer the URL-safe `studentId` (always present); fall back to
  // `paramStudent.id` for legacy navigation that still passes the object.
  // On web refresh, paramStudent serializes to "[object Object]" and is
  // unusable — the studentId param is what we trust.
  const paramStudent =
    route.params?.student && typeof route.params.student === 'object'
      ? route.params.student
      : undefined;
  const studentId = route.params?.studentId ?? paramStudent?.id;

  const [student, setStudent] = useState<StudentListItem>(
    paramStudent ?? ({ id: studentId ?? '', fullName: '', status: 'ACTIVE' } as StudentListItem),
  );
  // True while we're loading the student for the first time WITHOUT a
  // pre-fetched object (e.g. web URL refresh, deep link, or any flow where
  // navigation passes only `studentId`). Avoids flashing the empty stub
  // ("—" for every field) for a second before the data lands.
  const [bootstrapping, setBootstrapping] = useState(!paramStudent?.fullName);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [fees, setFees] = useState<FeeDueItem[]>([]);
  const [feesLoading, setFeesLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadFees = useCallback(async () => {
    if (!studentId) return;
    setFeesLoading(true);
    try {
      // No range → API returns the student's FULL history (joining month →
      // current month), so older overdue dues aren't hidden and this matches
      // the Fees-tab detail and the Fees list total.
      const result = await getStudentFees(studentId);
      if (mountedRef.current && result.ok) {
        setFees(result.value);
      }
    } catch {
      // best-effort
    } finally {
      if (mountedRef.current) setFeesLoading(false);
    }
  }, [studentId]);

  useEffect(() => { loadFees(); }, [loadFees]);

  // Outstanding total across every unpaid month — same shared helper the
  // Fees-tab detail uses, so both screens (and the Fees list) always agree.
  const feeSummary = useMemo(() => computeOutstandingSummary(fees), [fees]);

  const refetchStudent = useCallback(async () => {
    if (!studentId) return;
    setError(null);
    try {
      const result = await getStudent(studentId);
      if (!mountedRef.current) return;
      if (result.ok) {
        setStudent(result.value);
      } else if (result.error.code === 'NOT_FOUND') {
        // Student no longer exists (deleted or never existed). Don't strand
        // the user on a screen with stale data + a 404 error banner — pop
        // back to the list with a toast explaining what happened.
        showToast('This student is no longer available.', 'error');
        if (navigation.canGoBack()) {
          navigation.goBack();
        }
      } else {
        setError(result.error.message);
      }
    } catch (e) {
      if (__DEV__) console.error('[StudentDetailScreen] Refetch failed:', e);
      if (mountedRef.current) {
        setError('Failed to load student data.');
      }
    } finally {
      // First load complete (success or error) — render the real screen
      // even on error so the InlineError banner has a place to show up.
      if (mountedRef.current) setBootstrapping(false);
    }
  }, [studentId, showToast, navigation]);

  // Auto-refetch when screen gains focus (e.g., returning from edit).
  // First focus normally skips the refetch because the list screen already
  // hands us full student data via route params. But the edit form's
  // navigation.replace passes only `{ id }` (mutation response schema strips
  // everything else), leaving a stub. Detect that and force a refetch.
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      const isStub = !paramStudent?.fullName;
      if (isFirstFocus.current && !isStub) {
        isFirstFocus.current = false;
        return;
      }
      isFirstFocus.current = false;
      refetchStudent();
    }, [refetchStudent, paramStudent?.fullName]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchStudent(), loadFees()]);
    } catch {
      // Handled inside callbacks
    } finally {
      setRefreshing(false);
    }
  }, [refetchStudent]);

  const handleCall = useCallback((number: string) => {
    Linking.openURL(`tel:${number}`).catch(() => {
      showToast('Unable to open phone dialer', 'error');
    });
  }, [showToast]);

  const handleWhatsApp = useCallback((number: string) => {
    const cleaned = number.replace(/\D/g, '');
    // If already has country code (11+ digits starting with country code), use as-is.
    // Otherwise assume India (+91).
    const formatted = cleaned.length > 10 ? cleaned : `91${cleaned}`;
    Linking.openURL(`https://wa.me/${formatted}`).catch(() => {
      showToast('Unable to open WhatsApp', 'error');
    });
  }, [showToast]);

  const handlePhotoUploaded = useCallback((url: string) => {
    setStudent((prev) => ({ ...prev, profilePhotoUrl: url }));
  }, []);

  // Guard against missing route params — all hooks are above
  if (!studentId) {
    return (
      <View style={styles.screen}>
        <EmptyState
          variant="empty"
          icon="account-alert-outline"
          message="Student data unavailable"
          subtitle="Please go back and try again."
        />
      </View>
    );
  }

  // Initial-load loader: when we arrived without pre-fetched student data
  // (web URL refresh / deep link), don't flash the empty stub for a second
  // before the fetch completes. Show a skeleton instead.
  if (bootstrapping) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.bootstrappingContent}>
          <SkeletonTile />
          <View style={styles.bootstrappingGap} />
          <SkeletonTile />
          <View style={styles.bootstrappingGap} />
          <SkeletonTile />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {error && <InlineError message={error} onRetry={refetchStudent} />}

        {/* Header */}
        <View style={styles.headerCard}>
          <ProfilePhotoUploader
            currentPhotoUrl={student.profilePhotoUrl}
            uploadPath={getStudentPhotoUploadPath(student.id)}
            onPhotoUploaded={handlePhotoUploaded}
            size={90}
            testID="student-detail-photo"
          />
          <Text style={styles.studentName} accessibilityRole="header" numberOfLines={1}>
            {student.fullName}
          </Text>
          <StatusBadge status={student.status} colors={colors} />
        </View>

        {/* Summary Card */}
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Monthly Fee</Text>
              <Text style={styles.summaryValue}>{`\u20B9${student.monthlyFee?.toLocaleString('en-IN') ?? '—'}`}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Joined</Text>
              <Text style={styles.summaryValue}>{formatDate(student.joiningDate)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Gender</Text>
              <Text style={styles.summaryValue}>{student.gender || '—'}</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('StudentForm', { mode: 'edit', studentId: student.id })}
            accessibilityLabel="Edit student"
            accessibilityRole="button"
            testID="edit-student-button"
          >
            <LinearGradient
              colors={[gradient.start, gradient.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <AppIcon name="pencil-outline" size={18} color={colors.white} />
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => setActionMenuVisible(true)}
            accessibilityLabel="More actions for this student"
            accessibilityRole="button"
            testID="more-actions-button"
          >
            <AppIcon name="dots-horizontal" size={18} color={colors.text} />
            <Text style={styles.actionButtonSecondaryText}>More</Text>
          </TouchableOpacity>
        </View>

        {/* Personal Information */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Personal Information</Text>
          <InfoRow label="Father Name" value={student.fatherName} styles={styles} />
          <InfoRow label="Mother Name" value={student.motherName} styles={styles} />
          <InfoRow label="Date of Birth" value={formatDate(student.dateOfBirth)} styles={styles} />
          <InfoRow label="Gender" value={student.gender} styles={styles} />
        </View>

        {/* Contact Information */}
        <View style={styles.card}>
          <View style={styles.contactSectionHeader}>
            <View style={[styles.contactSectionIcon, { overflow: 'hidden' }]}>
              <LinearGradient
                colors={[gradient.start, gradient.end]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <AppIcon name="card-account-phone-outline" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.sectionTitle} accessibilityRole="header">Contact Information</Text>
          </View>

          {!student.guardian?.mobile && !student.mobileNumber && !student.whatsappNumber && !student.email && !student.guardian?.email && !student.addressText && (
            <View style={styles.contactEmpty}>
              <AppIcon name="account-off-outline" size={28} color={colors.textDisabled} />
              <Text style={styles.contactEmptyText}>No contact details added yet</Text>
            </View>
          )}

          {/* Phone tile — info blue identity for "call this number" */}
          {student.guardian?.mobile && (
            <View style={styles.contactTile}>
              <View style={[styles.contactTileIcon, { backgroundColor: colors.info }]}>
                <AppIcon name="phone-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.contactTileInfo}>
                <Text style={styles.contactTileLabel}>Mobile</Text>
                <Text style={styles.contactTileValue}>{student.guardian.mobile}</Text>
              </View>
              <TouchableOpacity
                style={[styles.contactActionPill, { backgroundColor: colors.info }]}
                onPress={() => handleCall(student.guardian!.mobile)}
                accessibilityLabel={`Call guardian at ${student.guardian!.mobile}`}
                accessibilityRole="button"
                testID="call-guardian"
                activeOpacity={0.85}
              >
                <AppIcon name="phone" size={14} color="#FFFFFF" />
                <Text style={styles.contactActionPillText}>Call</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* WhatsApp tile — brand-green identity, distinct from the call row */}
          {(student.mobileNumber || student.guardian?.mobile || student.whatsappNumber) && (
            <View style={styles.contactTile}>
              <View style={[styles.contactTileIcon, { backgroundColor: '#25D366' }]}>
                <AppIcon name="whatsapp" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.contactTileInfo}>
                <Text style={styles.contactTileLabel}>WhatsApp</Text>
                <Text style={styles.contactTileValue}>{student.mobileNumber || student.guardian?.mobile || student.whatsappNumber}</Text>
              </View>
              <TouchableOpacity
                style={[styles.contactActionPill, { backgroundColor: '#25D366' }]}
                onPress={() => handleWhatsApp((student.mobileNumber || student.guardian?.mobile || student.whatsappNumber)!)}
                accessibilityLabel={`Open WhatsApp chat with ${student.fullName}`}
                accessibilityRole="button"
                testID="whatsapp-student"
                activeOpacity={0.85}
              >
                <AppIcon name="message-text" size={14} color="#FFFFFF" />
                <Text style={styles.contactActionPillText}>Chat</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Contact details */}
          {(student.email || student.guardian?.email) ? (
            <View style={styles.contactDetailRow}>
              <AppIcon name="email-outline" size={18} color={colors.textSecondary} />
              <View style={styles.contactDetailInfo}>
                <Text style={styles.contactDetailLabel}>Email</Text>
                <Text style={styles.contactDetailValue}>{student.email || student.guardian?.email}</Text>
              </View>
            </View>
          ) : null}

          {student.addressText ? (
            <View style={styles.contactDetailRow}>
              <AppIcon name="map-marker-outline" size={18} color={colors.textSecondary} />
              <View style={styles.contactDetailInfo}>
                <Text style={styles.contactDetailLabel}>Address</Text>
                <Text style={styles.contactDetailValue}>{student.addressText}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Fee History */}
        <View style={styles.card}>
          <View style={styles.contactSectionHeader}>
            <View style={[styles.contactSectionIcon, { overflow: 'hidden' }]}>
              <LinearGradient
                colors={[gradient.start, gradient.end]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <AppIcon name="currency-inr" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.sectionTitle} accessibilityRole="header">Fee History</Text>
          </View>

          {feesLoading ? (
            <View style={styles.feeLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : fees.length === 0 ? (
            <View style={styles.contactEmpty}>
              <AppIcon name="receipt" size={28} color={colors.textDisabled} />
              <Text style={styles.contactEmptyText}>No fee records yet</Text>
            </View>
          ) : (
            <>
              {/* Summary */}
              <View style={styles.feeSummaryRow}>
                <View style={[styles.feeSummaryChip, { backgroundColor: colors.successBg }]}>
                  <Text style={[styles.feeSummaryValue, { color: colors.success }]}>
                    {fees.filter((f) => f.status === 'PAID').length}
                  </Text>
                  <Text style={[styles.feeSummaryLabel, { color: colors.successText }]}>Paid</Text>
                </View>
                <View style={[styles.feeSummaryChip, { backgroundColor: colors.warningLightBg }]}>
                  <Text style={[styles.feeSummaryValue, { color: colors.warningAccent }]}>
                    {fees.filter((f) => f.status === 'DUE').length}
                  </Text>
                  <Text style={[styles.feeSummaryLabel, { color: colors.warningText }]}>Due</Text>
                </View>
                <View style={[styles.feeSummaryChip, { backgroundColor: colors.bgSubtle }]}>
                  <Text style={[styles.feeSummaryValue, { color: colors.textMedium }]}>
                    {fees.filter((f) => f.status === 'UPCOMING').length}
                  </Text>
                  <Text style={[styles.feeSummaryLabel, { color: colors.textSecondary }]}>Upcoming</Text>
                </View>
              </View>

              {feeSummary.monthsCount > 0 && (
                <View style={styles.feeOutstandingRow} testID="student-detail-outstanding">
                  <Text style={styles.feeOutstandingLabel}>Outstanding</Text>
                  <View style={styles.feeOutstandingRight}>
                    <Text style={styles.feeOutstandingAmount}>
                      {formatCurrency(feeSummary.totalOutstanding)}
                    </Text>
                    <Text style={styles.feeOutstandingMeta}>
                      {feeSummary.monthsCount} {feeSummary.monthsCount === 1 ? 'month' : 'months'} ·{' '}
                      {feeSummary.monthKeys.map(formatMonthShort).join(', ')}
                    </Text>
                  </View>
                </View>
              )}

              {/* Fee rows */}
              {fees.map((fee) => {
                const isPaid = fee.status === 'PAID';
                const isDue = fee.status === 'DUE';
                const monthLabel = (() => {
                  try {
                    const [y, m] = fee.monthKey.split('-');
                    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return `${names[parseInt(m!, 10) - 1]} ${y}`;
                  } catch { return fee.monthKey; }
                })();

                return (
                  <View key={fee.id} style={styles.feeRow}>
                    <View style={[styles.feeStatusDot, {
                      backgroundColor: isPaid ? colors.success : isDue ? colors.warningAccent : colors.textDisabled,
                    }]} />
                    <View style={styles.feeRowInfo}>
                      <Text style={styles.feeMonth}>{monthLabel}</Text>
                      <Text style={styles.feeStatus}>
                        {isPaid ? `Paid${fee.paidAt ? ` · ${formatDate(fee.paidAt)}` : ''}` : fee.status}
                      </Text>
                    </View>
                    <View style={styles.feeRowAmounts}>
                      <Text style={[styles.feeAmount, isPaid && { color: colors.success }]}>
                        {'\u20B9'}{fee.amount.toLocaleString('en-IN')}
                      </Text>
                      {fee.lateFee > 0 && (
                        <Text style={styles.feeLateFee}>+{'\u20B9'}{fee.lateFee.toLocaleString('en-IN')} late</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>

      </ScrollView>

      {student && (
        <StudentActionMenu
          visible={actionMenuVisible}
          student={student}
          onClose={() => setActionMenuVisible(false)}
          onEdit={() => {
            navigation.navigate('StudentForm', { mode: 'edit', studentId: student.id });
          }}
          onAssignBatch={() => {
            navigation.navigate('StudentForm', { mode: 'edit', studentId: student.id });
          }}
          onDeleted={() => navigation.goBack()}
          onStatusChanged={refetchStudent}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  bootstrappingContent: {
    padding: spacing.base,
  },
  bootstrappingGap: {
    height: spacing.md,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.base,
    ...shadows.md,
  },
  studentName: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.3,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.base,
    ...shadows.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  actionButtonSecondary: {
    backgroundColor: colors.bgSubtle,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  actionButtonSecondaryText: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontSize: fontSizes.base,
    color: colors.text,
    fontWeight: fontWeights.medium,
    flex: 1,
    textAlign: 'right',
  },
  contactSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  contactEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  contactEmptyText: {
    fontSize: fontSizes.sm,
    color: colors.textDisabled,
  },

  /* Fee History */
  feeLoading: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  feeSummaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  feeSummaryChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  feeSummaryValue: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  feeSummaryLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    marginTop: 2,
  },
  feeOutstandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  feeOutstandingLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.warningText,
  },
  feeOutstandingRight: {
    alignItems: 'flex-end',
  },
  feeOutstandingAmount: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.warningText,
  },
  feeOutstandingMeta: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  feeStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.md,
  },
  feeRowInfo: {
    flex: 1,
  },
  feeMonth: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  feeStatus: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  feeRowAmounts: {
    alignItems: 'flex-end',
  },
  feeAmount: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  feeLateFee: {
    fontSize: fontSizes.xs,
    color: colors.warningAccent,
    marginTop: 1,
  },
  contactSectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  contactTileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactTileInfo: {
    flex: 1,
  },
  contactTileLabel: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
    marginBottom: 2,
  },
  contactTileValue: {
    fontSize: fontSizes.md,
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  // Action pill — labeled (icon + word) so the user knows exactly what
  // happens, instead of two same-color circles that look like decoration.
  contactActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 7,
    borderRadius: radius.full,
    ...shadows.sm,
  },
  contactActionPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.3,
  },
  contactDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  contactDetailInfo: {
    flex: 1,
  },
  contactDetailLabel: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
    marginBottom: 2,
  },
  contactDetailValue: {
    fontSize: fontSizes.base,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
});
