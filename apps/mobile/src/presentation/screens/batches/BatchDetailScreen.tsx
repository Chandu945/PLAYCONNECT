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
import { AppCard } from '../../components/ui/AppCard';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
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

  // Reload when screen comes into focus (e.g. after adding students)
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
    ? `${formatTime12h(batch.startTime)} - ${formatTime12h(batch.endTime)}`
    : null;

  const renderStudentItem = useCallback(
    ({ item }: { item: StudentListItem }) => (
      <AppCard style={styles.studentCard}>
        <View style={styles.studentInfo}>
          <Text style={styles.studentName} numberOfLines={1}>
            {item.fullName}
          </Text>
          <Text style={styles.studentFee}>{`\u20B9${item.monthlyFee}`}</Text>
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
            <Text style={styles.removeText}>Remove</Text>
          )}
        </Pressable>
      </AppCard>
    ),
    [handleRemove, removingId],
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

  const renderHeader = useCallback(
    () => (
      <View>
        {/* Batch info card */}
        <AppCard style={styles.infoCard}>
          {batch.profilePhotoUrl ? (
            <Image source={{ uri: batch.profilePhotoUrl }} style={styles.batchPhoto} />
          ) : null}
          <View style={styles.nameStatusRow}>
            <Text style={styles.batchName}>{batch.batchName}</Text>
            {batch.status === 'INACTIVE' && (
              <View style={styles.inactiveBadge}>
                <Text style={styles.inactiveBadgeText}>Inactive</Text>
              </View>
            )}
          </View>
          <Text style={styles.days}>{daysText}</Text>
          {timeSlotText && (
            <Text style={styles.days}>{timeSlotText}</Text>
          )}
          {batch.maxStudents != null && (
            <Text style={styles.days}>
              Capacity: {totalItemsRef.current} / {batch.maxStudents} students
            </Text>
          )}
          {batch.notes ? (
            <Text style={styles.notes}>{batch.notes}</Text>
          ) : null}
          <View style={styles.actionRow}>
            <Pressable onPress={handleEdit} style={styles.editButton} testID="edit-batch-button">
              <Text style={styles.editText}>Edit Batch</Text>
            </Pressable>
            {isOwner && (
              <Pressable onPress={handleDelete} style={styles.deleteButton} testID="delete-batch-button">
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            )}
          </View>
        </AppCard>

        {/* Student count + add button */}
        <View style={styles.studentHeader}>
          <Text style={styles.studentCount}>
            {totalItemsRef.current} {totalItemsRef.current === 1 ? 'student' : 'students'}
          </Text>
          <Pressable onPress={handleAddStudent} style={styles.addButton} testID="add-student-button">
            <Text style={styles.addButtonText}>Add Student</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Search students..."
          placeholderTextColor={colors.textDisabled}
          value={searchText}
          onChangeText={setSearchText}
          testID="batch-detail-search-input"
        />
      </View>
    ),
    [batch, daysText, isOwner, handleEdit, handleDelete, handleAddStudent, searchText],
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          testID="batch-students-list"
        />
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.base,
  },
  infoCard: {
    marginBottom: spacing.base,
  },
  batchPhoto: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    marginBottom: spacing.md,
    alignSelf: 'center',
  },
  nameStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  batchName: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    flex: 1,
  },
  inactiveBadge: {
    backgroundColor: colors.textDisabled,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginLeft: spacing.sm,
  },
  inactiveBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.white,
  },
  days: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  notes: {
    fontSize: fontSizes.base,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.base,
  },
  editButton: {
    alignSelf: 'flex-start',
  },
  editText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  deleteButton: {
    alignSelf: 'flex-start',
  },
  deleteText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.danger,
  },
  studentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  studentCount: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  addButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
  },
  addButtonText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.white,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: fontSizes.md,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  studentFee: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  removeButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginLeft: spacing.md,
  },
  removeText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.danger,
  },
  skeletons: {
    gap: spacing.sm,
  },
  footer: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: 80,
  },
});
