import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  StyleSheet,
} from 'react-native';
import { DatePickerInput } from '../../components/ui/DatePickerInput';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning';
import type { ExpenseCategory } from '../../../domain/expense/expense.types';
import { expenseCategoryListSchema } from '../../../domain/expense/expense.schemas';
import { saveExpenseUseCase } from '../../../application/expense/use-cases/save-expense.usecase';
import { deleteExpenseUseCase } from '../../../application/expense/use-cases/delete-expense.usecase';
import * as expenseApi from '../../../infra/expense/expense-api';
import { Screen } from '../../components/ui/Screen';
import { isValidDate, getTodayIST } from '../../../domain/common/date-utils';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'ExpenseForm'>;
type Route = RouteProp<MoreStackParamList, 'ExpenseForm'>;

function todayString(): string {
  return getTodayIST();
}

export function ExpenseFormScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { mode } = route.params;
  const existing = mode === 'edit' ? route.params.expense : undefined;

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '');
  const [date, setDate] = useState(existing?.date ?? todayString());
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  // Add category modal
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const mountedRef = useRef(true);

  const initialRef = useRef({ amount, date, categoryId });
  const isDirty = amount !== initialRef.current.amount ||
    date !== initialRef.current.date ||
    categoryId !== initialRef.current.categoryId;
  useUnsavedChangesWarning(isDirty && !saving);

  const loadCategories = useCallback(async () => {
    const result = await expenseApi.listCategories();
    if (!mountedRef.current) return;
    if (result.ok) {
      const parsed = expenseCategoryListSchema.safeParse(result.value);
      if (parsed.success) {
        setCategories(parsed.data.categories);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadCategories();
    return () => { mountedRef.current = false; };
  }, [loadCategories]);

  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      Alert.alert('Validation', 'Category name is required');
      return;
    }
    setAddingCategory(true);
    const result = await expenseApi.createCategory(trimmed);
    setAddingCategory(false);
    if (result.ok) {
      setCategoryId(result.value.id);
      setNewCategoryName('');
      setShowAddCategory(false);
      loadCategories();
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  const handleSave = async () => {
    if (!categoryId) {
      Alert.alert('Validation', 'Please select a category');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!isValidDate(date)) {
      Alert.alert('Validation', 'Enter a valid date (YYYY-MM-DD)');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Validation', 'Amount must be greater than zero');
      return;
    }

    setSaving(true);
    const result = await saveExpenseUseCase(
      { expenseApi },
      mode === 'create'
        ? { mode: 'create', categoryId, date, amount: parsedAmount, notes: notes || undefined }
        : {
            mode: 'edit',
            id: existing!.id,
            categoryId,
            date,
            amount: parsedAmount,
            notes: notes || undefined,
          },
    );
    setSaving(false);

    if (result.ok) {
      navigation.goBack();
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert('Delete Expense', 'Are you sure you want to delete this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteExpenseUseCase({ expenseApi }, existing.id);
          if (result.ok) {
            navigation.goBack();
          } else {
            Alert.alert('Error', result.error.message);
          }
        },
      },
    ]);
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Category */}
        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryRow}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryChip, categoryId === cat.id && styles.categoryChipActive]}
              onPress={() => setCategoryId(cat.id)}
              testID={`category-${cat.id}`}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  categoryId === cat.id && styles.categoryChipTextActive,
                ]}
              >
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.addCategoryChip}
            onPress={() => setShowAddCategory(true)}
            testID="add-category-button"
          >
            <Text style={styles.addCategoryText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {selectedCategory && (
          <Text style={styles.selectedCategoryLabel}>Selected: {selectedCategory.name}</Text>
        )}

        {/* Date */}
        <Text style={styles.label}>Date</Text>
        <DatePickerInput
          value={date}
          onChange={setDate}
          placeholder="Select date"
          testID="expense-date-input"
        />

        {/* Amount */}
        <Text style={styles.label}>Amount</Text>
        <View style={styles.amountRow}>
          <Text style={styles.currencyPrefix}>{'\u20B9'}</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="0"
            maxLength={10}
            testID="expense-amount-input"
          />
        </View>

        {/* Notes */}
        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Add notes..."
          multiline
          numberOfLines={3}
          maxLength={500}
          testID="expense-notes-input"
        />

        {/* Buttons */}
        {mode === 'edit' ? (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              testID="expense-delete-button"
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
              testID="expense-save-button"
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled, styles.fullWidth]}
            onPress={handleSave}
            disabled={saving}
            testID="expense-save-button"
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Add Expense'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Add Category Modal */}
      <Modal
        visible={showAddCategory}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddCategory(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Category</Text>
              <TouchableOpacity onPress={() => setShowAddCategory(false)} testID="close-add-category">
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="Category name"
              autoFocus
              maxLength={50}
              testID="new-category-input"
            />
            <TouchableOpacity
              style={[styles.saveButton, styles.fullWidth, addingCategory && styles.saveButtonDisabled]}
              onPress={handleAddCategory}
              disabled={addingCategory}
              testID="save-category-button"
            >
              <Text style={styles.saveButtonText}>
                {addingCategory ? 'Adding...' : 'Add Category'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  content: {
    padding: spacing.base,
  },
  label: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: spacing.base,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSizes.base,
    color: colors.text,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginRight: spacing.sm,
  },
  amountInput: {
    flex: 1,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    color: colors.white,
  },
  addCategoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addCategoryText: {
    fontSize: fontSizes.sm,
    color: colors.primary,
    fontWeight: fontWeights.medium,
  },
  selectedCategoryLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.base,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.white,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.base,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.danger,
  },
  fullWidth: {
    marginTop: spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  modalTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
  modalClose: {
    fontSize: fontSizes.xl,
    color: colors.textSecondary,
    padding: spacing.sm,
  },
});
