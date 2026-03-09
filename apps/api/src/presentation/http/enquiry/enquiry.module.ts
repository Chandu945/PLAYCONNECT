import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EnquiryController } from './enquiry.controller';
import { AuthModule } from '../auth/auth.module';
import { AcademyOnboardingModule } from '../academy-onboarding/academy-onboarding.module';
import { EnquiryModel, EnquirySchema } from '@infrastructure/database/schemas/enquiry.schema';
import { StudentModel, StudentSchema } from '@infrastructure/database/schemas/student.schema';
import { MongoEnquiryRepository } from '@infrastructure/repositories/mongo-enquiry.repository';
import { MongoStudentRepository } from '@infrastructure/repositories/mongo-student.repository';
import { ENQUIRY_REPOSITORY } from '@domain/enquiry/ports/enquiry.repository';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { CreateEnquiryUseCase } from '@application/enquiry/use-cases/create-enquiry.usecase';
import { ListEnquiriesUseCase } from '@application/enquiry/use-cases/list-enquiries.usecase';
import { GetEnquiryDetailUseCase } from '@application/enquiry/use-cases/get-enquiry-detail.usecase';
import { UpdateEnquiryUseCase } from '@application/enquiry/use-cases/update-enquiry.usecase';
import { AddFollowUpUseCase } from '@application/enquiry/use-cases/add-followup.usecase';
import { CloseEnquiryUseCase } from '@application/enquiry/use-cases/close-enquiry.usecase';
import { GetEnquirySummaryUseCase } from '@application/enquiry/use-cases/get-enquiry-summary.usecase';
import { ConvertToStudentUseCase } from '@application/enquiry/use-cases/convert-to-student.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { EnquiryRepository } from '@domain/enquiry/ports/enquiry.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import { STUDENT_REPOSITORY } from '@domain/student/ports/student.repository';
import type { TransactionPort } from '@application/common/transaction.port';
import { TRANSACTION_PORT } from '@application/common/transaction.port';
import { MongoTransactionService } from '@infrastructure/database/mongo-transaction.service';

@Module({
  imports: [
    AuthModule,
    AcademyOnboardingModule,
    MongooseModule.forFeature([
      { name: EnquiryModel.name, schema: EnquirySchema },
      { name: StudentModel.name, schema: StudentSchema },
    ]),
  ],
  controllers: [EnquiryController],
  providers: [
    { provide: ENQUIRY_REPOSITORY, useClass: MongoEnquiryRepository },
    { provide: STUDENT_REPOSITORY, useClass: MongoStudentRepository },
    { provide: TRANSACTION_PORT, useClass: MongoTransactionService },
    {
      provide: 'CREATE_ENQUIRY_USE_CASE',
      useFactory: (userRepo: UserRepository, enquiryRepo: EnquiryRepository) =>
        new CreateEnquiryUseCase(userRepo, enquiryRepo),
      inject: [USER_REPOSITORY, ENQUIRY_REPOSITORY],
    },
    {
      provide: 'LIST_ENQUIRIES_USE_CASE',
      useFactory: (userRepo: UserRepository, enquiryRepo: EnquiryRepository) =>
        new ListEnquiriesUseCase(userRepo, enquiryRepo),
      inject: [USER_REPOSITORY, ENQUIRY_REPOSITORY],
    },
    {
      provide: 'GET_ENQUIRY_DETAIL_USE_CASE',
      useFactory: (userRepo: UserRepository, enquiryRepo: EnquiryRepository) =>
        new GetEnquiryDetailUseCase(userRepo, enquiryRepo),
      inject: [USER_REPOSITORY, ENQUIRY_REPOSITORY],
    },
    {
      provide: 'UPDATE_ENQUIRY_USE_CASE',
      useFactory: (userRepo: UserRepository, enquiryRepo: EnquiryRepository) =>
        new UpdateEnquiryUseCase(userRepo, enquiryRepo),
      inject: [USER_REPOSITORY, ENQUIRY_REPOSITORY],
    },
    {
      provide: 'ADD_FOLLOWUP_USE_CASE',
      useFactory: (userRepo: UserRepository, enquiryRepo: EnquiryRepository) =>
        new AddFollowUpUseCase(userRepo, enquiryRepo),
      inject: [USER_REPOSITORY, ENQUIRY_REPOSITORY],
    },
    {
      provide: 'CLOSE_ENQUIRY_USE_CASE',
      useFactory: (userRepo: UserRepository, enquiryRepo: EnquiryRepository) =>
        new CloseEnquiryUseCase(userRepo, enquiryRepo),
      inject: [USER_REPOSITORY, ENQUIRY_REPOSITORY],
    },
    {
      provide: 'GET_ENQUIRY_SUMMARY_USE_CASE',
      useFactory: (userRepo: UserRepository, enquiryRepo: EnquiryRepository) =>
        new GetEnquirySummaryUseCase(userRepo, enquiryRepo),
      inject: [USER_REPOSITORY, ENQUIRY_REPOSITORY],
    },
    {
      provide: 'CONVERT_TO_STUDENT_USE_CASE',
      useFactory: (userRepo: UserRepository, enquiryRepo: EnquiryRepository, studentRepo: StudentRepository, transaction: TransactionPort) =>
        new ConvertToStudentUseCase(userRepo, enquiryRepo, studentRepo, transaction),
      inject: [USER_REPOSITORY, ENQUIRY_REPOSITORY, STUDENT_REPOSITORY, TRANSACTION_PORT],
    },
  ],
})
export class EnquiryModule {}
