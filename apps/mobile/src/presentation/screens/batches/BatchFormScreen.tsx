import React, { useState, useCallback, useMemo } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { BatchesStackParamList } from '../../navigation/BatchesStack';
import { Input } from '../../components/ui/Input';
import { TextArea } from '../../components/ui/TextArea';
import { Button } from '../../components/ui/Button';
import { InlineError } from '../../components/ui/InlineError';
import { DaysPicker } from '../../components/batches/DaysPicker';
import {
  validateBatchForm,
  saveBatchUseCase,
} from '../../../application/batch/use-cases/save-batch.usecase';
import { createBatch, updateBatch } from '../../../infra/batch/batch-api';
import type { Weekday, CreateBatchRequest } from '../../../domain/batch/batch.types';
import { spacing, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type FormRoute = RouteProp<BatchesStackParamList, 'BatchForm'>;

const saveApi = { createBatch, updateBatch };

export function BatchFormScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation();
  const route = useRoute<FormRoute>();
  const { mode, batch } = route.params;

  const [batchName, setBatchName] = useState(batch?.batchName ?? '');
  const [days, setDays] = useState<Weekday[]>(batch?.days ?? []);
  const [notes, setNotes] = useState(batch?.notes ?? '');
  const [startTime, setStartTime] = useState(batch?.startTime ?? '');
  const [endTime, setEndTime] = useState(batch?.endTime ?? '');
  const [maxStudents, setMaxStudents] = useState(
    batch?.maxStudents != null ? String(batch.maxStudents) : '',
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const fields: Record<string, string> = {
      batchName,
      days: days.join(','),
      notes,
      startTime,
      endTime,
      maxStudents,
    };

    const errors = validateBatchForm(fields);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const data: CreateBatchRequest = {
      batchName: batchName.trim(),
      days: days.length > 0 ? days : undefined,
      notes: notes.trim() || null,
      startTime: startTime.trim() || null,
      endTime: endTime.trim() || null,
      maxStudents: maxStudents.trim() ? parseInt(maxStudents.trim(), 10) : null,
    };

    setSubmitting(true);
    setServerError(null);

    const result = await saveBatchUseCase({ saveApi }, mode, batch?.id, data);

    setSubmitting(false);

    if (result.ok) {
      navigation.goBack();
    } else {
      setServerError(result.error.message);
    }
  }, [batchName, days, notes, startTime, endTime, maxStudents, mode, batch?.id, navigation]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {serverError && <InlineError message={serverError} />}

      <View style={styles.formCard}>
        <Input
          label="Batch Name"
          value={batchName}
          onChangeText={setBatchName}
          error={fieldErrors['batchName']}
          maxLength={50}
          testID="input-batchName"
        />

        <DaysPicker
          selected={days}
          onChange={setDays}
          error={fieldErrors['days']}
        />

        <Input
          label="Start Time (optional)"
          value={startTime}
          onChangeText={setStartTime}
          error={fieldErrors['startTime']}
          placeholder="HH:MM, e.g. 06:00"
          testID="input-startTime"
        />

        <Input
          label="End Time (optional)"
          value={endTime}
          onChangeText={setEndTime}
          error={fieldErrors['endTime']}
          placeholder="HH:MM, e.g. 07:30"
          testID="input-endTime"
        />

        <Input
          label="Max Students (optional)"
          value={maxStudents}
          onChangeText={setMaxStudents}
          error={fieldErrors['maxStudents']}
          placeholder="e.g. 30, leave empty for unlimited"
          keyboardType="numeric"
          testID="input-maxStudents"
        />

        <TextArea
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          error={fieldErrors['notes']}
          testID="input-notes"
        />
      </View>

      <View style={styles.submitContainer}>
        <Button
          title={mode === 'create' ? 'Create Batch' : 'Save Changes'}
          onPress={handleSubmit}
          loading={submitting}
          testID="submit-button"
        />
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.base,
    paddingBottom: 40,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    ...shadows.sm,
  },
  submitContainer: {
    marginTop: spacing.lg,
  },
});
