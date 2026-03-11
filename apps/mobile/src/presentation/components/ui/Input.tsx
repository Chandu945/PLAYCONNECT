import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, type TextInputProps } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type InputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  maxLength?: number;
  editable?: boolean;
  returnKeyType?: TextInputProps['returnKeyType'];
  testID?: string;
};

export function Input({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  maxLength,
  editable,
  returnKeyType,
  testID,
}: InputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const isPassword = secureTextEntry === true;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrapper, error ? styles.inputWrapperError : undefined]}>
        <TextInput
          style={[styles.input, isPassword ? styles.inputWithToggle : undefined]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textDisabled}
          secureTextEntry={isPassword && !passwordVisible}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          editable={editable}
          returnKeyType={returnKeyType}
          accessibilityLabel={label}
          testID={testID}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setPasswordVisible((prev) => !prev)}
            style={styles.toggleButton}
            hitSlop={8}
            accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
            accessibilityRole="button"
            testID={testID ? `${testID}-toggle` : 'password-toggle'}
          >
            {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
            <Icon
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: {
    marginBottom: spacing.base,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  inputWrapperError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: spacing.base,
    fontSize: fontSizes.base,
    color: colors.text,
  },
  inputWithToggle: {
    paddingRight: 4,
  },
  toggleButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    fontSize: fontSizes.sm,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
