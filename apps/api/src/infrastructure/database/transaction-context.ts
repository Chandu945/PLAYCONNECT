import { AsyncLocalStorage } from 'node:async_hooks';
import type { ClientSession } from 'mongoose';

const transactionStorage = new AsyncLocalStorage<ClientSession>();

/**
 * Run a callback within a transaction context so that
 * `getTransactionSession()` returns the active session.
 */
export function runInTransaction<T>(session: ClientSession, fn: () => Promise<T>): Promise<T> {
  return transactionStorage.run(session, fn);
}

/**
 * Returns the Mongoose ClientSession for the current transaction,
 * or `undefined` if no transaction is active.
 * Repositories pass this to Mongoose operations as `{ session }`.
 */
export function getTransactionSession(): ClientSession | undefined {
  return transactionStorage.getStore();
}
