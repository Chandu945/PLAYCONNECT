import React, { useState, useCallback, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StudentsStackParamList } from '../../navigation/StudentsStack';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { InlineError } from '../../components/ui/InlineError';
import { BatchMultiSelect } from '../../components/batches/BatchMultiSelect';
import {
  validateStudentForm,
  saveStudentUseCase,
} from '../../../application/student/use-cases/save-student.usecase';
import { createStudent, updateStudent, deleteStudent, getStudentPhotoUploadPath } from '../../../infra/student/student-api';
import { getStudentBatches, setStudentBatches } from '../../../infra/batch/batch-api';
import { ProfilePhotoUploader } from '../../components/common/ProfilePhotoUploader';
import type { Gender, CreateStudentRequest } from '../../../domain/student/student.types';
import { colors, spacing, fontSizes, fontWeights } from '../../theme';

type FormRoute = RouteProp<StudentsStackParamList, 'StudentForm'>;

const GENDER_OPTIONS: { label: string; value: Gender }[] = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
  { label: 'Other', value: 'OTHER' },
];

const saveApi = { createStudent, updateStudent };

export function StudentFormScreen() {
  const navigation = useNavigation();
  const route = useRoute<FormRoute>();
  const { mode, student } = route.params;
  const { user, subscription } = useAuth();
  const isStaff = user?.role === 'STAFF';

  // Existing fields
  const [fullName, setFullName] = useState(student?.fullName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(student?.dateOfBirth ?? '');
  const [gender, setGender] = useState<Gender | ''>(student?.gender ?? '');
  const [addressLine1, setAddressLine1] = useState(student?.address.line1 ?? '');
  const [addressLine2, setAddressLine2] = useState(student?.address.line2 ?? '');
  const [city, setCity] = useState(student?.address.city ?? '');
  const [state, setState] = useState(student?.address.state ?? '');
  const [pincode, setPincode] = useState(student?.address.pincode ?? '');
  const [guardianName, setGuardianName] = useState(student?.guardian.name ?? '');
  const [guardianMobile, setGuardianMobile] = useState(student?.guardian.mobile ?? '');
  const [guardianEmail, setGuardianEmail] = useState(student?.guardian.email ?? '');
  const [joiningDate, setJoiningDate] = useState(student?.joiningDate ?? '');
  const [monthlyFee, setMonthlyFee] = useState(
    student?.monthlyFee ? String(student.monthlyFee) : '',
  );

  // New extended fields
  const [fatherName, setFatherName] = useState(student?.fatherName ?? '');
  const [motherName, setMotherName] = useState(student?.motherName ?? '');
  const [aadhaarNumber, setAadhaarNumber] = useState(student?.aadhaarNumber ?? '');
  const [caste, setCaste] = useState(student?.caste ?? '');
  const [whatsappNumber, setWhatsappNumber] = useState(student?.whatsappNumber ?? '');
  const [mobileNumber, setMobileNumber] = useState(student?.mobileNumber ?? '');
  const [addressText, setAddressText] = useState(
    student?.addressText ??
      (student?.address
        ? [student.address.line1, student.address.line2, student.address.city, student.address.state, student.address.pincode]
            .filter(Boolean)
            .join(', ')
        : ''),
  );
  const [schoolName, setSchoolName] = useState(student?.instituteInfo?.schoolName ?? '');
  const [rollNumber, setRollNumber] = useState(student?.instituteInfo?.rollNumber ?? '');
  const [standard, setStandard] = useState(student?.instituteInfo?.standard ?? '');
  const [password, setPassword] = useState('');

  const [photoUrl, setPhotoUrl] = useState<string | null>(student?.profilePhotoUrl ?? null);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && student?.id) {
      let cancelled = false;
      getStudentBatches(student.id).then((result) => {
        if (!cancelled && result.ok) {
          setSelectedBatchIds(result.value.map((b) => b.id));
        }
      }).catch(() => {});
      return () => { cancelled = true; };
    }
  }, [mode, student?.id]);

  const canDelete = mode === 'edit' && user?.role === 'OWNER' && student?.id;

  const handleDelete = useCallback(() => {
    if (!student?.id) return;
    Alert.alert('Delete Student', 'Are you sure you want to delete this student? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          const result = await deleteStudent(student.id);
          setSubmitting(false);
          if (result.ok) {
            navigation.goBack();
          } else {
            setServerError(result.error.message);
          }
        },
      },
    ]);
  }, [student?.id, navigation]);

  const showMonthlyFee = mode === 'create' || !isStaff;

  const handleSubmit = useCallback(async () => {
    const fields: Record<string, string> = {
      fullName,
      dateOfBirth,
      gender,
      addressLine1,
      city,
      state,
      pincode,
      guardianName,
      guardianMobile,
      guardianEmail,
      joiningDate,
      monthlyFee,
      aadhaarNumber,
      password,
    };

    const errors = validateStudentForm(fields, mode);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const data: CreateStudentRequest = {
      fullName: fullName.trim(),
      dateOfBirth,
      gender: gender as Gender,
      address: {
        line1: addressLine1.trim() || addressText.trim().slice(0, 100) || '-',
        ...(addressLine2.trim() ? { line2: addressLine2.trim() } : {}),
        city: city.trim() || '-',
        state: state.trim() || '-',
        pincode: pincode.trim() || '000000',
      },
      guardian: {
        name: guardianName.trim(),
        mobile: guardianMobile.trim(),
        email: guardianEmail.trim(),
      },
      joiningDate,
      monthlyFee: Number(monthlyFee),
    };

    // Extended fields
    if (fatherName.trim()) data.fatherName = fatherName.trim();
    if (motherName.trim()) data.motherName = motherName.trim();
    if (aadhaarNumber.trim()) data.aadhaarNumber = aadhaarNumber.trim();
    if (caste.trim()) data.caste = caste.trim();
    if (whatsappNumber.trim()) data.whatsappNumber = whatsappNumber.trim();
    if (mobileNumber.trim()) data.mobileNumber = mobileNumber.trim();
    if (addressText.trim()) data.addressText = addressText.trim();
    if (schoolName.trim() || rollNumber.trim() || standard.trim()) {
      data.instituteInfo = {};
      if (schoolName.trim()) data.instituteInfo.schoolName = schoolName.trim();
      if (rollNumber.trim()) data.instituteInfo.rollNumber = rollNumber.trim();
      if (standard.trim()) data.instituteInfo.standard = standard.trim();
    }
    if (password.trim()) data.password = password.trim();
    if (photoUrl) data.profilePhotoUrl = photoUrl;

    // Staff cannot change fees
    if (mode === 'edit' && isStaff) {
      delete (data as Partial<CreateStudentRequest>).monthlyFee;
    }

    setSubmitting(true);
    setServerError(null);

    const result = await saveStudentUseCase({ saveApi }, mode, student?.id, data);

    setSubmitting(false);

    if (result.ok) {
      const studentId = mode === 'edit' ? student?.id : (result.value as { id?: string })?.id;
      if (studentId) {
        await setStudentBatches(studentId, selectedBatchIds);
      }

      if (mode === 'create' && subscription) {
        const currentTier = subscription.tiers.find(
          (t) => t.tierKey === subscription.currentTierKey,
        );
        if (currentTier?.max && subscription.activeStudentCount + 1 > currentTier.max) {
          Alert.alert(
            'Tier Upgrade Required',
            `Your active student count now exceeds the limit for your current tier (${currentTier.max} students). Please upgrade your subscription to continue adding students.`,
            [{ text: 'OK' }],
          );
        }
      }

      navigation.goBack();
    } else {
      setServerError(result.error.message);
    }
  }, [
    fullName, dateOfBirth, gender, addressLine1, addressLine2, city, state, pincode,
    guardianName, guardianMobile, guardianEmail, joiningDate, monthlyFee,
    fatherName, motherName, aadhaarNumber, caste, whatsappNumber, mobileNumber,
    addressText, schoolName, rollNumber, standard, password,
    mode, student?.id, selectedBatchIds, navigation, isStaff, subscription,
  ]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {serverError && <InlineError message={serverError} />}

      {/* Profile Photo */}
      <ProfilePhotoUploader
        currentPhotoUrl={photoUrl}
        uploadPath={mode === 'edit' && student?.id ? getStudentPhotoUploadPath(student.id) : undefined}
        onPhotoUploaded={setPhotoUrl}
        size={90}
        testID="student-form-photo"
      />

      {/* Section: Student Information */}
      <Text style={styles.sectionTitle}>Student Information</Text>
      <Text style={styles.sectionSubtitle}>Enter student personal details here.</Text>

      <Input
        label="Student Name"
        value={fullName}
        onChangeText={setFullName}
        error={fieldErrors['fullName']}
        testID="input-fullName"
      />

      <Input
        label="Father Name"
        value={fatherName}
        onChangeText={setFatherName}
        testID="input-fatherName"
      />

      <Input
        label="Mother Name"
        value={motherName}
        onChangeText={setMotherName}
        testID="input-motherName"
      />

      <Input
        label="Date of Birth (YYYY-MM-DD)"
        value={dateOfBirth}
        onChangeText={setDateOfBirth}
        error={fieldErrors['dateOfBirth']}
        placeholder="2010-01-01"
        testID="input-dateOfBirth"
      />

      <Input
        label="Aadhaar Number"
        value={aadhaarNumber}
        onChangeText={setAadhaarNumber}
        error={fieldErrors['aadhaarNumber']}
        keyboardType="numeric"
        placeholder="12-digit number"
        testID="input-aadhaarNumber"
      />

      <Input
        label="Caste"
        value={caste}
        onChangeText={setCaste}
        testID="input-caste"
      />

      <Text style={styles.label}>Gender</Text>
      <View style={styles.genderRow}>
        {GENDER_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.genderOption, gender === opt.value && styles.genderSelected]}
            onPress={() => setGender(opt.value)}
            testID={`gender-${opt.value.toLowerCase()}`}
          >
            <Text style={[styles.genderLabel, gender === opt.value && styles.genderLabelSelected]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {fieldErrors['gender'] ? (
        <Text style={styles.fieldError}>{fieldErrors['gender']}</Text>
      ) : null}

      {/* Section: Contact Information */}
      <Text style={styles.sectionTitle}>Contact Information</Text>
      <Text style={styles.sectionSubtitle}>Country Code Required (e.g. 91XXXXXXXXXX)</Text>

      <Input
        label="WhatsApp"
        value={whatsappNumber}
        onChangeText={setWhatsappNumber}
        keyboardType="phone-pad"
        placeholder="919876543210"
        testID="input-whatsappNumber"
      />

      <Input
        label="Mobile Number"
        value={mobileNumber}
        onChangeText={setMobileNumber}
        keyboardType="phone-pad"
        placeholder="919876543210"
        testID="input-mobileNumber"
      />

      <Input
        label="Address"
        value={addressText}
        onChangeText={setAddressText}
        placeholder="456 Park Lane, Mumbai"
        testID="input-addressText"
      />

      {/* Section: Guardian Information */}
      <Text style={styles.sectionTitle}>Guardian Information</Text>

      <Input
        label="Guardian Name"
        value={guardianName}
        onChangeText={setGuardianName}
        error={fieldErrors['guardianName']}
        testID="input-guardianName"
      />

      <Input
        label="Guardian Mobile (E.164)"
        value={guardianMobile}
        onChangeText={setGuardianMobile}
        error={fieldErrors['guardianMobile']}
        placeholder="+919876543210"
        keyboardType="phone-pad"
        testID="input-guardianMobile"
      />

      <Input
        label="Guardian Email"
        value={guardianEmail}
        onChangeText={setGuardianEmail}
        error={fieldErrors['guardianEmail']}
        keyboardType="email-address"
        testID="input-guardianEmail"
      />

      {/* Section: Institute Information */}
      <Text style={styles.sectionTitle}>Institute Information</Text>
      <Text style={styles.sectionSubtitle}>Enter academic details here.</Text>

      <Input
        label="School Name"
        value={schoolName}
        onChangeText={setSchoolName}
        testID="input-schoolName"
      />

      <Input
        label="Roll Number"
        value={rollNumber}
        onChangeText={setRollNumber}
        testID="input-rollNumber"
      />

      <Input
        label="Standard / Class"
        value={standard}
        onChangeText={setStandard}
        testID="input-standard"
      />

      <Input
        label="Password (for student login)"
        value={password}
        onChangeText={setPassword}
        error={fieldErrors['password']}
        secureTextEntry
        placeholder="Min 6 characters"
        testID="input-password"
      />

      {/* Section: Enrollment */}
      <Text style={styles.sectionTitle}>Enrollment</Text>

      <Input
        label="Joining Date (YYYY-MM-DD)"
        value={joiningDate}
        onChangeText={setJoiningDate}
        error={fieldErrors['joiningDate']}
        placeholder="2024-01-01"
        testID="input-joiningDate"
      />

      {showMonthlyFee && (
        <Input
          label="Monthly Fee"
          value={monthlyFee}
          onChangeText={setMonthlyFee}
          error={fieldErrors['monthlyFee']}
          keyboardType="numeric"
          testID="input-monthlyFee"
        />
      )}

      <BatchMultiSelect selectedIds={selectedBatchIds} onChange={setSelectedBatchIds} />

      <View style={styles.submitContainer}>
        <Button
          title={mode === 'create' ? 'Save' : 'Save Changes'}
          onPress={handleSubmit}
          loading={submitting}
          testID="submit-button"
        />
        {canDelete && (
          <View style={styles.deleteContainer}>
            <Button
              title="Delete Student"
              variant="secondary"
              onPress={handleDelete}
              loading={submitting}
              testID="delete-button"
            />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.base,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    fontSize: fontSizes.sm,
    color: colors.textMedium,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.textMedium,
    marginBottom: 6,
  },
  genderRow: {
    flexDirection: 'row',
    marginBottom: spacing.base,
  },
  genderOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  genderSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  genderLabel: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.textMedium,
  },
  genderLabelSelected: {
    color: colors.white,
  },
  fieldError: {
    fontSize: fontSizes.sm,
    color: colors.danger,
    marginTop: -12,
    marginBottom: spacing.base,
  },
  submitContainer: {
    marginTop: spacing.sm,
  },
  deleteContainer: {
    marginTop: spacing.md,
  },
});
