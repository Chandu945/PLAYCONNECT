import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { getTodayIST } from '../../../domain/common/date-utils';

type DayStatus = 'present' | 'absent' | 'holiday' | 'future' | 'empty';

type Props = {
  /** YYYY-MM */
  month: string;
  absentDates: string[];
  holidayDates: string[];
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildCalendarGrid(
  month: string,
  absentSet: Set<string>,
  holidaySet: Set<string>,
  todayStr: string,
): { day: number; status: DayStatus; isToday: boolean }[][] {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const mon = Number(monthStr);

  const firstDay = new Date(year, mon - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, mon, 0).getDate();

  const rows: { day: number; status: DayStatus; isToday: boolean }[][] = [];
  let currentRow: { day: number; status: DayStatus; isToday: boolean }[] = [];

  // Leading empty cells
  for (let i = 0; i < firstDay; i++) {
    currentRow.push({ day: 0, status: 'empty', isToday: false });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${month}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;

    let status: DayStatus;
    if (isFuture) {
      status = 'future';
    } else if (holidaySet.has(dateStr)) {
      status = 'holiday';
    } else if (absentSet.has(dateStr)) {
      status = 'absent';
    } else {
      status = 'present';
    }

    currentRow.push({ day: d, status, isToday });

    if (currentRow.length === 7) {
      rows.push(currentRow);
      currentRow = [];
    }
  }

  // Trailing empty cells
  if (currentRow.length > 0) {
    while (currentRow.length < 7) {
      currentRow.push({ day: 0, status: 'empty', isToday: false });
    }
    rows.push(currentRow);
  }

  return rows;
}

function getStatusBg(colors: Colors): Record<DayStatus, string> {
  return {
    present: colors.successBg,
    absent: colors.dangerBg,
    holiday: colors.warningBg,
    future: colors.bg,
    empty: 'transparent',
  };
}

function getStatusText(colors: Colors): Record<DayStatus, string> {
  return {
    present: colors.successText,
    absent: colors.dangerText,
    holiday: colors.warningText,
    future: colors.textDisabled,
    empty: 'transparent',
  };
}

export function AttendanceCalendar({ month, absentDates, holidayDates }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const STATUS_BG = useMemo(() => getStatusBg(colors), [colors]);
  const STATUS_TEXT = useMemo(() => getStatusText(colors), [colors]);
  const todayStr = getTodayIST();
  const absentSet = new Set(absentDates);
  const holidaySet = new Set(holidayDates);
  const rows = buildCalendarGrid(month, absentSet, holidaySet, todayStr);

  return (
    <View style={styles.card} testID="attendance-calendar">
      {/* Weekday headers */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((d) => (
          <View style={styles.weekCell} key={d}>
            <Text style={styles.weekLabel}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      {rows.map((row, ri) => (
        <View style={styles.dayRow} key={ri}>
          {row.map((cell, ci) => (
            <View style={styles.dayCell} key={ci}>
              {cell.day > 0 ? (
                <View
                  style={[
                    styles.dayCircle,
                    { backgroundColor: STATUS_BG[cell.status] },
                    cell.isToday && styles.todayRing,
                  ]}
                  testID={cell.day > 0 ? `cal-day-${cell.day}` : undefined}
                  accessibilityLabel={`Day ${cell.day}, ${cell.status}`}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: STATUS_TEXT[cell.status] },
                      cell.isToday && styles.todayText,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ))}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={styles.legendLabel}>Present</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
          <Text style={styles.legendLabel}>Absent</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={styles.legendLabel}>Holiday</Text>
        </View>
      </View>
    </View>
  );
}

const CELL_SIZE = 36;

const makeStyles = (colors: Colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: CELL_SIZE + 4,
  },
  dayCircle: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: CELL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  todayRing: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  todayText: {
    fontWeight: fontWeights.bold,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },
});
