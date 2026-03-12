import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudentsController } from './students.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { StudentModel, StudentSchema } from '@infrastructure/database/schemas/student.schema';
import { FeeDueModel, FeeDueSchema } from '@infrastructure/database/schemas/fee-due.schema';
import {
  StudentBatchModel,
  StudentBatchSchema,
} from '@infrastructure/database/schemas/student-batch.schema';
import { BatchModel, BatchSchema } from '@infrastructure/database/schemas/batch.schema';
import { ParentModule } from '../parent/parent.module';
import { MongoBatchRepository } from '@infrastructure/repositories/mongo-batch.repository';
import { MongoStudentRepository } from '@infrastructure/repositories/mongo-student.repository';
import { MongoStudentQueryRepository } from '@infrastructure/repositories/mongo-student-query.repository';
import { MongoStudentBatchRepository } from '@infrastructure/repositories/mongo-student-batch.repository';
import { MongoFeeDueRepository } from '@infrastructure/repositories/mongo-fee-due.repository';
import { MongoTransactionService } from '@infrastructure/database/mongo-transaction.service';
import { FEE_DUE_REPOSITORY } from '@domain/fee/ports/fee-due.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import { STUDENT_REPOSITORY } from '@domain/student/ports/student.repository';
import { STUDENT_QUERY_REPOSITORY } from '@domain/student/ports/student-query.repository';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { BATCH_REPOSITORY } from '@domain/batch/ports/batch.repository';
import { STUDENT_BATCH_REPOSITORY } from '@domain/batch/ports/student-batch.repository';
import { CreateStudentUseCase } from '@application/student/use-cases/create-student.usecase';
import { UpdateStudentUseCase } from '@application/student/use-cases/update-student.usecase';
import { ListStudentsUseCase } from '@application/student/use-cases/list-students.usecase';
import { GetStudentUseCase } from '@application/student/use-cases/get-student.usecase';
import { ChangeStudentStatusUseCase } from '@application/student/use-cases/change-student-status.usecase';
import { SoftDeleteStudentUseCase } from '@application/student/use-cases/soft-delete-student.usecase';
import { GetStudentCredentialsUseCase } from '@application/student/use-cases/get-student-credentials.usecase';
import { GenerateStudentReportUseCase } from '@application/student/use-cases/generate-student-report.usecase';
import { GenerateRegistrationFormUseCase } from '@application/student/use-cases/generate-registration-form.usecase';
import { GenerateIdCardUseCase } from '@application/student/use-cases/generate-id-card.usecase';
import { UploadStudentPhotoUseCase } from '@application/student/use-cases/upload-student-photo.usecase';
import { SetStudentBatchesUseCase } from '@application/batch/use-cases/set-student-batches.usecase';
import { GetStudentBatchesUseCase } from '@application/batch/use-cases/get-student-batches.usecase';
import { FILE_STORAGE_PORT } from '@application/common/ports/file-storage.port';
import type { FileStoragePort } from '@application/common/ports/file-storage.port';
import { CloudinaryStorageService } from '@infrastructure/storage/cloudinary-storage.service';
import { AUDIT_RECORDER_PORT } from '@application/audit/ports/audit-recorder.port';
import type { AuditRecorderPort } from '@application/audit/ports/audit-recorder.port';
import { PASSWORD_HASHER } from '@application/identity/ports/password-hasher.port';
import type { PasswordHasher } from '@application/identity/ports/password-hasher.port';
import { TRANSACTION_PORT } from '@application/common/transaction.port';
import type { TransactionPort } from '@application/common/transaction.port';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { StudentQueryRepository } from '@domain/student/ports/student-query.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import { ACADEMY_REPOSITORY } from '@domain/academy/ports/academy.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import { STUDENT_ATTENDANCE_REPOSITORY } from '@domain/attendance/ports/student-attendance.repository';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import { AcademyModel, AcademySchema } from '@infrastructure/database/schemas/academy.schema';
import {
  StudentAttendanceModel,
  StudentAttendanceSchema,
} from '@infrastructure/database/schemas/student-attendance.schema';
import { MongoAcademyRepository } from '@infrastructure/repositories/mongo-academy.repository';
import { MongoStudentAttendanceRepository } from '@infrastructure/repositories/mongo-student-attendance.repository';

@Module({
  imports: [
    AuthModule,
    AuditLogsModule,
    ParentModule,
    MongooseModule.forFeature([
      { name: StudentModel.name, schema: StudentSchema },
      { name: FeeDueModel.name, schema: FeeDueSchema },
      { name: StudentBatchModel.name, schema: StudentBatchSchema },
      { name: BatchModel.name, schema: BatchSchema },
      { name: AcademyModel.name, schema: AcademySchema },
      { name: StudentAttendanceModel.name, schema: StudentAttendanceSchema },
    ]),
  ],
  controllers: [StudentsController],
  providers: [
    { provide: FEE_DUE_REPOSITORY, useClass: MongoFeeDueRepository },
    { provide: FILE_STORAGE_PORT, useClass: CloudinaryStorageService },
    { provide: STUDENT_REPOSITORY, useClass: MongoStudentRepository },
    { provide: STUDENT_QUERY_REPOSITORY, useClass: MongoStudentQueryRepository },
    { provide: STUDENT_BATCH_REPOSITORY, useClass: MongoStudentBatchRepository },
    { provide: BATCH_REPOSITORY, useClass: MongoBatchRepository },
    { provide: ACADEMY_REPOSITORY, useClass: MongoAcademyRepository },
    { provide: STUDENT_ATTENDANCE_REPOSITORY, useClass: MongoStudentAttendanceRepository },
    { provide: TRANSACTION_PORT, useClass: MongoTransactionService },
    {
      provide: 'CREATE_STUDENT_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        audit: AuditRecorderPort,
        passwordHasher: PasswordHasher,
      ) => new CreateStudentUseCase(userRepo, studentRepo, audit, passwordHasher),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, AUDIT_RECORDER_PORT, PASSWORD_HASHER],
    },
    {
      provide: 'UPDATE_STUDENT_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        audit: AuditRecorderPort,
        passwordHasher: PasswordHasher,
      ) => new UpdateStudentUseCase(userRepo, studentRepo, audit, passwordHasher),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, AUDIT_RECORDER_PORT, PASSWORD_HASHER],
    },
    {
      provide: 'LIST_STUDENTS_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        studentQueryRepo: StudentQueryRepository,
        studentBatchRepo: StudentBatchRepository,
      ) => new ListStudentsUseCase(userRepo, studentRepo, studentQueryRepo, studentBatchRepo),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, STUDENT_QUERY_REPOSITORY, STUDENT_BATCH_REPOSITORY],
    },
    {
      provide: 'GET_STUDENT_USE_CASE',
      useFactory: (userRepo: UserRepository, studentRepo: StudentRepository) =>
        new GetStudentUseCase(userRepo, studentRepo),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY],
    },
    {
      provide: 'CHANGE_STUDENT_STATUS_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        audit: AuditRecorderPort,
        feeDueRepo: FeeDueRepository,
        transaction: TransactionPort,
      ) => new ChangeStudentStatusUseCase(userRepo, studentRepo, audit, feeDueRepo, transaction),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, AUDIT_RECORDER_PORT, FEE_DUE_REPOSITORY, TRANSACTION_PORT],
    },
    {
      provide: 'SOFT_DELETE_STUDENT_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        audit: AuditRecorderPort,
        feeDueRepo: FeeDueRepository,
      ) => new SoftDeleteStudentUseCase(userRepo, studentRepo, audit, feeDueRepo),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, AUDIT_RECORDER_PORT, FEE_DUE_REPOSITORY],
    },
    {
      provide: 'SET_STUDENT_BATCHES_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        batchRepo: BatchRepository,
        studentBatchRepo: StudentBatchRepository,
      ) => new SetStudentBatchesUseCase(userRepo, studentRepo, batchRepo, studentBatchRepo),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY],
    },
    {
      provide: 'GET_STUDENT_BATCHES_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        batchRepo: BatchRepository,
        studentBatchRepo: StudentBatchRepository,
      ) => new GetStudentBatchesUseCase(userRepo, studentRepo, batchRepo, studentBatchRepo),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY],
    },
    {
      provide: 'GET_STUDENT_CREDENTIALS_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        academyRepo: AcademyRepository,
      ) => new GetStudentCredentialsUseCase(userRepo, studentRepo, academyRepo),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, ACADEMY_REPOSITORY],
    },
    {
      provide: 'GENERATE_STUDENT_REPORT_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        academyRepo: AcademyRepository,
        feeDueRepo: FeeDueRepository,
        attendanceRepo: StudentAttendanceRepository,
      ) => new GenerateStudentReportUseCase(userRepo, studentRepo, academyRepo, feeDueRepo, attendanceRepo),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, ACADEMY_REPOSITORY, FEE_DUE_REPOSITORY, STUDENT_ATTENDANCE_REPOSITORY],
    },
    {
      provide: 'GENERATE_REGISTRATION_FORM_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        academyRepo: AcademyRepository,
      ) => new GenerateRegistrationFormUseCase(userRepo, studentRepo, academyRepo),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, ACADEMY_REPOSITORY],
    },
    {
      provide: 'GENERATE_ID_CARD_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        academyRepo: AcademyRepository,
        batchRepo: BatchRepository,
        studentBatchRepo: StudentBatchRepository,
      ) => new GenerateIdCardUseCase(userRepo, studentRepo, academyRepo, batchRepo, studentBatchRepo),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, ACADEMY_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY],
    },
    {
      provide: 'UPLOAD_STUDENT_PHOTO_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        fileStorage: FileStoragePort,
      ) => new UploadStudentPhotoUseCase(userRepo, studentRepo, fileStorage),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, FILE_STORAGE_PORT],
    },
  ],
})
export class StudentsModule {}
