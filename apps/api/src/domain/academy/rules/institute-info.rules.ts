import type { BankDetails } from '../entities/academy.entity';

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/;
const UPI_ID_REGEX = /^[\w.+-]+@[\w]+$/;

export function validateIfscCode(ifsc: string): { valid: boolean; reason?: string } {
  if (!IFSC_REGEX.test(ifsc)) {
    return { valid: false, reason: 'IFSC code must match format: 4 letters, 0, then 6 alphanumeric characters' };
  }
  return { valid: true };
}

export function validateAccountNumber(accountNumber: string): { valid: boolean; reason?: string } {
  if (!ACCOUNT_NUMBER_REGEX.test(accountNumber)) {
    return { valid: false, reason: 'Account number must be 9-18 digits' };
  }
  return { valid: true };
}

export function validateUpiId(upiId: string): { valid: boolean; reason?: string } {
  if (!UPI_ID_REGEX.test(upiId)) {
    return { valid: false, reason: 'UPI ID must be in format: name@provider' };
  }
  return { valid: true };
}

export function validateBankDetails(details: BankDetails): { valid: boolean; reason?: string } {
  const ifscCheck = validateIfscCode(details.ifscCode);
  if (!ifscCheck.valid) return ifscCheck;

  const accountCheck = validateAccountNumber(details.accountNumber);
  if (!accountCheck.valid) return accountCheck;

  if (!details.accountHolderName.trim()) {
    return { valid: false, reason: 'Account holder name is required' };
  }

  if (!details.bankName.trim()) {
    return { valid: false, reason: 'Bank name is required' };
  }

  if (!details.branchName.trim()) {
    return { valid: false, reason: 'Branch name is required' };
  }

  return { valid: true };
}

import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_FILE_SIZE,
} from '@shared/utils/image-validation';

export function validateImageFile(
  mimeType: string,
  size: number,
): { valid: boolean; reason?: string } {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as typeof ALLOWED_IMAGE_MIME_TYPES[number])) {
    return { valid: false, reason: 'Only JPEG, PNG, and WebP images are allowed' };
  }
  if (size > MAX_IMAGE_FILE_SIZE) {
    return { valid: false, reason: 'File size must not exceed 5MB' };
  }
  return { valid: true };
}
