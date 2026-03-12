import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  Inject,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import type { CreateBatchUseCase } from '@application/batch/use-cases/create-batch.usecase';
import type { UpdateBatchUseCase } from '@application/batch/use-cases/update-batch.usecase';
import type { ListBatchesUseCase } from '@application/batch/use-cases/list-batches.usecase';
import type { GetBatchUseCase } from '@application/batch/use-cases/get-batch.usecase';
import type { ListBatchStudentsUseCase } from '@application/batch/use-cases/list-batch-students.usecase';
import type { AddStudentToBatchUseCase } from '@application/batch/use-cases/add-student-to-batch.usecase';
import type { RemoveStudentFromBatchUseCase } from '@application/batch/use-cases/remove-student-from-batch.usecase';
import type { DeleteBatchUseCase } from '@application/batch/use-cases/delete-batch.usecase';
import type { UploadBatchPhotoUseCase } from '@application/batch/use-cases/upload-batch-photo.usecase';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { ListBatchesQueryDto } from './dto/list-batches.query';
import { mapResultToResponse } from '../common/result-mapper';
import { LOGGER_PORT } from '@shared/logging/logger.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import { MAX_IMAGE_FILE_SIZE } from '@shared/utils/image-validation';
import type { Request } from 'express';

@ApiTags('Batches')
@ApiBearerAuth()
@Controller('batches')
@UseGuards(JwtAuthGuard, RbacGuard)
export class BatchesController {
  constructor(
    @Inject('CREATE_BATCH_USE_CASE') private readonly createBatch: CreateBatchUseCase,
    @Inject('UPDATE_BATCH_USE_CASE') private readonly updateBatch: UpdateBatchUseCase,
    @Inject('LIST_BATCHES_USE_CASE') private readonly listBatches: ListBatchesUseCase,
    @Inject('GET_BATCH_USE_CASE') private readonly getBatch: GetBatchUseCase,
    @Inject('LIST_BATCH_STUDENTS_USE_CASE') private readonly listBatchStudents: ListBatchStudentsUseCase,
    @Inject('ADD_STUDENT_TO_BATCH_USE_CASE') private readonly addStudentToBatch: AddStudentToBatchUseCase,
    @Inject('REMOVE_STUDENT_FROM_BATCH_USE_CASE') private readonly removeStudentFromBatch: RemoveStudentFromBatchUseCase,
    @Inject('DELETE_BATCH_USE_CASE') private readonly deleteBatch: DeleteBatchUseCase,
    @Inject('UPLOAD_BATCH_PHOTO_USE_CASE') private readonly uploadBatchPhoto: UploadBatchPhotoUseCase,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
  ) {}

  @Post()
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Create a batch' })
  async create(
    @Body() dto: CreateBatchDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.createBatch.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      batchName: dto.batchName,
      days: dto.days,
      notes: dto.notes,
      startTime: dto.startTime,
      endTime: dto.endTime,
      maxStudents: dto.maxStudents,
    });

    if (result.ok) {
      this.logger.info('Batch created', {
        batchId: result.value.id,
        academyId: result.value.academyId,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req, HttpStatus.CREATED);
  }

  @Patch(':batchId')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Update a batch' })
  async update(
    @Param('batchId') batchId: string,
    @Body() dto: UpdateBatchDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.updateBatch.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      batchId,
      batchName: dto.batchName,
      days: dto.days,
      notes: dto.notes,
      startTime: dto.startTime,
      endTime: dto.endTime,
      maxStudents: dto.maxStudents,
      status: dto.status,
    });

    if (result.ok) {
      this.logger.info('Batch updated', {
        batchId,
        academyId: result.value.academyId,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req);
  }

  @Get()
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'List batches' })
  async list(
    @Query() query: ListBatchesQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.listBatches.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
    });

    return mapResultToResponse(result, req);
  }

  @Get(':batchId/students')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'List students in a batch' })
  async listStudents(
    @Param('batchId') batchId: string,
    @Query() query: ListBatchesQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.listBatchStudents.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      batchId,
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
    });

    return mapResultToResponse(result, req);
  }

  @Post(':batchId/students/:studentId')
  @Roles('OWNER', 'STAFF')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a student to a batch' })
  async addStudent(
    @Param('batchId') batchId: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.addStudentToBatch.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      batchId,
      studentId,
    });

    return mapResultToResponse(result, req, HttpStatus.CREATED);
  }

  @Delete(':batchId/students/:studentId')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Remove a student from a batch' })
  async removeStudent(
    @Param('batchId') batchId: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.removeStudentFromBatch.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      batchId,
      studentId,
    });

    return mapResultToResponse(result, req);
  }

  @Delete(':batchId')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Delete a batch (OWNER only, cascades student unassignment)' })
  async remove(
    @Param('batchId') batchId: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.deleteBatch.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      batchId,
    });

    if (result.ok) {
      this.logger.info('Batch deleted', {
        batchId,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req);
  }

  @Post(':batchId/photo')
  @Roles('OWNER', 'STAFF')
  @Throttle({ short: { limit: 15, ttl: 10_000 }, medium: { limit: 40, ttl: 60_000 }, long: { limit: 200, ttl: 900_000 } })
  @ApiOperation({ summary: 'Upload batch profile photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_FILE_SIZE } }))
  async uploadPhoto(
    @Param('batchId') batchId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const result = await this.uploadBatchPhoto.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      batchId,
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });

    return mapResultToResponse(result, req);
  }

  @Get(':batchId')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get a batch by ID' })
  async get(
    @Param('batchId') batchId: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getBatch.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      batchId,
    });

    return mapResultToResponse(result, req);
  }
}
