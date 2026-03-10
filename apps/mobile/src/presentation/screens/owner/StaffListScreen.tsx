import React, { useState, useCallback } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StaffStackParamList } from '../../navigation/StaffStack';
import type { StaffListItem, StaffStatus } from '../../../domain/staff/staff.types';
import { useStaff } from '../../../application/staff/use-staff';
import { listStaff, setStaffStatus } from '../../../infra/staff/staff-api';
import { setStaffStatusUseCase } from '../../../application/staff/use-cases/set-staff-status.usecase';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmSheet } from '../../components/ui/ConfirmSheet';
import { Fab } from '../../components/ui/Fab';
import { Button } from '../../components/ui/Button';
import { StaffRow } from '../../components/staff/StaffRow';
import { colors, spacing } from '../../theme';

type Nav = NativeStackNavigationProp<StaffStackParamList, 'StaffList'>;

const staffApiRef = { listStaff };
const statusApiRef = { setStaffStatus };

export function StaffListScreen() {
  const navigation = useNavigation<Nav>();
  const { items, loading, loadingMore, error, refetch, fetchMore } = useStaff(staffApiRef);
  const [refreshing, setRefreshing] = useState(false);

  // Refresh list when screen comes back into focus (e.g. after add/edit)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const [toggleTarget, setToggleTarget] = useState<StaffListItem | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleToggleStatus = useCallback(async () => {
    if (!toggleTarget) return;
    setToggling(true);
    setToggleError(null);

    const newStatus: StaffStatus = toggleTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const result = await setStaffStatusUseCase(
      { staffApi: statusApiRef },
      toggleTarget.id,
      newStatus,
    );

    setToggling(false);

    if (result.ok) {
      setToggleTarget(null);
      refetch();
    } else {
      setToggleError(result.error.message);
    }
  }, [toggleTarget, refetch]);

  const handleRowPress = useCallback(
    (staff: StaffListItem) => {
      navigation.navigate('StaffForm', { mode: 'edit', staff });
    },
    [navigation],
  );

  const handleAdd = useCallback(() => {
    navigation.navigate('StaffForm', { mode: 'create' });
  }, [navigation]);

  const handleStaffAttendance = useCallback(() => {
    navigation.navigate('StaffAttendance');
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: StaffListItem }) => (
      <StaffRow
        staff={item}
        onPress={() => handleRowPress(item)}
        onToggleStatus={() => setToggleTarget(item)}
      />
    ),
    [handleRowPress],
  );

  const keyExtractor = useCallback((item: StaffListItem) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [loadingMore]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <SectionHeader title="Staff" />
        <View style={styles.attendanceButton}>
          <Button
            title="Staff Attendance"
            variant="secondary"
            onPress={handleStaffAttendance}
            testID="staff-attendance-button"
          />
        </View>
      </View>

      {error && <InlineError message={error.message} onRetry={refetch} />}

      {loading && !refreshing ? (
        <View testID="skeleton-container" style={styles.skeletons}>
          <SkeletonTile />
          <SkeletonTile />
        </View>
      ) : !loading && items.length === 0 ? (
        <EmptyState message="No staff members" />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onEndReached={fetchMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          testID="staff-list"
        />
      )}

      <Fab label="+ Add Staff" onPress={handleAdd} testID="add-staff-fab" />

      <ConfirmSheet
        visible={toggleTarget !== null}
        title={toggleTarget?.status === 'ACTIVE' ? 'Deactivate Staff' : 'Activate Staff'}
        message={
          toggleError
            ? toggleError
            : toggleTarget?.status === 'ACTIVE'
              ? `Deactivate ${toggleTarget?.fullName}? They will be logged out immediately.`
              : `Activate ${toggleTarget?.fullName}?`
        }
        confirmLabel={toggleTarget?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        confirmVariant={toggleTarget?.status === 'ACTIVE' ? 'danger' : 'primary'}
        onConfirm={handleToggleStatus}
        onCancel={() => {
          setToggleTarget(null);
          setToggleError(null);
        }}
        loading={toggling}
        testID="status-confirm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    padding: spacing.base,
    paddingBottom: 0,
  },
  attendanceButton: {
    marginTop: spacing.sm,
  },
  skeletons: {
    padding: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: 80,
  },
  footer: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
});
