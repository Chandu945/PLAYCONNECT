import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { DatePickerInput } from '../../components/ui/DatePickerInput';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import type { EnquiryDetail, ClosureReason } from '../../../domain/enquiry/enquiry.types';
import * as enquiryApi from '../../../infra/enquiry/enquiry-api';
import { getTodayIST } from '../../../domain/common/date-utils';
import { enquiryDetailSchema } from '../../../domain/enquiry/enquiry.schemas';
import { useAuth } from '../../context/AuthContext';
import { Screen } from '../../components/ui/Screen';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'EnquiryDetail'>;
type Route = RouteProp<MoreStackParamList, 'EnquiryDetail'>;

export function EnquiryDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const enquiryId = route.params?.enquiryId ?? '';

  const [enquiry, setEnquiry] = useState<EnquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const mountedRef = useRef(true);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    const result = await enquiryApi.getEnquiryDetail(enquiryId);
    if (!mountedRef.current) return;
    if (result.ok) {
      const parsed = enquiryDetailSchema.safeParse(result.value);
      if (parsed.success) {
        setEnquiry(parsed.data as EnquiryDetail);
      }
    }
    setLoading(false);
  }, [enquiryId]);

  useEffect(() => {
    mountedRef.current = true;
    loadDetail();
    return () => { mountedRef.current = false; };
  }, [loadDetail]);

  // Refresh when returning from EditEnquiry
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      loadDetail();
    }, [loadDetail]),
  );

  const isOverdue = (() => {
    if (!enquiry?.nextFollowUpDate) return false;
    return enquiry.nextFollowUpDate < getTodayIST();
  })();

  if (loading || !enquiry) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.prospectName}>{enquiry.prospectName}</Text>
          <View style={[styles.statusBadge, enquiry.status === 'ACTIVE' ? styles.activeBadge : styles.closedBadge]}>
            <Text style={[styles.statusText, enquiry.status === 'ACTIVE' ? styles.activeText : styles.closedText]}>
              {enquiry.status}
            </Text>
          </View>
        </View>

        {/* Contact Info */}
        <View style={styles.section}>
          <InfoRow label="Mobile" value={enquiry.mobileNumber} />
          {enquiry.whatsappNumber && <InfoRow label="WhatsApp" value={enquiry.whatsappNumber} />}
          {enquiry.email && <InfoRow label="Email" value={enquiry.email} />}
          {enquiry.guardianName && <InfoRow label="Guardian" value={enquiry.guardianName} />}
          {enquiry.address && <InfoRow label="Address" value={enquiry.address} />}
        </View>

        {/* Enquiry Info */}
        <View style={styles.section}>
          {enquiry.interestedIn && <InfoRow label="Interested In" value={enquiry.interestedIn} />}
          {enquiry.source && <InfoRow label="Source" value={enquiry.source.replace('_', ' ')} />}
          {enquiry.nextFollowUpDate && (
            <InfoRow
              label="Next Follow-Up"
              value={`${new Date(enquiry.nextFollowUpDate).toLocaleDateString('en-IN')}${isOverdue ? ' (OVERDUE)' : ''}`}
              valueStyle={isOverdue ? styles.overdueValue : undefined}
            />
          )}
        </View>

        {/* Notes */}
        {enquiry.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesText}>{enquiry.notes}</Text>
          </View>
        )}

        {/* Closure Info */}
        {enquiry.closureReason && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Closure</Text>
            <InfoRow label="Reason" value={enquiry.closureReason.replace('_', ' ')} />
          </View>
        )}

        {/* Follow-Up History */}
        <View style={styles.section}>
          <View style={styles.followUpHeader}>
            <Text style={styles.sectionTitle}>Follow-Up History ({enquiry.followUps.length})</Text>
            {enquiry.status === 'ACTIVE' && (
              <TouchableOpacity onPress={() => setShowFollowUpModal(true)} testID="add-followup-btn">
                <Text style={styles.addFollowUpLink}>+ Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {enquiry.followUps.length === 0 ? (
            <Text style={styles.emptyFollowUp}>No follow-ups recorded yet</Text>
          ) : (
            [...enquiry.followUps].reverse().map((f) => (
              <View key={f.id} style={styles.followUpCard}>
                <Text style={styles.followUpDate}>
                  {new Date(f.date).toLocaleDateString('en-IN')}
                </Text>
                <Text style={styles.followUpNotes}>{f.notes}</Text>
                {f.nextFollowUpDate && (
                  <Text style={styles.followUpNext}>
                    Next: {new Date(f.nextFollowUpDate).toLocaleDateString('en-IN')}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Actions */}
        {enquiry.status === 'ACTIVE' && (
          <>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => navigation.navigate('EditEnquiry', { enquiry })}
              testID="edit-enquiry-btn"
            >
              <Text style={styles.editButtonText}>Edit Enquiry</Text>
            </TouchableOpacity>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.followUpButton}
                onPress={() => setShowFollowUpModal(true)}
                testID="add-followup-action"
              >
                <Text style={styles.followUpButtonText}>Add Follow-Up</Text>
              </TouchableOpacity>
              {isOwner && (
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowCloseModal(true)}
                  testID="close-enquiry-btn"
                >
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              )}
              {isOwner && (
                <TouchableOpacity
                  style={styles.convertButton}
                  onPress={() => setShowConvertModal(true)}
                  testID="convert-to-student-btn"
                >
                  <Text style={styles.convertButtonText}>Convert</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Add Follow-Up Modal */}
      <AddFollowUpModal
        visible={showFollowUpModal}
        enquiryId={enquiryId}
        onClose={() => setShowFollowUpModal(false)}
        onSaved={() => { setShowFollowUpModal(false); loadDetail(); }}
      />

      {/* Close Enquiry Modal */}
      <CloseEnquiryModal
        visible={showCloseModal}
        enquiryId={enquiryId}
        onClose={() => setShowCloseModal(false)}
        onClosed={() => { setShowCloseModal(false); loadDetail(); }}
      />

      {/* Convert to Student Modal */}
      <ConvertToStudentModal
        visible={showConvertModal}
        enquiryId={enquiryId}
        onClose={() => setShowConvertModal(false)}
        onConverted={() => { setShowConvertModal(false); loadDetail(); }}
      />
    </Screen>
  );
}

function InfoRow({ label, value, valueStyle }: { label: string; value: string; valueStyle?: object }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueStyle]}>{value}</Text>
    </View>
  );
}

function AddFollowUpModal({
  visible, enquiryId, onClose, onSaved,
}: { visible: boolean; enquiryId: string; onClose: () => void; onSaved: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!date || !notes.trim()) {
      Alert.alert('Validation', 'Date and notes are required');
      return;
    }
    setSaving(true);
    const result = await enquiryApi.addFollowUp(enquiryId, {
      date,
      notes: notes.trim(),
      nextFollowUpDate: nextDate || undefined,
    });
    setSaving(false);
    if (result.ok) {
      setDate(''); setNotes(''); setNextDate('');
      onSaved();
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Add Follow-Up</Text>

          <Text style={styles.label}>Date *</Text>
          <DatePickerInput value={date} onChange={setDate} placeholder="Select follow-up date" testID="followup-date" />

          <Text style={styles.label}>Notes *</Text>
          <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} placeholder="What was discussed?" multiline testID="followup-notes" />

          <Text style={styles.label}>Next Follow-Up Date</Text>
          <DatePickerInput value={nextDate} onChange={setNextDate} placeholder="Select next follow-up" testID="followup-next-date" />

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} testID="followup-cancel">
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving} testID="followup-save">
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CloseEnquiryModal({
  visible, enquiryId, onClose, onClosed,
}: { visible: boolean; enquiryId: string; onClose: () => void; onClosed: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [reason, setReason] = useState<ClosureReason | ''>('');
  const [saving, setSaving] = useState(false);

  const reasons: { value: ClosureReason; label: string }[] = [
    { value: 'CONVERTED', label: 'Converted to Student' },
    { value: 'NOT_INTERESTED', label: 'Not Interested' },
    { value: 'OTHER', label: 'Other' },
  ];

  const handleClose = async () => {
    if (!reason) {
      Alert.alert('Validation', 'Please select a closure reason');
      return;
    }
    setSaving(true);
    const result = await enquiryApi.closeEnquiry(enquiryId, { closureReason: reason });
    setSaving(false);
    if (result.ok) {
      setReason('');
      onClosed();
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Close Enquiry</Text>
          <Text style={styles.label}>Reason</Text>
          <View style={styles.reasonRow}>
            {reasons.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.reasonChip, reason === r.value && styles.reasonChipActive]}
                onPress={() => setReason(r.value)}
                testID={`reason-${r.value}`}
              >
                <Text style={[styles.reasonChipText, reason === r.value && styles.reasonChipTextActive]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} testID="close-cancel">
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dangerBtn, saving && styles.saveBtnDisabled]}
              onPress={handleClose}
              disabled={saving}
              testID="close-confirm"
            >
              <Text style={styles.saveBtnText}>{saving ? 'Closing...' : 'Close Enquiry'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ConvertToStudentModal({
  visible, enquiryId, onClose, onConverted,
}: { visible: boolean; enquiryId: string; onClose: () => void; onConverted: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [joiningDate, setJoiningDate] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER' | ''>('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [saving, setSaving] = useState(false);

  const genders: { value: 'MALE' | 'FEMALE' | 'OTHER'; label: string }[] = [
    { value: 'MALE', label: 'Male' },
    { value: 'FEMALE', label: 'Female' },
    { value: 'OTHER', label: 'Other' },
  ];

  const handleConvert = async () => {
    if (!joiningDate || !monthlyFee || !dateOfBirth || !gender || !addressLine1 || !city || !state || !pincode) {
      Alert.alert('Validation', 'All fields are required');
      return;
    }
    const fee = parseFloat(monthlyFee);
    if (isNaN(fee) || fee <= 0) {
      Alert.alert('Validation', 'Monthly fee must be a positive number');
      return;
    }

    setSaving(true);
    const result = await enquiryApi.convertToStudent(enquiryId, {
      joiningDate,
      monthlyFee: fee,
      dateOfBirth,
      gender,
      addressLine1,
      city,
      state,
      pincode,
    });
    setSaving(false);

    if (result.ok) {
      Alert.alert('Success', 'Enquiry converted to student successfully');
      setJoiningDate(''); setMonthlyFee(''); setDateOfBirth(''); setGender('');
      setAddressLine1(''); setCity(''); setState(''); setPincode('');
      onConverted();
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <ScrollView contentContainerStyle={styles.convertModalScroll}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Convert to Student</Text>

            <Text style={styles.label}>Joining Date *</Text>
            <DatePickerInput value={joiningDate} onChange={setJoiningDate} placeholder="Select joining date" testID="convert-joining-date" />

            <Text style={styles.label}>Monthly Fee *</Text>
            <TextInput style={styles.input} value={monthlyFee} onChangeText={setMonthlyFee} placeholder="1500" keyboardType="numeric" testID="convert-monthly-fee" />

            <Text style={styles.label}>Date of Birth *</Text>
            <DatePickerInput value={dateOfBirth} onChange={setDateOfBirth} placeholder="Select date of birth" maximumDate={new Date()} testID="convert-dob" />

            <Text style={styles.label}>Gender *</Text>
            <View style={styles.reasonRow}>
              {genders.map((g) => (
                <TouchableOpacity
                  key={g.value}
                  style={[styles.reasonChip, gender === g.value && styles.reasonChipActive]}
                  onPress={() => setGender(g.value)}
                  testID={`convert-gender-${g.value}`}
                >
                  <Text style={[styles.reasonChipText, gender === g.value && styles.reasonChipTextActive]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Address Line 1 *</Text>
            <TextInput style={styles.input} value={addressLine1} onChangeText={setAddressLine1} placeholder="Street address" testID="convert-address" />

            <Text style={styles.label}>City *</Text>
            <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City" testID="convert-city" />

            <Text style={styles.label}>State *</Text>
            <TextInput style={styles.input} value={state} onChangeText={setState} placeholder="State" testID="convert-state" />

            <Text style={styles.label}>Pincode *</Text>
            <TextInput style={styles.input} value={pincode} onChangeText={setPincode} placeholder="560001" keyboardType="numeric" testID="convert-pincode" />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose} testID="convert-cancel">
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleConvert}
                disabled={saving}
                testID="convert-confirm"
              >
                <Text style={styles.saveBtnText}>{saving ? 'Converting...' : 'Convert'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.base },
  prospectName: { fontSize: fontSizes['2xl'], fontWeight: fontWeights.bold, color: colors.text, flex: 1 },
  statusBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.sm },
  activeBadge: { backgroundColor: colors.successBg },
  closedBadge: { backgroundColor: colors.bgSubtle },
  statusText: { fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },
  activeText: { color: colors.successText },
  closedText: { color: colors.textSecondary },
  section: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.base, marginBottom: spacing.md },
  sectionTitle: { fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.text, marginBottom: spacing.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  infoLabel: { fontSize: fontSizes.base, color: colors.textSecondary },
  infoValue: { fontSize: fontSizes.base, color: colors.text, fontWeight: fontWeights.medium, flex: 1, textAlign: 'right' },
  overdueValue: { color: colors.danger },
  notesText: { fontSize: fontSizes.base, color: colors.textLight, lineHeight: 22 },
  followUpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addFollowUpLink: { fontSize: fontSizes.base, color: colors.primary, fontWeight: fontWeights.semibold },
  emptyFollowUp: { fontSize: fontSizes.base, color: colors.textSecondary, fontStyle: 'italic' },
  followUpCard: { backgroundColor: colors.bgSubtle, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  followUpDate: { fontSize: fontSizes.base, fontWeight: fontWeights.semibold, color: colors.text },
  followUpNotes: { fontSize: fontSizes.base, color: colors.textLight, marginTop: spacing.xs },
  followUpNext: { fontSize: fontSizes.sm, color: colors.primary, marginTop: spacing.xs },
  editButton: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.base, alignItems: 'center', marginTop: spacing.base, marginBottom: spacing.sm },
  editButtonText: { fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.primary },
  actionsRow: { flexDirection: 'row', gap: spacing.md },
  followUpButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.base, alignItems: 'center' },
  followUpButtonText: { fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.white },
  closeButton: { flex: 1, backgroundColor: colors.dangerBg, borderRadius: radius.md, padding: spacing.base, alignItems: 'center' },
  closeButtonText: { fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.danger },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  modalContent: { backgroundColor: colors.bg, borderRadius: radius.lg, padding: spacing.xl },
  modalTitle: { fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.text, marginBottom: spacing.base },
  label: { fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: fontSizes.base, color: colors.text },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  cancelButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.base, alignItems: 'center' },
  cancelButtonText: { fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textSecondary },
  saveBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.base, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: fontSizes.base, fontWeight: fontWeights.semibold, color: colors.white },
  dangerBtn: { flex: 1, backgroundColor: colors.danger, borderRadius: radius.md, padding: spacing.base, alignItems: 'center' },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reasonChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  reasonChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  reasonChipText: { fontSize: fontSizes.sm, color: colors.textSecondary },
  reasonChipTextActive: { color: colors.white },
  convertButton: { flex: 1, backgroundColor: colors.successBg, borderRadius: radius.md, padding: spacing.base, alignItems: 'center' },
  convertButtonText: { fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.successText },
  convertModalScroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
});
