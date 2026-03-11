import RNFS from 'react-native-fs';
import type { AppError } from '../../domain/common/errors';
import type { Result } from '../../domain/common/result';
import { ok, err } from '../../domain/common/result';
import { getAccessToken } from '../http/api-client';
import { env } from '../env';
import { buildPdfFilename, isValidMonthKey } from '../files/file-naming';
import { getTempPath, moveToExports, cleanupExports, type FileMetadata } from '../files/file-manager';

const DOWNLOAD_TIMEOUT_MS = 30_000;

export type PdfExportResult = FileMetadata;

export type DownloadPdfOptions = {
  endpoint: string;
  reportType: string;
  monthKey: string;
};

/**
 * Download a PDF from the backend, validate it, store it atomically,
 * and clean up old exports.
 *
 * Retries once on network failure.
 */
export async function downloadAndStorePdf(
  options: DownloadPdfOptions,
): Promise<Result<PdfExportResult, AppError>> {
  if (!isValidMonthKey(options.monthKey)) {
    return err({ code: 'VALIDATION', message: 'Invalid month format.' });
  }

  const result = await attemptDownload(options);
  if (result.ok) {
    // Cleanup runs after success, fire-and-forget — failure is non-critical
    cleanupExports().catch(() => { /* cleanup is best-effort */ });
    return result;
  }

  // Retry once on network failure
  if (result.error.code === 'NETWORK') {
    const retry = await attemptDownload(options);
    if (retry.ok) {
      cleanupExports().catch(() => { /* cleanup is best-effort */ });
    }
    return retry;
  }

  return result;
}

async function attemptDownload(
  options: DownloadPdfOptions,
): Promise<Result<PdfExportResult, AppError>> {
  const token = getAccessToken();
  if (!token) {
    return err({ code: 'FORBIDDEN', message: 'Not authenticated. Please log in again.' });
  }

  const fullUrl = `${env.API_BASE_URL}${options.endpoint}`;

  const filename = buildPdfFilename(options.reportType, options.monthKey);
  const tempPath = getTempPath(filename);

  try {
    const { promise } = RNFS.downloadFile({
      fromUrl: fullUrl,
      toFile: tempPath,
      connectionTimeout: DOWNLOAD_TIMEOUT_MS,
      readTimeout: DOWNLOAD_TIMEOUT_MS,
      headers: {
        Accept: 'application/pdf',
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await promise;

    // Validate HTTP status
    if (res.statusCode !== 200) {
      await safeUnlink(tempPath);
      if (res.statusCode === 401) {
        return err({ code: 'FORBIDDEN', message: 'Session expired. Please log in again.' });
      }
      if (res.statusCode === 403) {
        return err({ code: 'FORBIDDEN', message: 'Access denied. Only owners can export reports.' });
      }
      return err({ code: 'UNKNOWN', message: `Failed to download report. (HTTP ${res.statusCode})` });
    }

    // Validate file size
    if (res.bytesWritten === 0) {
      await safeUnlink(tempPath);
      return err({ code: 'UNKNOWN', message: 'Unexpected file format received.' });
    }

    // Move temp to final destination atomically
    const metadata = await moveToExports(tempPath, filename);

    return ok(metadata);
  } catch {
    await safeUnlink(tempPath);
    return err({ code: 'NETWORK', message: 'Network timeout. Please try again.' });
  }
}

async function safeUnlink(path: string): Promise<void> {
  try {
    const exists = await RNFS.exists(path);
    if (exists) {
      await RNFS.unlink(path);
    }
  } catch {
    // Ignore cleanup errors
  }
}

export const pdfDownload = {
  downloadAndStorePdf,
};
