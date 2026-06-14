/**
 * DB Write Assertion Utility
 * 
 * ZERO TOLERANCE for silent database failures.
 * Every DB write in every function MUST use these helpers
 * so that failures are always thrown, logged, and surfaced.
 * 
 * On failure: logs error, sends SMS to admin, then throws.
 */

const TWILIO_GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';
const TWILIO_FROM = '+16624814161';
const ADMIN_PHONE = '+12265835975';

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
 * Fire-and-forget SMS to admin on DB write failure.
 * Never throws — wrapped in try/catch so it can't break the throw chain.
 */
async function sendFailureSms(table: string, operation: string, error: { message: string; code?: string; details?: string }) {
  try {
    if (Deno.env.get('SMS_GLOBAL_KILL') !== 'false' || Deno.env.get('DB_ASSERT_SMS_ENABLED') !== 'true') {
      console.warn('[DB ASSERT] SMS disabled (SMS_GLOBAL_KILL on or DB_ASSERT_SMS_ENABLED!=true)');
      return;
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
      console.warn('[DB ASSERT] Cannot send SMS — missing LOVABLE_API_KEY or TWILIO_API_KEY');
      return;
    }

    const now = new Date().toISOString();
    // Pack maximum detail into 1600 chars
    let body = `🚨 DB WRITE FAILURE\n\n`;
    body += `⏰ ${now}\n`;
    body += `📋 Table: ${table}\n`;
    body += `🔧 Operation: ${operation}\n`;
    body += `❌ Error: ${error.message}\n`;
    if (error.code) body += `📟 Code: ${error.code}\n`;
    if (error.details) body += `📝 Details: ${error.details}\n`;
    body += `\n⚠️ This DB write was REJECTED. The calling function will throw and be marked as FAILED in edge_function_runs. Check Supabase logs immediately.`;

    // Truncate to 1600 chars max
    if (body.length > 1600) body = body.slice(0, 1597) + '...';

    const res = await fetch(`${TWILIO_GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: ADMIN_PHONE,
        From: TWILIO_FROM,
        Body: body,
      }),
    });

    if (!res.ok) {
      console.warn(`[DB ASSERT] SMS send failed: ${res.status}`);
    } else {
      console.log(`[DB ASSERT] Failure SMS sent to admin for ${operation} on ${table}`);
    }
  } catch (smsErr) {
    console.warn('[DB ASSERT] SMS send error (non-blocking):', smsErr);
  }
}

/**
 * Assert a Supabase insert/upsert/update/delete promise succeeded.
 * Throws DbWriteError on any failure — NO silent fails.
 * Sends SMS alert before throwing.
 */
export async function assertDbWrite<T>(
  promise: PromiseLike<{ data: T; error: any }>,
  table: string,
  operation: string = 'write'
): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    console.error(`[DB ASSERT FAIL] ${operation} on ${table}:`, error);
    // Fire-and-forget SMS — don't await to keep the throw fast
    sendFailureSms(table, operation, error);
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
