import {
  Controller,
  Post,
  Inject,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import { FILE_STORAGE_PORT } from '@application/common/ports/file-storage.port';
import type { FileStoragePort } from '@application/common/ports/file-storage.port';
import { mapResultToResponse } from '../common/result-mapper';
import { ok, err, AppError } from '@shared/kernel';
import { v4 as uuidv4 } from 'uuid';
import type { Request } from 'express';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
@UseGuards(JwtAuthGuard, RbacGuard)
export class UploadsController {
  constructor(
    @Inject(FILE_STORAGE_PORT) private readonly fileStorage: FileStoragePort,
  ) {}

  @Post('image')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Upload an image (general purpose)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    if (!file) {
      return mapResultToResponse(err(AppError.validation('No file provided')), req);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return mapResultToResponse(
        err(AppError.validation('Only JPEG, PNG, and WebP images are allowed')),
        req,
      );
    }

    if (file.buffer.length > MAX_FILE_SIZE) {
      return mapResultToResponse(
        err(AppError.validation('File size must not exceed 5MB')),
        req,
      );
    }

    const ext = file.originalname.split('.').pop() ?? 'jpg';
    const filename = `${uuidv4()}.${ext}`;
    const folder = `temp/${user.userId}`;

    try {
      const url = await this.fileStorage.upload(folder, filename, file.buffer, file.mimetype);
      return mapResultToResponse(ok({ url }), req);
    } catch {
      return mapResultToResponse(
        err(AppError.validation('Upload failed. Please try again.')),
        req,
      );
    }
  }
}
