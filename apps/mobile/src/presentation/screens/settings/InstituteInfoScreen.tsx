import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useInstituteInfo } from '../../../application/settings/use-institute-info';
import { instituteInfoApi, uploadInstituteImage, deleteInstituteImage } from '../../../infra/settings/institute-info-api';
import { Screen } from '../../components/ui/Screen';
import { colors, spacing, fontSizes, fontWeights, radius } from '../../theme';

export function InstituteInfoScreen() {
  const { info, loading, saving, error, update, refetch } = useInstituteInfo(instituteInfoApi);

  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [uploading, setUploading] = useState<'signature' | 'qrcode' | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Sync form state when data loads
  useEffect(() => {
    if (info && !initialized) {
      if (info.bankDetails) {
        setAccountHolderName(info.bankDetails.accountHolderName);
        setAccountNumber(info.bankDetails.accountNumber);
        setIfscCode(info.bankDetails.ifscCode);
        setBankName(info.bankDetails.bankName);
        setBranchName(info.bankDetails.branchName);
      }
      setUpiId(info.upiId ?? '');
      setInitialized(true);
    }
  }, [info, initialized]);

  const handleSaveBankDetails = async () => {
    const hasBankFields = accountHolderName || accountNumber || ifscCode || bankName || branchName;

    const bankDetails = hasBankFields
      ? {
          accountHolderName: accountHolderName.trim(),
          accountNumber: accountNumber.trim(),
          ifscCode: ifscCode.trim().toUpperCase(),
          bankName: bankName.trim(),
          branchName: branchName.trim(),
        }
      : null;

    const err = await update({
      bankDetails,
      upiId: upiId.trim() || null,
    });

    if (err) {
      Alert.alert('Error', err.message);
    } else {
      Alert.alert('Success', 'Institute information saved successfully');
    }
  };

  const handlePickImage = useCallback(
    async (imageType: 'signature' | 'qrcode') => {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1024,
        maxHeight: 1024,
      });

      if (result.didCancel || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.uri || !asset.fileName || !asset.type) return;

      setUploading(imageType);
      const uploadResult = await uploadInstituteImage(
        imageType,
        asset.uri,
        asset.fileName,
        asset.type,
      );
      setUploading(null);

      if (uploadResult.ok) {
        refetch();
      } else {
        Alert.alert('Upload Error', uploadResult.error.message);
      }
    },
    [refetch],
  );

  const handleDeleteImage = useCallback(
    (imageType: 'signature' | 'qrcode') => {
      const label = imageType === 'signature' ? 'signature/stamp' : 'QR code';
      Alert.alert(`Delete ${label}`, `Are you sure you want to delete this ${label}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteInstituteImage(imageType);
            if (result.ok) {
              refetch();
            } else {
              Alert.alert('Error', result.error.message);
            }
          },
        },
      ]);
    },
    [refetch],
  );

  if (loading) {
    return (
      <Screen>
        <View style={styles.center} testID="institute-loading">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading institute info...</Text>
        </View>
      </Screen>
    );
  }

  if (error && !info) {
    return (
      <Screen>
        <View style={styles.center} testID="institute-error">
          <Text style={styles.errorText}>{error.message}</Text>
          <Text style={styles.retryLink} onPress={refetch} testID="institute-retry">
            Tap to retry
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Signature/Stamp Upload */}
        <Text style={styles.sectionTitle}>Signature / Stamp</Text>
        <ImageUploadCard
          imageUrl={info?.signatureStampUrl ?? null}
          label="Upload Signature / Stamp"
          uploading={uploading === 'signature'}
          onPick={() => handlePickImage('signature')}
          onDelete={() => handleDeleteImage('signature')}
          testID="signature"
        />

        {/* QR Code Upload */}
        <Text style={styles.sectionTitle}>Payment QR Code</Text>
        <ImageUploadCard
          imageUrl={info?.qrCodeImageUrl ?? null}
          label="Upload QR Code"
          uploading={uploading === 'qrcode'}
          onPick={() => handlePickImage('qrcode')}
          onDelete={() => handleDeleteImage('qrcode')}
          testID="qrcode"
        />

        {/* Bank Details */}
        <Text style={styles.sectionTitle}>Bank Details</Text>
        <View style={styles.formGroup}>
          <Text style={styles.label}>Account Holder Name</Text>
          <TextInput
            style={styles.input}
            value={accountHolderName}
            onChangeText={setAccountHolderName}
            placeholder="Account holder name"
            testID="bank-holder-name"
          />

          <Text style={styles.label}>Account Number</Text>
          <TextInput
            style={styles.input}
            value={accountNumber}
            onChangeText={setAccountNumber}
            placeholder="9-18 digit account number"
            keyboardType="numeric"
            testID="bank-account-number"
          />

          <Text style={styles.label}>IFSC Code</Text>
          <TextInput
            style={styles.input}
            value={ifscCode}
            onChangeText={setIfscCode}
            placeholder="e.g. SBIN0001234"
            autoCapitalize="characters"
            testID="bank-ifsc"
          />

          <Text style={styles.label}>Bank Name</Text>
          <TextInput
            style={styles.input}
            value={bankName}
            onChangeText={setBankName}
            placeholder="Bank name"
            testID="bank-name"
          />

          <Text style={styles.label}>Branch Name</Text>
          <TextInput
            style={styles.input}
            value={branchName}
            onChangeText={setBranchName}
            placeholder="Branch name"
            testID="bank-branch"
          />
        </View>

        {/* UPI ID */}
        <Text style={styles.sectionTitle}>UPI ID</Text>
        <TextInput
          style={styles.input}
          value={upiId}
          onChangeText={setUpiId}
          placeholder="e.g. academy@upi"
          autoCapitalize="none"
          testID="upi-id"
        />

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSaveBankDetails}
          disabled={saving}
          testID="save-institute-info"
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Details'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

function ImageUploadCard({
  imageUrl,
  label,
  uploading,
  onPick,
  onDelete,
  testID,
}: {
  imageUrl: string | null;
  label: string;
  uploading: boolean;
  onPick: () => void;
  onDelete: () => void;
  testID: string;
}) {
  if (uploading) {
    return (
      <View style={styles.uploadCard} testID={`${testID}-uploading`}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.uploadingText}>Uploading...</Text>
      </View>
    );
  }

  if (imageUrl) {
    return (
      <View style={styles.imageContainer} testID={`${testID}-preview`}>
        <Image source={{ uri: imageUrl }} style={styles.previewImage} resizeMode="contain" />
        <View style={styles.imageActions}>
          <TouchableOpacity
            style={styles.changeButton}
            onPress={onPick}
            testID={`${testID}-change`}
          >
            <Text style={styles.changeButtonText}>Change</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={onDelete}
            testID={`${testID}-delete`}
          >
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.uploadCard} onPress={onPick} testID={`${testID}-upload`}>
      <Text style={styles.uploadIcon}>+</Text>
      <Text style={styles.uploadLabel}>{label}</Text>
      <Text style={styles.uploadHint}>JPEG, PNG, or WebP (max 5MB)</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: fontSizes.lg,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryLink: {
    fontSize: fontSizes.base,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  sectionTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  formGroup: {
    gap: 0,
  },
  label: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
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
  uploadCard: {
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
  },
  uploadIcon: {
    fontSize: fontSizes['3xl'],
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  uploadLabel: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.primary,
  },
  uploadHint: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  uploadingText: {
    marginTop: spacing.sm,
    fontSize: fontSizes.base,
    color: colors.primary,
  },
  imageContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 180,
    backgroundColor: colors.bgSubtle,
  },
  imageActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  changeButton: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  changeButtonText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.primary,
  },
  removeButton: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.danger,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.base,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.white,
  },
});
