import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../ui/AppIcon';
import type { BatchListItem } from '../../../domain/batch/batch.types';
import type { Weekday } from '@academyflo/contracts';
import { spacing, fontSizes, fontWeights, radius, shadows, gradient } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

const WEEKDAY_FULL: Record<Weekday, string> = {
  SUN: 'Sunday',
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
};

type Props = {
  visible: boolean;
  batches: BatchListItem[];
  loading: boolean;
  selectedBatchId: string | null;
  /** Weekday of the date being marked. Batches running on this day float to
   *  the top under an "Available today" group; the rest sink below. */
  selectedWeekday: Weekday;
  /** Whether the marked date is today — only affects the group's wording. */
  isSelectedToday: boolean;
  onSelect: (batchId: string, batchName: string) => void;
  onClose: () => void;
};

// Bottom sheet for choosing a batch before marking attendance. Differs from
// BatchFilterBar: there's no "All Batches" option — marking is always scoped
// to one session.
export function BatchPickerSheet({
  visible,
  batches,
  loading,
  selectedBatchId,
  selectedWeekday,
  isSelectedToday,
  onSelect,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Split into batches that run on the selected day vs the rest, preserving
  // the incoming order within each group.
  const { todayBatches, otherBatches } = useMemo(() => {
    const today: BatchListItem[] = [];
    const other: BatchListItem[] = [];
    for (const b of batches) {
      if (b.days.includes(selectedWeekday)) today.push(b);
      else other.push(b);
    }
    return { todayBatches: today, otherBatches: other };
  }, [batches, selectedWeekday]);

  const todayHeading = isSelectedToday
    ? 'AVAILABLE TODAY'
    : `RUNS ON ${WEEKDAY_FULL[selectedWeekday].toUpperCase()}`;
  // When nothing runs today, the remaining list is just "all batches".
  const otherHeading = todayBatches.length > 0 ? 'OTHER BATCHES' : 'ALL BATCHES';

  const renderRow = (batch: BatchListItem, isToday: boolean) => {
    const isSelected = batch.id === selectedBatchId;
    // For today's batches the session time is the actionable bit — surface it
    // on the right and let the subtitle carry just the day list.
    const timeLabel = isToday ? formatTime(batch) : null;
    return (
      <Pressable
        key={batch.id}
        style={[
          styles.row,
          isSelected && (isToday ? styles.rowSelectedToday : styles.rowSelected),
        ]}
        onPress={() => onSelect(batch.id, batch.batchName)}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        testID={`batch-picker-${batch.id}`}
      >
        <View style={styles.rowIcon}>
          {isSelected ? (
            <>
              <LinearGradient
                colors={[gradient.start, gradient.end]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <AppIcon name="check" size={16} color="#FFFFFF" />
            </>
          ) : (
            <Text style={[styles.rowIconLetter, !isToday && styles.rowIconLetterOther]}>
              {batch.batchName.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.rowName, !isToday && styles.rowNameMuted]} numberOfLines={1}>
            {batch.batchName}
          </Text>
          <Text style={[styles.rowMeta, !isToday && styles.rowMetaMuted]} numberOfLines={1}>
            {isToday ? formatDays(batch) : formatSchedule(batch)}
          </Text>
        </View>
        {timeLabel ? (
          <Text style={styles.timeToday} numberOfLines={1}>
            {timeLabel}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  // Reserve room for the OS gesture bar and the bottom tab bar that sits
  // above it — without this the last list item is clipped by the tabs.
  const TAB_BAR_HEIGHT = 64;
  const bottomReserve = insets.bottom + TAB_BAR_HEIGHT + spacing.md;

  const sheet = (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: 0 }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <LinearGradient
              colors={[gradient.start, gradient.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <AppIcon name="account-group-outline" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Select Batch</Text>
            <Text style={styles.subtitle}>
              Attendance is marked per session. Pick the batch you're marking.
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomReserve },
          ]}
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : batches.length === 0 ? (
            <View style={styles.emptyRow}>
              <AppIcon name="account-group-outline" size={32} color={colors.textDisabled} />
              <Text style={styles.emptyText}>
                No batches yet. Create one in More → Batches first.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionHeader, styles.sectionHeaderToday]}>{todayHeading}</Text>
                <View style={styles.headerSpacer} />
                {todayBatches.length > 0 ? (
                  <View style={styles.countBadgeToday}>
                    <Text style={styles.countBadgeTextToday}>{todayBatches.length}</Text>
                  </View>
                ) : null}
              </View>
              {todayBatches.length > 0 ? (
                <View style={styles.todayGroup}>
                  {todayBatches.map((batch) => renderRow(batch, true))}
                </View>
              ) : (
                <Text style={styles.noTodayText}>No batch is scheduled for this day.</Text>
              )}

              {otherBatches.length > 0 ? (
                <>
                  <View style={[styles.sectionHeaderRow, styles.sectionHeaderRowSpaced]}>
                    <Text style={styles.sectionHeader}>{otherHeading}</Text>
                    <View style={styles.headerSpacer} />
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{otherBatches.length}</Text>
                    </View>
                  </View>
                  {otherBatches.map((batch) => renderRow(batch, false))}
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );

  if (!visible) return null;
  if (Platform.OS === 'web') return sheet;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // Covers the status bar on Android so the sheet visually overlays the
      // whole screen instead of leaving a lit strip behind.
      statusBarTranslucent
    >
      {sheet}
    </Modal>
  );
}

function formatSchedule(batch: BatchListItem): string {
  const days = formatDays(batch);
  const time = formatTime(batch);
  return time ? `${days} · ${time}` : days;
}

function formatDays(batch: BatchListItem): string {
  return batch.days.length > 0 ? batch.days.join(', ') : 'No schedule set';
}

function formatTime(batch: BatchListItem): string | null {
  if (batch.startTime && batch.endTime) return `${batch.startTime} – ${batch.endTime}`;
  if (batch.startTime) return batch.startTime;
  return null;
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      ...(Platform.OS === 'web'
        ? { position: 'fixed' as unknown as 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }
        : {}),
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl + 4,
      borderTopRightRadius: radius.xl + 4,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing['2xl'],
      // A bounded height lets the inner ScrollView be scrollable. Without
      // this the list lays out at full content height and overflows.
      maxHeight: '90%',
      minHeight: '55%',
      ...shadows.sm,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.lg,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.bold,
      color: colors.text,
    },
    subtitle: {
      marginTop: 2,
      fontSize: fontSizes.xs,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    list: {
      // `flex: 1` is what actually makes the ScrollView scrollable inside a
      // parent with `maxHeight`. Without it the scroll view sizes to content
      // and the last rows end up clipped by the tab bar below the sheet.
      flex: 1,
      marginTop: spacing.sm,
    },
    listContent: {
      paddingVertical: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      gap: spacing.sm + 2,
    },
    rowSelected: {
      backgroundColor: colors.bgSubtle,
    },
    rowSelectedToday: {
      backgroundColor: colors.primaryLight,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgSubtle,
    },
    rowIconLetter: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.bold,
      color: colors.textSecondary,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
    rowName: {
      fontSize: fontSizes.base,
      fontWeight: fontWeights.semibold,
      color: colors.text,
      flexShrink: 1,
      lineHeight: 18,
    },
    rowMeta: {
      marginTop: 1,
      fontSize: fontSizes.xs,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    rowNameMuted: {
      color: colors.textSecondary,
    },
    rowMetaMuted: {
      color: colors.textDisabled,
    },
    rowIconLetterOther: {
      color: colors.textDisabled,
    },
    todayGroup: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.primaryLight,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs,
      marginTop: spacing.xs,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.xs,
    },
    sectionHeaderRowSpaced: {
      marginTop: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    sectionHeader: {
      fontSize: 11,
      fontWeight: fontWeights.bold,
      letterSpacing: 1,
      color: colors.textDisabled,
      textTransform: 'uppercase',
    },
    sectionHeaderToday: {
      color: colors.primary,
      fontWeight: fontWeights.heavy,
    },
    headerSpacer: {
      flex: 1,
    },
    countBadge: {
      minWidth: 20,
      height: 18,
      borderRadius: radius.full,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    countBadgeToday: {
      minWidth: 20,
      height: 18,
      borderRadius: radius.full,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryLight,
    },
    countBadgeText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: fontWeights.bold,
      color: colors.textDisabled,
    },
    countBadgeTextToday: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: fontWeights.bold,
      color: colors.primary,
    },
    noTodayText: {
      fontSize: fontSizes.sm,
      color: colors.textSecondary,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    timeToday: {
      marginLeft: spacing.sm,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.semibold,
      color: colors.text,
      flexShrink: 0,
    },
    loadingRow: {
      padding: spacing.xl,
      alignItems: 'center',
    },
    emptyRow: {
      padding: spacing.xl,
      alignItems: 'center',
      gap: spacing.sm,
    },
    emptyText: {
      fontSize: fontSizes.sm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
