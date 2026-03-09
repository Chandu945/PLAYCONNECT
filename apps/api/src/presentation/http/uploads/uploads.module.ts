import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { AuthModule } from '../auth/auth.module';
import { FILE_STORAGE_PORT } from '@application/common/ports/file-storage.port';
import { CloudinaryStorageService } from '@infrastructure/storage/cloudinary-storage.service';

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [
    { provide: FILE_STORAGE_PORT, useClass: CloudinaryStorageService },
  ],
})
export class UploadsModule {}
