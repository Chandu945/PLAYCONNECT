import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  Share,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import RNFS from 'react-native-fs';
import RNShare from 'react-native-share';
import type { StudentListItem, StudentStatus } from '../../../domain/student/student.types';
import * as studentApi from '../../../infra/student/student-api';
import { getAccessToken } from '../../../infra/http/api-client';
import { env } from '../../../infra/env';
import { useAuth } from '../../context/AuthContext';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  visible: boolean;
  student: StudentListItem;
  onClose: () => void;
  onEdit: () => void;
  onAssignBatch: () => void;
  onDeleted: () => void;
  onStatusChanged: () => void;
}

interface ActionItem {
  key: string;
  title: string;
  subtitle: string;
  iconColor: string;
  iconName: string;
  ownerOnly?: boolean;
  onPress: () => void;
}

export function StudentActionMenu({
  visible, student, onClose, onEdit, onAssignBatch, onDeleted, onStatusChanged,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  const handleDelete = () => {
    onClose();
    Alert.alert(
      'Delete Student',
      `Are you sure you want to delete ${student.fullName}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await studentApi.deleteStudent(student.id);
            if (result.ok) {
              onDeleted();
            } else {
              Alert.alert('Error', result.error.message);
            }
          },
        },
      ],
    );
  };

  const handleShareCredentials = async () => {
    onClose();
    const result = await studentApi.getStudentCredentials(student.id);
    if (result.ok) {
      try {
        await Share.share({ message: result.value.shareText });
      } catch {
        // User cancelled share
      }
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  const handleInviteParent = () => {
    onClose();
    Alert.alert(
      'Invite Parent',
      `This will create a parent login for ${student.fullName}'s guardian. The guardian must have an email and mobile number set.\n\nContinue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Invite',
          onPress: async () => {
            const result = await studentApi.inviteParent(student.id);
            if (result.ok) {
              const { parentEmail, tempPassword, isExistingUser } = result.value;
              if (isExistingUser) {
                Alert.alert(
                  'Parent Linked',
                  `${parentEmail} already has an account and has been linked to ${student.fullName}. They can log in with their existing password.`,
                );
              } else {
                Alert.alert(
                  'Parent Invited',
                  `A parent account has been created.\n\nLogin ID: ${parentEmail}\nTemporary Password: ${tempPassword}\n\nPlease share these credentials with the guardian.`,
                  [
                    { text: 'OK' },
                    {
                      text: 'Share',
                      onPress: async () => {
                        try {
                          await Share.share({
                            message: `Login ID: ${parentEmail}\nPassword: ${tempPassword}`,
                          });
                        } catch {
                          // User cancelled share
                        }
                      },
                    },
                  ],
                );
              }
            } else {
              Alert.alert('Error', result.error.message);
            }
          },
        },
      ],
    );
  };

  const handleGenerateDocument = async (docType: 'report' | 'registration-form' | 'id-card', label: string) => {
    onClose();
    const token = getAccessToken();
    if (!token) {
      Alert.alert('Error', 'Session expired. Please log in again.');
      return;
    }
    setGenerating(label);
    try {
      const path = studentApi.getStudentDocumentUrl(student.id, docType);
      const url = `${env.API_BASE_URL}${path}`;
      const destPath = `${RNFS.CachesDirectoryPath}/${docType}_${student.id}.pdf`;

      const response = await RNFS.downloadFile({
        fromUrl: url,
        toFile: destPath,
        connectionTimeout: 30_000,
        readTimeout: 30_000,
        headers: {
          Accept: 'application/pdf',
          Authorization: `Bearer ${token}`,
        },
      }).promise;

      if (response.statusCode === 200 && response.bytesWritten > 0) {
        await RNShare.open({
          url: `file://${destPath}`,
          type: 'application/pdf',
          title: label,
        }).catch(() => {});
        // Clean up temp file after share dialog closes
        RNFS.unlink(destPath).catch(() => {});
      } else if (response.statusCode === 401) {
        Alert.alert('Error', 'Session expired. Please log in again.');
      } else {
        Alert.alert('Error', 'Failed to generate document. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Failed to generate document. Check your connection and try again.');
    } finally {
      setGenerating(null);
    }
  };

  const actions: ActionItem[] = [
    {
      key: 'edit',
      title: 'Edit Student',
      subtitle: 'You can edit student details here',
      iconColor: colors.primary,
      iconName: 'pencil-outline',
      onPress: () => { onClose(); onEdit(); },
    },
    {
      key: 'batch',
      title: 'Assign Batch',
      subtitle: 'You can assign new batch here',
      iconColor: colors.primary,
      iconName: 'account-group-outline',
      onPress: () => { onClose(); onAssignBatch(); },
    },
    {
      key: 'status',
      title: 'Close / Reactivate',
      subtitle: 'Change student status (Active, Inactive, Left)',
      iconColor: colors.danger,
      iconName: 'swap-horizontal-circle-outline',
      ownerOnly: true,
      onPress: () => { onClose(); setShowStatusModal(true); },
    },
    {
      key: 'invite-parent',
      title: 'Invite Parent',
      subtitle: 'Create guardian login for this student',
      iconColor: colors.success,
      iconName: 'account-plus-outline',
      ownerOnly: true,
      onPress: handleInviteParent,
    },
    {
      key: 'share',
      title: 'Share Login Id And Password',
      subtitle: 'Share login credentials with guardian',
      iconColor: colors.primary,
      iconName: 'share-variant-outline',
      onPress: handleShareCredentials,
    },
    {
      key: 'delete',
      title: 'Delete Student',
      subtitle: 'You can delete student here',
      iconColor: colors.danger,
      iconName: 'delete-outline',
      ownerOnly: true,
      onPress: handleDelete,
    },
    {
      key: 'report',
      title: 'Generate Report',
      subtitle: 'Generate student attendance & fee report',
      iconColor: colors.success,
      iconName: 'chart-bar',
      ownerOnly: true,
      onPress: () => handleGenerateDocument('report', 'Generating Report...'),
    },
    {
      key: 'registration',
      title: 'Registration Form',
      subtitle: 'Generate student registration form',
      iconColor: colors.primary,
      iconName: 'file-document-outline',
      ownerOnly: true,
      onPress: () => handleGenerateDocument('registration-form', 'Generating Form...'),
    },
    {
      key: 'idcard',
      title: 'Generate ID Card',
      subtitle: 'Generate student ID card',
      iconColor: colors.primary,
      iconName: 'card-account-details-outline',
      ownerOnly: true,
      onPress: () => handleGenerateDocument('id-card', 'Generating ID Card...'),
    },
  ];

  const visibleActions = actions.filter((a) => !a.ownerOnly || isOwner);

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Student Actions</Text>
              <TouchableOpacity onPress={onClose} testID="action-menu-close">
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.scroll}>
              {visibleActions.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  style={styles.actionRow}
                  onPress={action.onPress}
                  testID={`action-${action.key}`}
                >
                  <View style={[styles.iconContainer, { backgroundColor: action.iconColor + '20' }]}>
                    {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                    <Icon name={action.iconName} size={22} color={action.iconColor} />
                  </View>
                  <View style={styles.actionText}>
                    <Text style={styles.actionTitle}>{action.title}</Text>
                    <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <StatusChangeModal
        visible={showStatusModal}
        student={student}
        onClose={() => setShowStatusModal(false)}
        onChanged={() => { setShowStatusModal(false); onStatusChanged(); }}
      />

      {generating && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>{generating}</Text>
          </View>
        </View>
      )}
    </>
  );
}

function StatusChangeModal({
  visible, student, onClose, onChanged,
}: { visible: boolean; student: StudentListItem; onClose: () => void; onChanged: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selectedStatus, setSelectedStatus] = useState<StudentStatus | ''>('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const options: { value: StudentStatus; label: string }[] = student.status === 'ACTIVE'
    ? [
        { value: 'INACTIVE', label: 'Mark as Inactive' },
        { value: 'LEFT', label: 'Mark as Left/Closed' },
      ]
    : [{ value: 'ACTIVE', label: 'Reactivate (Mark as Active)' }];

  const handleConfirm = async () => {
    if (!selectedStatus) {
      Alert.alert('Validation', 'Please select a status');
      return;
    }
    setSaving(true);
    const result = await studentApi.changeStudentStatus(student.id, {
      status: selectedStatus,
      reason: reason.trim() || undefined,
    });
    setSaving(false);
    if (result.ok) {
      setSelectedStatus('');
      setReason('');
      onChanged();
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Change Student Status</Text>
          <Text style={styles.currentStatus}>
            Current status: <Text style={styles.currentStatusValue}>{student.status}</Text>
          </Text>

          {(selectedStatus === 'INACTIVE' || selectedStatus === 'LEFT') && (
            <Text style={styles.warningText}>
              Changing status will stop fee generation for this student.
            </Text>
          )}

          <View style={styles.statusOptions}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.statusChip, selectedStatus === opt.value && styles.statusChipActive]}
                onPress={() => setSelectedStatus(opt.value)}
                testID={`status-option-${opt.value}`}
              >
                <Text style={[styles.statusChipText, selectedStatus === opt.value && styles.statusChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Reason (optional)</Text>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Family relocated"
            maxLength={500}
            testID="status-reason"
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} testID="status-cancel">
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, saving && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={saving}
              testID="status-confirm"
            >
              <Text style={styles.confirmButtonText}>{saving ? 'Saving...' : 'Confirm'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '80%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.base, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.primary },
  closeX: { fontSize: fontSizes.xl, color: colors.textSecondary, padding: spacing.xs },
  scroll: { paddingHorizontal: spacing.base, paddingBottom: spacing.xl },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconContainer: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionText: { flex: 1, marginLeft: spacing.md },
  actionTitle: { fontSize: fontSizes.base, fontWeight: fontWeights.semibold, color: colors.text },
  actionSubtitle: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 2 },
  // Status modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  modalContent: { backgroundColor: colors.bg, borderRadius: radius.lg, padding: spacing.xl },
  modalTitle: { fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.text, marginBottom: spacing.sm },
  currentStatus: { fontSize: fontSizes.base, color: colors.textSecondary, marginBottom: spacing.md },
  currentStatusValue: { fontWeight: fontWeights.semibold, color: colors.text },
  warningText: { fontSize: fontSizes.sm, color: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  statusChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  statusChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusChipText: { fontSize: fontSizes.sm, color: colors.textSecondary },
  statusChipTextActive: { color: colors.white },
  label: { fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: fontSizes.base, color: colors.text },
  modalButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  cancelButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.base, alignItems: 'center' },
  cancelButtonText: { fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textSecondary },
  confirmButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.base, alignItems: 'center' },
  confirmButtonDisabled: { opacity: 0.6 },
  confirmButtonText: { fontSize: fontSizes.base, fontWeight: fontWeights.semibold, color: colors.white },
  // Loading overlay
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  loadingBox: { backgroundColor: colors.bg, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  loadingText: { fontSize: fontSizes.base, color: colors.textSecondary },
});
