import React, { useState, useCallback, useMemo } from 'react';
import { ScrollView, View, Text, Switch, StyleSheet, Alert, Pressable } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { InlineError } from '../../components/ui/InlineError';
import type { EventType, TargetAudience } from '../../../domain/event/event.types';
import * as eventApi from '../../../infra/event/event-api';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type EditRoute = RouteProp<MoreStackParamList, 'EditEvent'>;

const EVENT_TYPES: { label: string; value: EventType }[] = [
  { label: 'Tournament', value: 'TOURNAMENT' },
  { label: 'Meeting', value: 'MEETING' },
  { label: 'Demo Class', value: 'DEMO_CLASS' },
  { label: 'Holiday', value: 'HOLIDAY' },
  { label: 'Annual Day', value: 'ANNUAL_DAY' },
  { label: 'Training Camp', value: 'TRAINING_CAMP' },
  { label: 'Other', value: 'OTHER' },
];

const AUDIENCES: { label: string; value: TargetAudience }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Students', value: 'STUDENTS' },
  { label: 'Staff', value: 'STAFF' },
  { label: 'Parents', value: 'PARENTS' },
];

export function EditEventScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation();
  const route = useRoute<EditRoute>();
  const event = route.params?.event;

  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [eventType, setEventType] = useState<EventType | ''>(event?.eventType as EventType ?? '');
  const [startDate, setStartDate] = useState(event?.startDate ?? '');
  const [endDate, setEndDate] = useState(event?.endDate ?? '');
  const [startTime, setStartTime] = useState(event?.startTime ?? '');
  const [endTime, setEndTime] = useState(event?.endTime ?? '');
  const [isAllDay, setIsAllDay] = useState(event?.isAllDay ?? false);
  const [location, setLocation] = useState(event?.location ?? '');
  const [targetAudience, setTargetAudience] = useState<TargetAudience | ''>(
    event?.targetAudience as TargetAudience ?? '',
  );

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!event?.id) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>Event data unavailable</Text>
      </View>
    );
  }

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Validation', 'Event title is required');
      return;
    }
    if (!startDate.trim()) {
      Alert.alert('Validation', 'Start date is required');
      return;
    }

    setSubmitting(true);
    setServerError(null);

    const result = await eventApi.updateEvent(event.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      eventType: eventType || undefined,
      startDate: startDate.trim(),
      endDate: endDate.trim() || undefined,
      startTime: isAllDay ? undefined : (startTime.trim() || undefined),
      endTime: isAllDay ? undefined : (endTime.trim() || undefined),
      isAllDay,
      location: location.trim() || undefined,
      targetAudience: targetAudience || undefined,
    });

    setSubmitting(false);

    if (result.ok) {
      navigation.goBack();
    } else {
      setServerError(result.error.message);
    }
  }, [title, description, eventType, startDate, endDate, startTime, endTime, isAllDay, location, targetAudience, event.id, navigation]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {serverError && <InlineError message={serverError} />}

      <Text style={styles.sectionTitle}>Event Details</Text>

      <Input label="Event Title" value={title} onChangeText={setTitle} testID="input-title" />

      <Text style={styles.label}>Event Type</Text>
      <View style={styles.chipRow}>
        {EVENT_TYPES.map((t) => (
          <Pressable
            key={t.value}
            style={[styles.chip, eventType === t.value && styles.chipActive]}
            onPress={() => setEventType(eventType === t.value ? '' : t.value)}
          >
            <Text style={[styles.chipText, eventType === t.value && styles.chipTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Input
        label="Description"
        value={description}
        onChangeText={setDescription}
        testID="input-description"
      />

      <Text style={styles.sectionTitle}>Date & Time</Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>All Day</Text>
        <Switch value={isAllDay} onValueChange={setIsAllDay} testID="switch-allDay" />
      </View>

      <Input label="Start Date (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} testID="input-startDate" />
      <Input label="End Date (YYYY-MM-DD, optional)" value={endDate} onChangeText={setEndDate} testID="input-endDate" />

      {!isAllDay && (
        <>
          <Input label="Start Time (HH:mm)" value={startTime} onChangeText={setStartTime} testID="input-startTime" />
          <Input label="End Time (HH:mm, optional)" value={endTime} onChangeText={setEndTime} testID="input-endTime" />
        </>
      )}

      <Text style={styles.sectionTitle}>Location & Audience</Text>

      <Input label="Location" value={location} onChangeText={setLocation} testID="input-location" />

      <Text style={styles.label}>Target Audience</Text>
      <View style={styles.chipRow}>
        {AUDIENCES.map((a) => (
          <Pressable
            key={a.value}
            style={[styles.chip, targetAudience === a.value && styles.chipActive]}
            onPress={() => setTargetAudience(targetAudience === a.value ? '' : a.value)}
          >
            <Text style={[styles.chipText, targetAudience === a.value && styles.chipTextActive]}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.submitContainer}>
        <Button
          title="Save Changes"
          onPress={handleSubmit}
          loading={submitting}
          testID="submit-button"
        />
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.base, paddingBottom: 40 },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.textMedium,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.base,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSizes.sm, color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  switchLabel: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.textMedium,
  },
  submitContainer: { marginTop: spacing.lg },
});
