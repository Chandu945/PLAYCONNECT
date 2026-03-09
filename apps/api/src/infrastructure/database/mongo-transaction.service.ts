import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { TransactionPort } from '@application/common/transaction.port';
import { runInTransaction } from './transaction-context';

@Injectable()
export class MongoTransactionService implements TransactionPort {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      session.startTransaction();
      const result = await runInTransaction(session, fn);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
