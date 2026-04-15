/**
 * DB Write Assertion Utility
 * 
 * ZERO TOLERANCE for silent database failures.
 * Every DB write in every function MUST use these helpers
 * so that failures are always thrown, logged, and surfaced.
 * 
 * Usage:
 *   import { assertInsert, assertUpsert, assertUpdate } from '../_shared/db-assert.ts';
 *   
 *   await assertInsert(supabase.from('my_table').insert({ ... }), 'my_table');
 *   await assertUpsert(supabase.from('my_table').upsert({ ... }), 'my_table');
 *   await assertUpdate(supabase.from('my_table').update({ ... }).eq('id', id), 'my_table');
 */

export class DbWriteError extends Error {
  public table: string;
  public operation: string;
  public pgCode: string | undefined;
  public details: string | undefined;

  constructor(table: string, operation: string, error: { message: string; code?: string; details?: string }) {
    const msg = `[DB WRITE FAILED] ${operation} on "${table}": ${error.message}${error.code ? ` (code: ${error.code})` : ''}${error.details ? ` — ${error.details}` : ''}`;
    super(msg);
    this.name = 'DbWriteError';
    this.table = table;
    this.operation = operation;
    this.pgCode = error.code;
    this.details = error.details;
  }
}

/**
 * Assert a Supabase insert/upsert/update/delete promise succeeded.
 * Throws DbWriteError on any failure — NO silent fails.
 */
export async function assertDbWrite<T>(
  promise: PromiseLike<{ data: T; error: any }>,
  table: string,
  operation: string = 'write'
): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    console.error(`[DB ASSERT FAIL] ${operation} on ${table}:`, error);
    throw new DbWriteError(table, operation, error);
  }
  return data;
}

/** Convenience: assert an INSERT succeeded */
export function assertInsert<T>(
  promise: PromiseLike<{ data: T; error: any }>,
  table: string
): Promise<T> {
  return assertDbWrite(promise, table, 'INSERT');
}

/** Convenience: assert an UPSERT succeeded */
export function assertUpsert<T>(
  promise: PromiseLike<{ data: T; error: any }>,
  table: string
): Promise<T> {
  return assertDbWrite(promise, table, 'UPSERT');
}

/** Convenience: assert an UPDATE succeeded */
export function assertUpdate<T>(
  promise: PromiseLike<{ data: T; error: any }>,
  table: string
): Promise<T> {
  return assertDbWrite(promise, table, 'UPDATE');
}