import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  HttpStatus,
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
import type { CreateStaffUseCase } from '@application/staff/use-cases/create-staff.usecase';
import type { ListStaffUseCase } from '@application/staff/use-cases/list-staff.usecase';
import type { UpdateStaffUseCase } from '@application/staff/use-cases/update-staff.usecase';
import type { SetStaffStatusUseCase } from '@application/staff/use-cases/set-staff-status.usecase';
import type { UploadStaffPhotoUseCase } from '@application/staff/use-cases/upload-staff-photo.usecase';
import { CreateStaffDto } from './dto/create-staff.dto';
import { ListStaffQueryDto } from './dto/list-staff-query.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { SetStaffStatusDto } from './dto/set-staff-status.dto';
import { mapResultToResponse } from '../common/result-mapper';
import { LOGGER_PORT } from '@shared/logging/logger.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import { MAX_IMAGE_FILE_SIZE } from '@shared/utils/image-validation';
import type { Request } from 'express';

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('staff')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('OWNER')
export class StaffController {
  constructor(
    @Inject('CREATE_STAFF_USE_CASE') private readonly createStaff: CreateStaffUseCase,
    @Inject('LIST_STAFF_USE_CASE') private readonly listStaff: ListStaffUseCase,
    @Inject('UPDATE_STAFF_USE_CASE') private readonly updateStaff: UpdateStaffUseCase,
    @Inject('SET_STAFF_STATUS_USE_CASE') private readonly setStaffStatus: SetStaffStatusUseCase,
    @Inject('UPLOAD_STAFF_PHOTO_USE_CASE') private readonly uploadStaffPhoto: UploadStaffPhotoUseCase,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a staff member' })
  async create(
    @Body() dto: CreateStaffDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.createStaff.execute({
      ownerUserId: user.userId,
      ownerRole: user.role,
      fullName: dto.fullName,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      password: dto.password,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      gender: dto.gender ?? null,
      whatsappNumber: dto.whatsappNumber ?? null,
      mobileNumber: dto.mobileNumber ?? null,
      address: dto.address ?? null,
      qualificationInfo: dto.qualificationInfo
        ? { qualification: dto.qualificationInfo.qualification ?? null, position: dto.qualificationInfo.position ?? null }
        : null,
      salaryConfig: dto.salaryConfig
        ? { amount: dto.salaryConfig.amount ?? null, frequency: (dto.salaryConfig.frequency ?? 'MONTHLY') as 'MONTHLY' | 'WEEKLY' | 'DAILY' }
        : null,
      profilePhotoUrl: dto.profilePhotoUrl ?? null,
    });

    if (result.ok) {
      this.logger.info('Staff created', { staffId: result.value.id, ownerUserId: user.userId });
    }

    return mapResultToResponse(result, req, HttpStatus.CREATED);
  }

  @Get()
  @ApiOperation({ summary: 'List staff members' })
  async list(
    @Query() query: ListStaffQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.listStaff.execute({
      ownerUserId: user.userId,
      ownerRole: user.role,
      page: query.page,
      pageSize: query.pageSize,
    });

    return mapResultToResponse(result, req);
  }

  @Patch(':staffUserId')
  @ApiOperation({ summary: 'Update a staff member' })
  async update(
    @Param('staffUserId') staffUserId: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.updateStaff.execute({
      ownerUserId: user.userId,
      ownerRole: user.role,
      staffId: staffUserId,
      fullName: dto.fullName,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      password: dto.password,
      startDate: dto.startDate !== undefined ? (dto.startDate ? new Date(dto.startDate) : null) : undefined,
      gender: dto.gender !== undefined ? dto.gender : undefined,
      whatsappNumber: dto.whatsappNumber !== undefined ? dto.whatsappNumber : undefined,
      mobileNumber: dto.mobileNumber !== undefined ? dto.mobileNumber : undefined,
      address: dto.address !== undefined ? dto.address : undefined,
      qualificationInfo: dto.qualificationInfo !== undefined
        ? dto.qualificationInfo
          ? { qualification: dto.qualificationInfo.qualification ?? null, position: dto.qualificationInfo.position ?? null }
          : null
        : undefined,
      salaryConfig: dto.salaryConfig !== undefined
        ? dto.salaryConfig
          ? { amount: dto.salaryConfig.amount ?? null, frequency: (dto.salaryConfig.frequency ?? 'MONTHLY') as 'MONTHLY' | 'WEEKLY' | 'DAILY' }
          : null
        : undefined,
      profilePhotoUrl: dto.profilePhotoUrl !== undefined ? dto.profilePhotoUrl : undefined,
    });

    if (result.ok) {
      this.logger.info('Staff updated', { staffId: staffUserId, ownerUserId: user.userId });
    }

    return mapResultToResponse(result, req);
  }

  @Post(':staffUserId/photo')
  @Throttle({ short: { limit: 15, ttl: 10_000 }, medium: { limit: 40, ttl: 60_000 }, long: { limit: 200, ttl: 900_000 } })
  @ApiOperation({ summary: 'Upload staff profile photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_FILE_SIZE } }))
  async uploadPhoto(
    @Param('staffUserId') staffUserId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    if (!file) {
      return { success: false, error: { code: 'VALIDATION', message: 'No file uploaded' } };
    }
    const result = await this.uploadStaffPhoto.execute({
      actorUserId: user.userId,
      staffUserId,
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });

    if (result.ok) {
      this.logger.info('Staff photo uploaded', {
        staffUserId,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req);
  }

  @Patch(':staffUserId/status')
  @ApiOperation({ summary: 'Activate or deactivate a staff member' })
  async setStatus(
    @Param('staffUserId') staffUserId: string,
    @Body() dto: SetStaffStatusDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.setStaffStatus.execute({
      ownerUserId: user.userId,
      ownerRole: user.role,
      staffId: staffUserId,
      status: dto.status,
    });

    if (result.ok) {
      this.logger.info('Staff status changed', {
        staffId: staffUserId,
        newStatus: dto.status,
        ownerUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req);
  }
}
