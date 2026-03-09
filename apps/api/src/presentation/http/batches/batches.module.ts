import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BatchesController } from './batches.controller';
import { AuthModule } from '../auth/auth.module';
import { BatchModel, BatchSchema } from '@infrastructure/database/schemas/batch.schema';
import { StudentModel, StudentSchema } from '@infrastructure/database/schemas/student.schema';
import {
  StudentBatchModel,
  StudentBatchSchema,
} from '@infrastructure/database/schemas/student-batch.schema';
import { MongoBatchRepository } from '@infrastructure/repositories/mongo-batch.repository';
import { MongoStudentRepository } from '@infrastructure/repositories/mongo-student.repository';
import { MongoStudentBatchRepository } from '@infrastructure/repositories/mongo-student-batch.repository';
import { CloudinaryStorageService } from '@infrastructure/storage/cloudinary-storage.service';
import { BATCH_REPOSITORY } from '@domain/batch/ports/batch.repository';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { STUDENT_REPOSITORY } from '@domain/student/ports/student.repository';
import { STUDENT_BATCH_REPOSITORY } from '@domain/batch/ports/student-batch.repository';
import { FILE_STORAGE_PORT } from '@application/common/ports/file-storage.port';
import { TRANSACTION_PORT } from '@application/common/transaction.port';
import type { TransactionPort } from '@application/common/transaction.port';
import { MongoTransactionService } from '@infrastructure/database/mongo-transaction.service';
import { CreateBatchUseCase } from '@application/batch/use-cases/create-batch.usecase';
import { UpdateBatchUseCase } from '@application/batch/use-cases/update-batch.usecase';
import { ListBatchesUseCase } from '@application/batch/use-cases/list-batches.usecase';
import { GetBatchUseCase } from '@application/batch/use-cases/get-batch.usecase';
import { ListBatchStudentsUseCase } from '@application/batch/use-cases/list-batch-students.usecase';
import { AddStudentToBatchUseCase } from '@application/batch/use-cases/add-student-to-batch.usecase';
import { RemoveStudentFromBatchUseCase } from '@application/batch/use-cases/remove-student-from-batch.usecase';
import { DeleteBatchUseCase } from '@application/batch/use-cases/delete-batch.usecase';
import { UploadBatchPhotoUseCase } from '@application/batch/use-cases/upload-batch-photo.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import type { FileStoragePort } from '@application/common/ports/file-storage.port';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: BatchModel.name, schema: BatchSchema },
      { name: StudentModel.name, schema: StudentSchema },
      { name: StudentBatchModel.name, schema: StudentBatchSchema },
    ]),
  ],
  controllers: [BatchesController],
  providers: [
    { provide: BATCH_REPOSITORY, useClass: MongoBatchRepository },
    { provide: STUDENT_REPOSITORY, useClass: MongoStudentRepository },
    { provide: STUDENT_BATCH_REPOSITORY, useClass: MongoStudentBatchRepository },
    { provide: FILE_STORAGE_PORT, useClass: CloudinaryStorageService },
    { provide: TRANSACTION_PORT, useClass: MongoTransactionService },
    {
      provide: 'CREATE_BATCH_USE_CASE',
      useFactory: (userRepo: UserRepository, batchRepo: BatchRepository) =>
        new CreateBatchUseCase(userRepo, batchRepo),
      inject: [USER_REPOSITORY, BATCH_REPOSITORY],
    },
    {
      provide: 'UPDATE_BATCH_USE_CASE',
      useFactory: (userRepo: UserRepository, batchRepo: BatchRepository) =>
        new UpdateBatchUseCase(userRepo, batchRepo),
      inject: [USER_REPOSITORY, BATCH_REPOSITORY],
    },
    {
      provide: 'LIST_BATCHES_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        batchRepo: BatchRepository,
        studentBatchRepo: StudentBatchRepository,
      ) => new ListBatchesUseCase(userRepo, batchRepo, studentBatchRepo),
      inject: [USER_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY],
    },
    {
      provide: 'GET_BATCH_USE_CASE',
      useFactory: (userRepo: UserRepository, batchRepo: BatchRepository) =>
        new GetBatchUseCase(userRepo, batchRepo),
      inject: [USER_REPOSITORY, BATCH_REPOSITORY],
    },
    {
      provide: 'LIST_BATCH_STUDENTS_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        batchRepo: BatchRepository,
        studentBatchRepo: StudentBatchRepository,
        studentRepo: StudentRepository,
      ) => new ListBatchStudentsUseCase(userRepo, batchRepo, studentBatchRepo, studentRepo),
      inject: [USER_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY, STUDENT_REPOSITORY],
    },
    {
      provide: 'ADD_STUDENT_TO_BATCH_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        batchRepo: BatchRepository,
        studentBatchRepo: StudentBatchRepository,
        studentRepo: StudentRepository,
      ) => new AddStudentToBatchUseCase(userRepo, batchRepo, studentBatchRepo, studentRepo),
      inject: [USER_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY, STUDENT_REPOSITORY],
    },
    {
      provide: 'REMOVE_STUDENT_FROM_BATCH_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        batchRepo: BatchRepository,
        studentBatchRepo: StudentBatchRepository,
        studentRepo: StudentRepository,
      ) => new RemoveStudentFromBatchUseCase(userRepo, batchRepo, studentBatchRepo, studentRepo),
      inject: [USER_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY, STUDENT_REPOSITORY],
    },
    {
      provide: 'DELETE_BATCH_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        batchRepo: BatchRepository,
        studentBatchRepo: StudentBatchRepository,
        transaction: TransactionPort,
      ) => new DeleteBatchUseCase(userRepo, batchRepo, studentBatchRepo, transaction),
      inject: [USER_REPOSITORY, BATCH_REPOSITORY, STUDENT_BATCH_REPOSITORY, TRANSACTION_PORT],
    },
    {
      provide: 'UPLOAD_BATCH_PHOTO_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        batchRepo: BatchRepository,
        fileStorage: FileStoragePort,
      ) => new UploadBatchPhotoUseCase(userRepo, batchRepo, fileStorage),
      inject: [USER_REPOSITORY, BATCH_REPOSITORY, FILE_STORAGE_PORT],
    },
  ],
})
export class BatchesModule {}
