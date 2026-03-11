import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Inject,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import type { GetInstituteInfoUseCase } from '@application/academy/use-cases/get-institute-info.usecase';
import type { UpdateInstituteInfoUseCase } from '@application/academy/use-cases/update-institute-info.usecase';
import type { UploadInstituteImageUseCase } from '@application/academy/use-cases/upload-institute-image.usecase';
import type { DeleteInstituteImageUseCase } from '@application/academy/use-cases/delete-institute-image.usecase';
import { UpdateInstituteInfoDto } from './dto/update-institute-info.dto';
import { mapResultToResponse } from '../common/result-mapper';
import { MAX_IMAGE_FILE_SIZE } from '@shared/utils/image-validation';
import type { Request } from 'express';

@ApiTags('Institute Info')
@ApiBearerAuth()
@Controller('settings/institute-info')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('OWNER')
export class InstituteInfoController {
  constructor(
    @Inject('GET_INSTITUTE_INFO_USE_CASE')
    private readonly getInstituteInfo: GetInstituteInfoUseCase,
    @Inject('UPDATE_INSTITUTE_INFO_USE_CASE')
    private readonly updateInstituteInfo: UpdateInstituteInfoUseCase,
    @Inject('UPLOAD_INSTITUTE_IMAGE_USE_CASE')
    private readonly uploadInstituteImage: UploadInstituteImageUseCase,
    @Inject('DELETE_INSTITUTE_IMAGE_USE_CASE')
    private readonly deleteInstituteImage: DeleteInstituteImageUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get institute information' })
  async get(@CurrentUser() user: CurrentUserType, @Req() req: Request) {
    const result = await this.getInstituteInfo.execute({
      actorUserId: user.userId,
      actorRole: user.role,
    });
    return mapResultToResponse(result, req);
  }

  @Put()
  @ApiOperation({ summary: 'Update institute information (bank details, UPI ID)' })
  async update(
    @Body() dto: UpdateInstituteInfoDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.updateInstituteInfo.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      bankDetails: dto.bankDetails,
      upiId: dto.upiId,
    });
    return mapResultToResponse(result, req);
  }

  @Post('signature')
  @Throttle({ short: { limit: 3, ttl: 10_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 30, ttl: 900_000 } })
  @ApiOperation({ summary: 'Upload signature/stamp image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_FILE_SIZE } }))
  async uploadSignature(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    if (!file) {
      return { success: false, error: { code: 'VALIDATION', message: 'No file uploaded' } };
    }
    const result = await this.uploadInstituteImage.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      imageType: 'signature',
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
    return mapResultToResponse(result, req);
  }

  @Delete('signature')
  @ApiOperation({ summary: 'Delete signature/stamp image' })
  async deleteSignature(@CurrentUser() user: CurrentUserType, @Req() req: Request) {
    const result = await this.deleteInstituteImage.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      imageType: 'signature',
    });
    return mapResultToResponse(result, req);
  }

  @Post('qrcode')
  @Throttle({ short: { limit: 3, ttl: 10_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 30, ttl: 900_000 } })
  @ApiOperation({ summary: 'Upload QR code image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_FILE_SIZE } }))
  async uploadQrCode(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    if (!file) {
      return { success: false, error: { code: 'VALIDATION', message: 'No file uploaded' } };
    }
    const result = await this.uploadInstituteImage.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      imageType: 'qrcode',
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
    return mapResultToResponse(result, req);
  }

  @Delete('qrcode')
  @ApiOperation({ summary: 'Delete QR code image' })
  async deleteQrCode(@CurrentUser() user: CurrentUserType, @Req() req: Request) {
    const result = await this.deleteInstituteImage.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      imageType: 'qrcode',
    });
    return mapResultToResponse(result, req);
  }
}
