import { v4 as uuidv4 } from 'uuid';
import type { Result } from '@shared/kernel';
import { ok, err, updateAuditFields } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { User } from '@domain/identity/entities/user.entity';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { FileStoragePort } from '../../common/ports/file-storage.port';
import { StaffErrors } from '../../common/errors';
import { AppError as AppErrorClass } from '@shared/kernel';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_FILE_SIZE,
  extensionForMime,
  validateImageBuffer,
} from '@shared/utils/image-validation';

export interface UploadStaffPhotoInput {
  actorUserId: string;
  staffUserId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export class UploadStaffPhotoUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly fileStorage: FileStoragePort,
  ) {}

  async execute(input: UploadStaffPhotoInput): Promise<Result<{ url: string }, AppError>> {
    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(StaffErrors.academyRequired());
    }

    if (actor.role !== 'OWNER') {
      return err(AppErrorClass.forbidden('Only owners can upload staff photos'));
    }

    const staff = await this.userRepo.findById(input.staffUserId);
    if (!staff || staff.role !== 'STAFF') {
      return err(StaffErrors.notFound(input.staffUserId));
    }

    if (staff.academyId !== actor.academyId) {
      return err(StaffErrors.notInAcademy());
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
    if (staff.profilePhotoUrl) {
      await this.fileStorage.delete(staff.profilePhotoUrl);
    }

    const ext = extensionForMime(input.mimeType);
    const filename = `${uuidv4()}.${ext}`;
    const folder = `staff/${actor.academyId}`;

    const url = await this.fileStorage.upload(folder, filename, input.buffer, input.mimeType);

    const updated = User.reconstitute(staff.id.toString(), {
      ...staff['props'],
      profilePhotoUrl: url,
      audit: updateAuditFields(staff.audit),
    });

    await this.userRepo.save(updated);

    return ok({ url });
  }
}
