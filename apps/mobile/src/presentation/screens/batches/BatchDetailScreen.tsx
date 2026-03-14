import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  FlatList,
  RefreshControl,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { BatchesStackParamList } from '../../navigation/BatchesStack';
import type { StudentListItem } from '../../../domain/student/student.types';
import {
  listBatchStudents,
  removeStudentFromBatch,
  deleteBatch,
} from '../../../infra/batch/batch-api';
import { Badge } from '../../components/ui/Badge';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { spacing, fontSizes, fontWeights, radius, shadows, listDefaults } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<BatchesStackParamList, 'BatchDetail'>;
type DetailRoute = RouteProp<BatchesStackParamList, 'BatchDetail'>;

const PAGE_SIZE = 20;

const DAY_SHORT: Record<string, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

export function BatchDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const route = useRoute<DetailRoute>();
  const batch = route.params?.batch;
  const { user } = useAuth();

  if (!batch?.id) {
    return (
      <View style={styles.screen}>
        <Text style={{ textAlign: 'center', marginTop: 40, color: colors.textSecondary }}>
          Batch data unavailable
        </Text>
      </View>
    );
  }
  const isOwner = user?.role === 'OWNER';

  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const totalItemsRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText]);

  const fetchStudents = useCallback(
    async (page: number, append = false) => {
      const result = await listBatchStudents(batch.id, page, PAGE_SIZE, debouncedSearch || undefined);

      if (result.ok) {
        const data = result.value;
        setStudents((prev) => (append ? [...prev, ...data.data] : data.data));
        totalItemsRef.current = data.meta.totalItems;
        hasMoreRef.current = page < data.meta.totalPages;
        setError(null);
      } else {
        setError(result.error.message);
      }
    },
    [batch.id, debouncedSearch],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    pageRef.current = 1;
    await fetchStudents(1);
    setLoading(false);
  }, [fetchStudents]);

  useFocusEffect(
    useCallback(() => {
      loadInitial();
    }, [loadInitial]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    pageRef.current = 1;
    await fetchStudents(1);
    setRefreshing(false);
  }, [fetchStudents]);

  const fetchMore = useCallback(async () => {
    if (loadingMore || !hasMoreRef.current) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    pageRef.current = nextPage;
    await fetchStudents(nextPage, true);
    setLoadingMore(false);
  }, [loadingMore, fetchStudents]);

  const handleRemove = useCallback(
    (student: StudentListItem) => {
      Alert.alert(
        'Remove Student',
        `Remove ${student.fullName} from this batch?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setRemovingId(student.id);
              const result = await removeStudentFromBatch(batch.id, student.id);
              if (result.ok) {
                setStudents((prev) => prev.filter((s) => s.id !== student.id));
                totalItemsRef.current -= 1;
              } else {
                Alert.alert('Error', result.error.message);
              }
              setRemovingId(null);
            },
          },
        ],
      );
    },
    [batch.id],
  );

  const handleEdit = useCallback(() => {
    navigation.navigate('BatchForm', { mode: 'edit', batch });
  }, [navigation, batch]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Batch',
      `Delete "${batch.batchName}"? All students will be unassigned from this batch.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteBatch(batch.id);
            if (result.ok) {
              navigation.goBack();
            } else {
              Alert.alert('Error', result.error.message);
            }
          },
        },
      ],
    );
  }, [batch, navigation]);

  const handleAddStudent = useCallback(() => {
    const existingIds = students.map((s) => s.id);
    navigation.navigate('AddStudentToBatch', {
      batchId: batch.id,
      existingStudentIds: existingIds,
    });
  }, [navigation, batch.id, students]);

  const daysText = batch.days.length > 0
    ? batch.days.map((d) => DAY_SHORT[d] ?? d).join(', ')
    : 'No days set';

  const formatTime12h = (time: string): string => {
    const [h, m] = time.split(':').map(Number);
    const period = h! >= 12 ? 'PM' : 'AM';
    const hour12 = h! % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  };

  const timeSlotText = batch.startTime && batch.endTime
    ? `${formatTime12h(batch.startTime)} – ${formatTime12h(batch.endTime)}`
    : null;

  /* ── Student row ────────────────────────────────────────────────────── */
  const renderStudentItem = useCallback(
    ({ item, index }: { item: StudentListItem; index: number }) => (
      <View style={[styles.studentRow, index > 0 && styles.studentRowBorder]}>
        {/* Avatar circle with initial */}
        <View style={styles.studentAvatar}>
          <Text style={styles.studentAvatarText}>{item.fullName.charAt(0).toUpperCase()}</Text>
        </View>

        <View style={styles.studentInfo}>
          <Text style={styles.studentName} numberOfLines={1}>
            {item.fullName}
          </Text>
          <Text style={styles.studentFee}>{'\u20B9'}{item.monthlyFee}/mo</Text>
        </View>

        <Pressable
          onPress={() => handleRemove(item)}
          disabled={removingId === item.id}
          style={styles.removeButton}
          hitSlop={8}
          testID={`remove-student-${item.id}`}
        >
          {removingId === item.id ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <Text style={styles.removeText}>{'\u2715'}</Text>
          )}
        </Pressable>
      </View>
    ),
    [handleRemove, removingId, colors, styles],
  );

  const keyExtractor = useCallback((item: StudentListItem) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [loadingMore, colors, styles]);

  /* ── Header ─────────────────────────────────────────────────────────── */
  const renderHeader = useCallback(
    () => (
      <View>
        {/* Batch info card */}
        <View style={styles.infoCard}>
          {/* Avatar + name row */}
          <View style={styles.heroRow}>
            {batch.profilePhotoUrl ? (
              <Image source={{ uri: batch.profilePhotoUrl }} style={styles.batchAvatar} />
            ) : (
              <View style={[styles.batchAvatar, styles.batchAvatarPlaceholder]}>
                <Text style={styles.batchAvatarInitial}>
                  {batch.batchName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.heroInfo}>
              <View style={styles.nameStatusRow}>
                <Text style={styles.batchName} numberOfLines={1}>
                  {batch.batchName}
                </Text>
                {batch.status === 'INACTIVE' && <Badge label="Inactive" variant="neutral" />}
              </View>
              <Text style={styles.schedule}>{daysText}</Text>
              {timeSlotText && <Text style={styles.schedule}>{timeSlotText}</Text>}
            </View>
          </View>

          {/* Detail rows */}
          {batch.maxStudents != null && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Capacity</Text>
              <Text style={styles.detailValue}>
                {totalItemsRef.current} / {batch.maxStudents}
              </Text>
            </View>
          )}
          {batch.notes ? (
            <View style={styles.notesContainer}>
              <Text style={styles.notesText}>{batch.notes}</Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actionRow}>
            <Pressable onPress={handleEdit} style={styles.actionButton} testID="edit-batch-button">
              <Text style={styles.actionButtonText}>Edit</Text>
            </Pressable>
            {isOwner && (
              <Pressable
                onPress={handleDelete}
                style={[styles.actionButton, styles.actionButtonDanger]}
                testID="delete-batch-button"
              >
                <Text style={styles.actionButtonDangerText}>Delete</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Students section header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Students ({totalItemsRef.current})
          </Text>
          <Pressable
            onPress={handleAddStudent}
            style={styles.addStudentButton}
            testID="add-student-button"
          >
            <Text style={styles.addStudentText}>+ Add</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search students..."
            placeholderTextColor={colors.textDisabled}
            value={searchText}
            onChangeText={setSearchText}
            testID="batch-detail-search-input"
          />
        </View>

        {/* Student list card wrapper — opened here, closed below */}
      </View>
    ),
    [batch, daysText, timeSlotText, isOwner, handleEdit, handleDelete, handleAddStudent, searchText, colors, styles],
  );

  return (
    <View style={styles.screen}>
      {error && <InlineError message={error} onRetry={loadInitial} />}

      {loading && !refreshing ? (
        <View style={styles.content}>
          {renderHeader()}
          <View style={styles.skeletons}>
            <SkeletonTile />
            <SkeletonTile />
            <SkeletonTile />
          </View>
        </View>
      ) : (
        <FlatList
          data={students}
          renderItem={renderStudentItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={<EmptyState message="No students in this batch" />}
          ListFooterComponent={renderFooter}
          onEndReached={fetchMore}
          onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="batch-students-list"
        />
      )}
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────── */

const makeStyles = (colors: Colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.base,
  },

  /* ── Info card ──────────────────────────────────────────────────── */
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.base,
    ...shadows.sm,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  batchAvatar: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    marginRight: spacing.md,
  },
  batchAvatarPlaceholder: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchAvatarInitial: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  heroInfo: {
    flex: 1,
  },
  nameStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  batchName: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    flexShrink: 1,
  },
  schedule: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detailLabel: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },

  notesContainer: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  notesText: {
    fontSize: fontSizes.sm,
    color: colors.textLight,
    lineHeight: 20,
  },

  /* ── Action buttons ─────────────────────────────────────────────── */
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  actionButtonDanger: {
    borderColor: colors.danger,
  },
  actionButtonDangerText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.danger,
  },

  /* ── Section header ─────────────────────────────────────────────── */
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textDark,
  },
  addStudentButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  addStudentText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },

  /* ── Search ─────────────────────────────────────────────────────── */
  searchBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  searchInput: {
    paddingVertical: 10,
    paddingHorizontal: spacing.base,
    fontSize: fontSizes.base,
    color: colors.text,
  },

  /* ── Student rows ───────────────────────────────────────────────── */
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  studentRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  studentAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  studentAvatarText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: 2,
  },
  studentFee: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  removeText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.danger,
  },

  /* ── Misc ───────────────────────────────────────────────────────── */
  skeletons: {
    gap: spacing.sm,
  },
  footer: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: listDefaults.contentPaddingBottom,
  },
});
