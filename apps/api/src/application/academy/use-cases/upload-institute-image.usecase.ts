import { v4 as uuidv4 } from 'uuid';
import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { FileStoragePort } from '../../common/ports/file-storage.port';
import { validateImageFile } from '@domain/academy/rules/institute-info.rules';
import { InstituteInfoErrors } from '../../common/errors';
import type { UserRole } from '@playconnect/contracts';
import { extensionForMime, validateImageBuffer } from '@shared/utils/image-validation';

export type ImageType = 'signature' | 'qrcode';

export interface UploadInstituteImageInput {
  actorUserId: string;
  actorRole: UserRole;
  imageType: ImageType;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export interface UploadInstituteImageOutput {
  url: string;
}

export class UploadInstituteImageUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly academyRepo: AcademyRepository,
    private readonly fileStorage: FileStoragePort,
  ) {}

  async execute(input: UploadInstituteImageInput): Promise<Result<UploadInstituteImageOutput, AppError>> {
    if (input.actorRole !== 'OWNER') {
      return err(InstituteInfoErrors.updateNotAllowed());
    }

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(InstituteInfoErrors.academyRequired());

    const academy = await this.academyRepo.findById(user.academyId);
    if (!academy) return err(InstituteInfoErrors.academyRequired());

    const fileCheck = validateImageFile(input.mimeType, input.buffer.length);
    if (!fileCheck.valid) return err(InstituteInfoErrors.invalidFile());

    const bufferCheck = validateImageBuffer(input.buffer, input.mimeType);
    if (!bufferCheck.valid) return err(InstituteInfoErrors.invalidFile());

    const ext = extensionForMime(input.mimeType);
    const filename = `${uuidv4()}.${ext}`;
    const folder = `institute/${user.academyId}/${input.imageType}`;

    // Delete old file if exists
    const info = academy.instituteInfo;
    const oldUrl = input.imageType === 'signature' ? info.signatureStampUrl : info.qrCodeImageUrl;
    if (oldUrl) {
      await this.fileStorage.delete(oldUrl);
    }

    const url = await this.fileStorage.upload(folder, filename, input.buffer, input.mimeType);

    const updateParams = input.imageType === 'signature'
      ? { signatureStampUrl: url }
      : { qrCodeImageUrl: url };

    const updated = academy.updateInstituteInfo(updateParams);
    await this.academyRepo.save(updated);

    return ok({ url });
  }
}
