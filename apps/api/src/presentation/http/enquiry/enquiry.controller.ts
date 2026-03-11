import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Inject,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import type { CreateEnquiryUseCase } from '@application/enquiry/use-cases/create-enquiry.usecase';
import type { ListEnquiriesUseCase } from '@application/enquiry/use-cases/list-enquiries.usecase';
import type { GetEnquiryDetailUseCase } from '@application/enquiry/use-cases/get-enquiry-detail.usecase';
import type { UpdateEnquiryUseCase } from '@application/enquiry/use-cases/update-enquiry.usecase';
import type { AddFollowUpUseCase } from '@application/enquiry/use-cases/add-followup.usecase';
import type { CloseEnquiryUseCase } from '@application/enquiry/use-cases/close-enquiry.usecase';
import type { GetEnquirySummaryUseCase } from '@application/enquiry/use-cases/get-enquiry-summary.usecase';
import type { ConvertToStudentUseCase } from '@application/enquiry/use-cases/convert-to-student.usecase';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { UpdateEnquiryDto } from './dto/update-enquiry.dto';
import { AddFollowUpDto } from './dto/add-followup.dto';
import { CloseEnquiryDto } from './dto/close-enquiry.dto';
import { ConvertToStudentDto } from './dto/convert-to-student.dto';
import { ListEnquiriesQuery } from './dto/list-enquiries.query';
import { mapResultToResponse } from '../common/result-mapper';
import type { Request } from 'express';
import type { EnquirySource } from '@domain/enquiry/entities/enquiry.entity';
import type { ClosureReason } from '@domain/enquiry/entities/enquiry.entity';

@ApiTags('Enquiries')
@ApiBearerAuth()
@Controller('enquiries')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('OWNER', 'STAFF')
export class EnquiryController {
  constructor(
    @Inject('CREATE_ENQUIRY_USE_CASE')
    private readonly createEnquiry: CreateEnquiryUseCase,
    @Inject('LIST_ENQUIRIES_USE_CASE')
    private readonly listEnquiries: ListEnquiriesUseCase,
    @Inject('GET_ENQUIRY_DETAIL_USE_CASE')
    private readonly getEnquiryDetail: GetEnquiryDetailUseCase,
    @Inject('UPDATE_ENQUIRY_USE_CASE')
    private readonly updateEnquiry: UpdateEnquiryUseCase,
    @Inject('ADD_FOLLOWUP_USE_CASE')
    private readonly addFollowUp: AddFollowUpUseCase,
    @Inject('CLOSE_ENQUIRY_USE_CASE')
    private readonly closeEnquiry: CloseEnquiryUseCase,
    @Inject('GET_ENQUIRY_SUMMARY_USE_CASE')
    private readonly getEnquirySummary: GetEnquirySummaryUseCase,
    @Inject('CONVERT_TO_STUDENT_USE_CASE')
    private readonly convertToStudent: ConvertToStudentUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new enquiry' })
  async create(
    @Body() dto: CreateEnquiryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.createEnquiry.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      prospectName: dto.prospectName,
      guardianName: dto.guardianName,
      mobileNumber: dto.mobileNumber,
      whatsappNumber: dto.whatsappNumber,
      email: dto.email,
      address: dto.address,
      interestedIn: dto.interestedIn,
      source: dto.source as EnquirySource | undefined,
      notes: dto.notes,
      nextFollowUpDate: dto.nextFollowUpDate,
    });
    return mapResultToResponse(result, req, HttpStatus.CREATED);
  }

  @Get()
  @ApiOperation({ summary: 'List enquiries with filters' })
  async list(
    @Query() query: ListEnquiriesQuery,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.listEnquiries.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      status: query.status as 'ACTIVE' | 'CLOSED' | undefined,
      search: query.search,
      followUpToday: query.followUpToday === 'true',
      page: query.page ?? 1,
      pageSize: query.limit ?? 20,
    });
    return mapResultToResponse(result, req);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get enquiry summary counters' })
  async summary(@CurrentUser() user: CurrentUserType, @Req() req: Request) {
    const result = await this.getEnquirySummary.execute({
      actorUserId: user.userId,
      actorRole: user.role,
    });
    return mapResultToResponse(result, req);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get enquiry detail' })
  async detail(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getEnquiryDetail.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      enquiryId: id,
    });
    return mapResultToResponse(result, req);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update enquiry' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEnquiryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.updateEnquiry.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      enquiryId: id,
      prospectName: dto.prospectName,
      guardianName: dto.guardianName,
      mobileNumber: dto.mobileNumber,
      whatsappNumber: dto.whatsappNumber,
      email: dto.email,
      address: dto.address,
      interestedIn: dto.interestedIn,
      source: dto.source as EnquirySource | null | undefined,
      notes: dto.notes,
      nextFollowUpDate: dto.nextFollowUpDate,
    });
    return mapResultToResponse(result, req);
  }

  @Put(':id/close')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Close an enquiry (owner only)' })
  async close(
    @Param('id') id: string,
    @Body() dto: CloseEnquiryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.closeEnquiry.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      enquiryId: id,
      closureReason: dto.closureReason as ClosureReason,
      convertedStudentId: dto.convertedStudentId,
    });
    return mapResultToResponse(result, req);
  }

  @Post(':id/convert')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Convert enquiry to student (owner only)' })
  async convert(
    @Param('id') id: string,
    @Body() dto: ConvertToStudentDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.convertToStudent.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      enquiryId: id,
      joiningDate: dto.joiningDate,
      monthlyFee: dto.monthlyFee,
      dateOfBirth: dto.dateOfBirth,
      gender: dto.gender as 'MALE' | 'FEMALE' | 'OTHER',
      addressLine1: dto.addressLine1,
      city: dto.city,
      state: dto.state,
      pincode: dto.pincode,
    });
    return mapResultToResponse(result, req);
  }

  @Post(':id/follow-ups')
  @ApiOperation({ summary: 'Add a follow-up to an enquiry' })
  async addFollowUpAction(
    @Param('id') id: string,
    @Body() dto: AddFollowUpDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.addFollowUp.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      enquiryId: id,
      date: dto.date,
      notes: dto.notes,
      nextFollowUpDate: dto.nextFollowUpDate,
    });
    return mapResultToResponse(result, req);
  }
}
