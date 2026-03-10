import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { BatchesStackParamList } from '../../navigation/BatchesStack';
import type { StudentListItem } from '../../../domain/student/student.types';
import { listStudents } from '../../../infra/student/student-api';
import { addStudentToBatch } from '../../../infra/batch/batch-api';
import { AppCard } from '../../components/ui/AppCard';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type AddRoute = RouteProp<BatchesStackParamList, 'AddStudentToBatch'>;

const PAGE_SIZE = 20;

export function AddStudentToBatchScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<AddRoute>();
  const batchId = route.params?.batchId ?? '';
  const existingStudentIds = route.params?.existingStudentIds ?? [];

  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set(existingStudentIds));
  const [addingId, setAddingId] = useState<string | null>(null);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStudents = useCallback(
    async (page: number, searchQuery: string, append = false) => {
      const result = await listStudents({ status: 'ACTIVE', search: searchQuery || undefined }, page, PAGE_SIZE);

      if (result.ok) {
        const data = result.value;
        setStudents((prev) => (append ? [...prev, ...data.data] : data.data));
        hasMoreRef.current = page < data.meta.totalPages;
        setError(null);
      } else {
        setError(result.error.message);
      }
    },
    [],
  );

  const loadInitial = useCallback(
    async (searchQuery: string) => {
      setLoading(true);
      pageRef.current = 1;
      await fetchStudents(1, searchQuery);
      setLoading(false);
    },
    [fetchStudents],
  );

  useEffect(() => {
    loadInitial('');
  }, [loadInitial]);

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearch(text);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        loadInitial(text);
      }, 300);
    },
    [loadInitial],
  );

  const fetchMore = useCallback(async () => {
    if (loadingMore || !hasMoreRef.current) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    pageRef.current = nextPage;
    await fetchStudents(nextPage, search, true);
    setLoadingMore(false);
  }, [loadingMore, fetchStudents, search]);

  const handleAdd = useCallback(
    async (student: StudentListItem) => {
      setAddingId(student.id);
      const result = await addStudentToBatch(batchId, student.id);
      if (result.ok) {
        setAddedIds((prev) => new Set(prev).add(student.id));
      } else {
        setError(result.error.message);
      }
      setAddingId(null);
    },
    [batchId],
  );

  const renderItem = useCallback(
    ({ item }: { item: StudentListItem }) => {
      const isAdded = addedIds.has(item.id);
      const isAdding = addingId === item.id;

      return (
        <AppCard style={isAdded ? { ...styles.studentCard, ...styles.studentCardAdded } : styles.studentCard}>
          <View style={styles.studentInfo}>
            <Text style={[styles.studentName, isAdded && styles.studentNameAdded]} numberOfLines={1}>
              {item.fullName}
            </Text>
            <Text style={styles.studentFee}>{`\u20B9${item.monthlyFee}`}</Text>
          </View>
          {isAdded ? (
            <Text style={styles.addedLabel}>Added</Text>
          ) : (
            <Pressable
              onPress={() => handleAdd(item)}
              disabled={isAdding}
              style={styles.addBtn}
              testID={`add-student-${item.id}`}
            >
              {isAdding ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.addBtnText}>Add</Text>
              )}
            </Pressable>
          )}
        </AppCard>
      );
    },
    [addedIds, addingId, handleAdd],
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

  return (
    <View style={styles.screen}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search students..."
          placeholderTextColor={colors.textDisabled}
          value={search}
          onChangeText={handleSearchChange}
          autoCapitalize="none"
          autoCorrect={false}
          testID="search-input"
        />
      </View>

      {error && <InlineError message={error} onRetry={() => loadInitial(search)} />}

      {loading ? (
        <View style={styles.skeletons}>
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </View>
      ) : (
        <FlatList
          data={students}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={<EmptyState message="No students found" />}
          ListFooterComponent={renderFooter}
          onEndReached={fetchMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.listContent}
          testID="add-student-list"
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
  searchContainer: {
    padding: spacing.base,
    paddingBottom: 0,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: fontSizes.base,
    color: colors.text,
  },
  skeletons: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  studentCardAdded: {
    opacity: 0.6,
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
  studentNameAdded: {
    color: colors.textDisabled,
  },
  studentFee: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  addedLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textDisabled,
    marginLeft: spacing.md,
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    marginLeft: spacing.md,
    minWidth: 60,
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.white,
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
