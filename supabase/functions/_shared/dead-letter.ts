/**
 * DEAD LETTER QUEUE — Enqueue failed operations for retry
 * 
 * Usage:
 *   import { enqueueDeadLetter } from '../_shared/dead-letter.ts';
 *   try { await broadcastToTelegram(...) }
 *   catch (e) { await enqueueDeadLetter('my-function', 'tg_broadcast', { message, targets }, e.message); }
 */

import { createClient } from "npm:@supabase/supabase-js@2";

export interface DeadLetterParams {
  sourceFunction: string;
  operation: string; // 'tg_broadcast', 'mesh_upsert', 'token_enrich', etc.
  payload: Record<string, unknown>;
  errorMessage: string;
  maxRetries?: number;
  retryDelayMinutes?: number;
}

export async function enqueueDeadLetter(params: DeadLetterParams): Promise<void>;
export async function enqueueDeadLetter(
  sourceFunction: string,
  operation: string,
  payload: Record<string, unknown>,
  errorMessage: string,
  maxRetries?: number
): Promise<void>;

export async function enqueueDeadLetter(
  paramsOrSource: DeadLetterParams | string,
  operation?: string,
  payload?: Record<string, unknown>,
  errorMessage?: string,
  maxRetries?: number
): Promise<void> {
  const p: DeadLetterParams = typeof paramsOrSource === 'string'
    ? {
        sourceFunction: paramsOrSource,
        operation: operation!,
        payload: payload!,
        errorMessage: errorMessage!,
        maxRetries,
      }
    : paramsOrSource;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://apxauapuusmgwbbzjgfl.supabase.co';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseKey) {
    console.warn('[DLQ] No Supabase key, cannot enqueue dead letter');
    return;
  }

  const retryDelay = p.retryDelayMinutes || 5;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.from('dead_letter_queue').insert({
      source_function: p.sourceFunction,
      operation: p.operation,
      payload: p.payload,
      error_message: p.errorMessage?.slice(0, 2000),
      max_retries: p.maxRetries || 3,
      next_retry_at: new Date(Date.now() + retryDelay * 60_000).toISOString(),
      status: 'pending',
    });

    if (error) {
      console.error('[DLQ] Failed to enqueue:', error.message);
    } else {
      console.log(`[DLQ] Enqueued: ${p.sourceFunction}/${p.operation}`);
    }
  } catch (e) {
    console.error('[DLQ] Exception enqueuing dead letter:', e);
  }
}
