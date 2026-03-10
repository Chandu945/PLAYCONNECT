import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import type { EventDetail as EventDetailType, EventStatus } from '../../../domain/event/event.types';
import * as eventApi from '../../../infra/event/event-api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { InlineError } from '../../components/ui/InlineError';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type DetailRoute = RouteProp<MoreStackParamList, 'EventDetail'>;

function getStatusColors(colors: Colors): Record<string, { bg: string; text: string }> {
  return {
    UPCOMING: { bg: colors.infoBg, text: colors.infoText },
    ONGOING: { bg: colors.successBg, text: colors.successText },
    COMPLETED: { bg: '#f1f5f9', text: colors.textSecondary },
    CANCELLED: { bg: colors.dangerBg, text: colors.dangerText },
  };
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime12(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h!, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

type Nav = NativeStackNavigationProp<MoreStackParamList, 'EventDetail'>;

export function EventDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const STATUS_COLORS = useMemo(() => getStatusColors(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const route = useRoute<DetailRoute>();
  const eventId = route.params?.eventId ?? '';
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const [event, setEvent] = useState<EventDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const mountedRef = useRef(true);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await eventApi.getEventDetail(eventId);
    if (!mountedRef.current) return;
    if (result.ok) {
      setEvent(result.value);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    mountedRef.current = true;
    fetchDetail();
    return () => { mountedRef.current = false; };
  }, [fetchDetail]);

  const handleStatusChange = useCallback((newStatus: EventStatus, label: string) => {
    Alert.alert(
      label,
      `Are you sure you want to ${label.toLowerCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setActionLoading(true);
            const result = await eventApi.changeEventStatus(eventId, newStatus);
            setActionLoading(false);
            if (result.ok) {
              fetchDetail();
            } else {
              Alert.alert('Error', result.error.message);
            }
          },
        },
      ],
    );
  }, [eventId, fetchDetail]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            const result = await eventApi.deleteEvent(eventId);
            setActionLoading(false);
            if (result.ok) {
              navigation.goBack();
            } else {
              Alert.alert('Error', result.error.message);
            }
          },
        },
      ],
    );
  }, [eventId, navigation]);

  const handleEdit = useCallback(() => {
    if (!event) return;
    navigation.navigate('EditEvent', { event });
  }, [event, navigation]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <InlineError message={error} onRetry={fetchDetail} />
      </View>
    );
  }

  if (!event) return null;

  const statusStyle = STATUS_COLORS[event.status] ?? STATUS_COLORS['UPCOMING']!;
  const canEdit = isOwner || event.createdBy === user?.id;
  const showActions = event.status !== 'COMPLETED' && event.status !== 'CANCELLED';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{event.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>{event.status}</Text>
        </View>
      </View>

      {event.eventType && (
        <Text style={styles.eventType}>{event.eventType.replace(/_/g, ' ')}</Text>
      )}

      <View style={styles.infoSection}>
        <InfoRow label="Date" value={
          event.endDate && event.endDate !== event.startDate
            ? `${formatFullDate(event.startDate)} - ${formatFullDate(event.endDate)}`
            : formatFullDate(event.startDate)
        } />

        <InfoRow
          label="Time"
          value={
            event.isAllDay
              ? 'All Day'
              : [formatTime12(event.startTime), formatTime12(event.endTime)]
                  .filter(Boolean)
                  .join(' - ') || 'Not set'
          }
        />

        {event.location && <InfoRow label="Location" value={event.location} />}
        {event.targetAudience && <InfoRow label="Target Audience" value={event.targetAudience} />}
      </View>

      {event.description && (
        <View style={styles.descSection}>
          <Text style={styles.descTitle}>Description</Text>
          <Text style={styles.descText}>{event.description}</Text>
        </View>
      )}

      <Text style={styles.meta}>
        Created: {new Date(event.createdAt).toLocaleDateString('en-IN')}
      </Text>

      {/* Action buttons */}
      <View style={styles.actions}>
        {canEdit && (
          <Button title="Edit" variant="secondary" onPress={handleEdit} testID="edit-button" />
        )}

        {isOwner && showActions && (
          <>
            <View style={styles.actionGap} />
            <Button
              title="Mark as Completed"
              variant="secondary"
              onPress={() => handleStatusChange('COMPLETED', 'Mark as Completed')}
              loading={actionLoading}
              testID="complete-button"
            />
            <View style={styles.actionGap} />
            <Button
              title="Cancel Event"
              variant="secondary"
              onPress={() => handleStatusChange('CANCELLED', 'Cancel Event')}
              loading={actionLoading}
              testID="cancel-event-button"
            />
          </>
        )}

        {isOwner && event.status === 'CANCELLED' && (
          <>
            <View style={styles.actionGap} />
            <Button
              title="Reinstate Event"
              variant="secondary"
              onPress={() => handleStatusChange('UPCOMING', 'Reinstate Event')}
              loading={actionLoading}
              testID="reinstate-button"
            />
          </>
        )}

        {isOwner && (
          <>
            <View style={styles.actionGap} />
            <Button
              title="Delete Event"
              variant="secondary"
              onPress={handleDelete}
              loading={actionLoading}
              testID="delete-button"
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.base,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginRight: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  eventType: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  infoSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    width: 120,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },
  infoValue: {
    flex: 1,
    fontSize: fontSizes.base,
    color: colors.text,
  },
  descSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  descTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  descText: {
    fontSize: fontSizes.base,
    color: colors.textMedium,
    lineHeight: 22,
  },
  meta: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  actions: {
    marginTop: spacing.md,
  },
  actionGap: {
    height: spacing.sm,
  },
});
