import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  Inject,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import type { CreateStudentUseCase } from '@application/student/use-cases/create-student.usecase';
import type { UpdateStudentUseCase } from '@application/student/use-cases/update-student.usecase';
import type { ListStudentsUseCase } from '@application/student/use-cases/list-students.usecase';
import type { GetStudentUseCase } from '@application/student/use-cases/get-student.usecase';
import type { ChangeStudentStatusUseCase } from '@application/student/use-cases/change-student-status.usecase';
import type { SoftDeleteStudentUseCase } from '@application/student/use-cases/soft-delete-student.usecase';
import type { SetStudentBatchesUseCase } from '@application/batch/use-cases/set-student-batches.usecase';
import type { GetStudentBatchesUseCase } from '@application/batch/use-cases/get-student-batches.usecase';
import type { InviteParentUseCase } from '@application/parent/use-cases/invite-parent.usecase';
import type { GetStudentCredentialsUseCase } from '@application/student/use-cases/get-student-credentials.usecase';
import type { GenerateStudentReportUseCase } from '@application/student/use-cases/generate-student-report.usecase';
import type { GenerateRegistrationFormUseCase } from '@application/student/use-cases/generate-registration-form.usecase';
import type { GenerateIdCardUseCase } from '@application/student/use-cases/generate-id-card.usecase';
import type { UploadStudentPhotoUseCase } from '@application/student/use-cases/upload-student-photo.usecase';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ChangeStudentStatusDto } from './dto/change-student-status.dto';
import { ListStudentsQueryDto } from './dto/list-students.query';
import { SetStudentBatchesDto } from './dto/set-student-batches.dto';
import { StudentReportQueryDto } from './dto/student-report.query';
import { mapResultToResponse } from '../common/result-mapper';
import { LOGGER_PORT } from '@shared/logging/logger.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import type { Request, Response } from 'express';
import { sanitizeFilename } from '@shared/utils/sanitize-filename';
import { MAX_IMAGE_FILE_SIZE } from '@shared/utils/image-validation';

@ApiTags('Students')
@ApiBearerAuth()
@Controller('students')
@UseGuards(JwtAuthGuard, RbacGuard)
export class StudentsController {
  constructor(
    @Inject('CREATE_STUDENT_USE_CASE') private readonly createStudent: CreateStudentUseCase,
    @Inject('UPDATE_STUDENT_USE_CASE') private readonly updateStudent: UpdateStudentUseCase,
    @Inject('LIST_STUDENTS_USE_CASE') private readonly listStudents: ListStudentsUseCase,
    @Inject('GET_STUDENT_USE_CASE') private readonly getStudent: GetStudentUseCase,
    @Inject('CHANGE_STUDENT_STATUS_USE_CASE')
    private readonly changeStudentStatus: ChangeStudentStatusUseCase,
    @Inject('SOFT_DELETE_STUDENT_USE_CASE')
    private readonly softDeleteStudent: SoftDeleteStudentUseCase,
    @Inject('SET_STUDENT_BATCHES_USE_CASE')
    private readonly setStudentBatches: SetStudentBatchesUseCase,
    @Inject('GET_STUDENT_BATCHES_USE_CASE')
    private readonly getStudentBatches: GetStudentBatchesUseCase,
    @Inject('INVITE_PARENT_USE_CASE')
    private readonly inviteParent: InviteParentUseCase,
    @Inject('GET_STUDENT_CREDENTIALS_USE_CASE')
    private readonly getStudentCredentials: GetStudentCredentialsUseCase,
    @Inject('GENERATE_STUDENT_REPORT_USE_CASE')
    private readonly generateStudentReport: GenerateStudentReportUseCase,
    @Inject('GENERATE_REGISTRATION_FORM_USE_CASE')
    private readonly generateRegistrationForm: GenerateRegistrationFormUseCase,
    @Inject('GENERATE_ID_CARD_USE_CASE')
    private readonly generateIdCard: GenerateIdCardUseCase,
    @Inject('UPLOAD_STUDENT_PHOTO_USE_CASE')
    private readonly uploadStudentPhoto: UploadStudentPhotoUseCase,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
  ) {}

  @Post()
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Create a student' })
  async create(
    @Body() dto: CreateStudentDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.createStudent.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      fullName: dto.fullName,
      dateOfBirth: dto.dateOfBirth,
      gender: dto.gender,
      address: dto.address,
      guardian: dto.guardian,
      joiningDate: dto.joiningDate,
      monthlyFee: dto.monthlyFee,
      mobileNumber: dto.mobileNumber,
      email: dto.email,
      fatherName: dto.fatherName,
      motherName: dto.motherName,
      aadhaarNumber: dto.aadhaarNumber,
      caste: dto.caste,
      whatsappNumber: dto.whatsappNumber,
      addressText: dto.addressText,
      instituteInfo: dto.instituteInfo,
      profilePhotoUrl: dto.profilePhotoUrl,
      password: dto.password,
    });

    if (result.ok) {
      this.logger.info('Student created', {
        studentId: result.value.id,
        academyId: result.value.academyId,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req, HttpStatus.CREATED);
  }

  @Post(':studentId/photo')
  @Roles('OWNER', 'STAFF')
  @Throttle({ short: { limit: 15, ttl: 10_000 }, medium: { limit: 40, ttl: 60_000 }, long: { limit: 200, ttl: 900_000 } })
  @ApiOperation({ summary: 'Upload student profile photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_FILE_SIZE } }))
  async uploadPhoto(
    @Param('studentId') studentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    if (!file) {
      return { success: false, error: { code: 'VALIDATION', message: 'No file uploaded' } };
    }
    const result = await this.uploadStudentPhoto.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });

    if (result.ok) {
      this.logger.info('Student photo uploaded', {
        studentId,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req);
  }

  @Patch(':studentId')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Update a student' })
  async update(
    @Param('studentId') studentId: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.updateStudent.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
      fullName: dto.fullName,
      dateOfBirth: dto.dateOfBirth,
      gender: dto.gender,
      address: dto.address,
      guardian: dto.guardian,
      joiningDate: dto.joiningDate,
      monthlyFee: dto.monthlyFee,
      mobileNumber: dto.mobileNumber,
      email: dto.email,
      fatherName: dto.fatherName,
      motherName: dto.motherName,
      aadhaarNumber: dto.aadhaarNumber,
      caste: dto.caste,
      whatsappNumber: dto.whatsappNumber,
      addressText: dto.addressText,
      instituteInfo: dto.instituteInfo,
      password: dto.password,
    });

    if (result.ok) {
      this.logger.info('Student updated', {
        studentId,
        academyId: result.value.academyId,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req);
  }

  @Get()
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'List students' })
  async list(
    @Query() query: ListStudentsQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.listStudents.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      search: query.search,
      feeFilter: query.feeFilter,
      month: query.month,
      batchId: query.batchId,
    });

    return mapResultToResponse(result, req);
  }

  @Get(':studentId')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get a student by ID' })
  async get(
    @Param('studentId') studentId: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getStudent.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
    });

    return mapResultToResponse(result, req);
  }

  @Patch(':studentId/status')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Change student status (owner only)' })
  async changeStatus(
    @Param('studentId') studentId: string,
    @Body() dto: ChangeStudentStatusDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.changeStudentStatus.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
      status: dto.status,
      reason: dto.reason,
    });

    if (result.ok) {
      this.logger.info('Student status changed', {
        studentId,
        newStatus: dto.status,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req);
  }

  @Delete(':studentId')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Soft delete a student (owner only)' })
  async delete(
    @Param('studentId') studentId: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.softDeleteStudent.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
    });

    if (result.ok) {
      this.logger.info('Student soft deleted', {
        studentId,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req);
  }

  @Put(':studentId/batches')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Set batch assignments for a student' })
  async setBatches(
    @Param('studentId') studentId: string,
    @Body() dto: SetStudentBatchesDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.setStudentBatches.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
      batchIds: dto.batchIds,
    });

    if (result.ok) {
      this.logger.info('Student batches updated', {
        studentId,
        batchCount: result.value.length,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req);
  }

  @Get(':studentId/batches')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get batch assignments for a student' })
  async getBatches(
    @Param('studentId') studentId: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getStudentBatches.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
    });

    return mapResultToResponse(result, req);
  }

  @Post(':studentId/invite-parent')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Invite a parent for a student (owner only)' })
  async inviteParentForStudent(
    @Param('studentId') studentId: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.inviteParent.execute({
      ownerUserId: user.userId,
      ownerRole: user.role,
      studentId,
    });

    if (result.ok) {
      this.logger.info('Parent invited', {
        studentId,
        parentId: result.value.parentId,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req, HttpStatus.CREATED);
  }

  @Get(':studentId/credentials')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get student login credentials for sharing' })
  async credentials(
    @Param('studentId') studentId: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getStudentCredentials.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
    });
    return mapResultToResponse(result, req);
  }

  @Get(':studentId/documents/report')
  @Roles('OWNER')
  @Throttle({ short: { limit: 15, ttl: 10_000 }, medium: { limit: 40, ttl: 60_000 }, long: { limit: 200, ttl: 900_000 } })
  @ApiOperation({ summary: 'Generate student report PDF (owner only)' })
  async report(
    @Param('studentId') studentId: string,
    @Query() query: StudentReportQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Res() res: Response,
  ) {
    const result = await this.generateStudentReport.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
      fromMonth: query.fromMonth,
      toMonth: query.toMonth,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error.message });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(result.value.filename)}"`);
    res.send(result.value.buffer);
  }

  @Get(':studentId/documents/registration-form')
  @Roles('OWNER')
  @Throttle({ short: { limit: 15, ttl: 10_000 }, medium: { limit: 40, ttl: 60_000 }, long: { limit: 200, ttl: 900_000 } })
  @ApiOperation({ summary: 'Generate registration form PDF (owner only)' })
  async registrationForm(
    @Param('studentId') studentId: string,
    @CurrentUser() user: CurrentUserType,
    @Res() res: Response,
  ) {
    const result = await this.generateRegistrationForm.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error.message });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(result.value.filename)}"`);
    res.send(result.value.buffer);
  }

  @Get(':studentId/documents/id-card')
  @Roles('OWNER')
  @Throttle({ short: { limit: 15, ttl: 10_000 }, medium: { limit: 40, ttl: 60_000 }, long: { limit: 200, ttl: 900_000 } })
  @ApiOperation({ summary: 'Generate student ID card PDF (owner only)' })
  async idCard(
    @Param('studentId') studentId: string,
    @CurrentUser() user: CurrentUserType,
    @Res() res: Response,
  ) {
    const result = await this.generateIdCard.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error.message });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(result.value.filename)}"`);
    res.send(result.value.buffer);
  }
}
