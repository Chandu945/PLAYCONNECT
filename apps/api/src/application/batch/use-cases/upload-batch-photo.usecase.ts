import { v4 as uuidv4 } from 'uuid';
import type { Result } from '@shared/kernel';
import { ok, err, updateAuditFields } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { Batch } from '@domain/batch/entities/batch.entity';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { FileStoragePort } from '../../common/ports/file-storage.port';
import { canManageBatch } from '@domain/batch/rules/batch.rules';
import { BatchErrors } from '../../common/errors';
import type { UserRole } from '@playconnect/contracts';
import { AppError as AppErrorClass } from '@shared/kernel';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_FILE_SIZE,
  extensionForMime,
  validateImageBuffer,
} from '@shared/utils/image-validation';

export interface UploadBatchPhotoInput {
  actorUserId: string;
  actorRole: UserRole;
  batchId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export class UploadBatchPhotoUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly batchRepo: BatchRepository,
    private readonly fileStorage: FileStoragePort,
  ) {}

  async execute(input: UploadBatchPhotoInput): Promise<Result<{ url: string }, AppError>> {
    const roleCheck = canManageBatch(input.actorRole);
    if (!roleCheck.allowed) {
      return err(BatchErrors.notAllowed());
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(BatchErrors.academyRequired());
    }

    const batch = await this.batchRepo.findById(input.batchId);
    if (!batch) {
      return err(BatchErrors.notFound(input.batchId));
    }

    if (batch.academyId !== actor.academyId) {
      return err(BatchErrors.notInAcademy());
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(input.mimeType as typeof ALLOWED_IMAGE_MIME_TYPES[number])) {
      return err(AppErrorClass.validation('Only JPEG, PNG, and WebP images are allowed'));
    }

    if (input.buffer.length > MAX_IMAGE_FILE_SIZE) {
      return err(AppErrorClass.validation('File size must not exceed 5MB'));
    }

    const bufferCheck = validateImageBuffer(input.buffer, input.mimeType);
    if (!bufferCheck.valid) {
      return err(AppErrorClass.validation(bufferCheck.reason));
    }

    // Delete old photo if exists
    if (batch.profilePhotoUrl) {
      await this.fileStorage.delete(batch.profilePhotoUrl);
    }

    const ext = extensionForMime(input.mimeType);
    const filename = `${uuidv4()}.${ext}`;
    const folder = `batches/${actor.academyId}`;

    const url = await this.fileStorage.upload(folder, filename, input.buffer, input.mimeType);

    const updated = Batch.reconstitute(input.batchId, {
      academyId: batch.academyId,
      batchName: batch.batchName,
      batchNameNormalized: batch.batchNameNormalized,
      days: batch.days,
      notes: batch.notes,
      profilePhotoUrl: url,
      status: batch.status,
      audit: updateAuditFields(batch.audit),
    });

    await this.batchRepo.save(updated);

    return ok({ url });
  }
}
