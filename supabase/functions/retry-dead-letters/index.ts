/**
 * RETRY DEAD LETTERS — Cron function to process retryable items from dead_letter_queue
 * 
 * Runs every 10 minutes via cron. Picks up pending/retrying items whose
 * next_retry_at has passed, attempts to re-execute the operation, and
 * marks them as resolved or increments retry count.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { withRunLog } from "../_shared/run-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Operation handlers — add new retry handlers here
type RetryHandler = (supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) => Promise<void>;

const RETRY_HANDLERS: Record<string, RetryHandler> = {
  tg_broadcast: async (supabase, payload) => {
    const { broadcastToTelegram } = await import("../_shared/telegram-broadcast.ts");
    const message = payload.message as string;
    const labels = (payload.labels as string[]) || ['BLACKBOX'];
    const delay = (payload.delay as number) || 0;
    await broadcastToTelegram(supabase, message, labels, delay);
  },

  admin_notification: async (supabase, payload) => {
    await supabase.from('admin_notifications').insert(payload);
  },
};

Deno.serve(withRunLog('retry-dead-letters', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch items ready for retry (limit 20 per run to avoid timeouts)
  const { data: items, error } = await supabase
    .from('dead_letter_queue')
    .select('*')
    .in('status', ['pending', 'retrying'])
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('[retry-dead-letters] Failed to fetch items:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!items || items.length === 0) {
    return new Response(JSON.stringify({ processed: 0, message: 'No items to retry' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let resolved = 0;
  let failed = 0;
  let exhausted = 0;

  for (const item of items) {
    const handler = RETRY_HANDLERS[item.operation];

    if (!handler) {
      // No handler — mark as exhausted with note
      await supabase.from('dead_letter_queue').update({
        status: 'exhausted',
        error_message: `No retry handler for operation: ${item.operation}`,
        updated_at: new Date().toISOString(),
      }).eq('id', item.id);
      exhausted++;
      continue;
    }

    try {
      // Mark as retrying
      await supabase.from('dead_letter_queue').update({
        status: 'retrying',
        updated_at: new Date().toISOString(),
      }).eq('id', item.id);

      await handler(supabase, item.payload);

      // Success — mark resolved
      await supabase.from('dead_letter_queue').update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', item.id);
      resolved++;
      console.log(`[retry-dead-letters] ✓ Resolved: ${item.source_function}/${item.operation}`);
    } catch (e: any) {
      const newRetryCount = (item.retry_count || 0) + 1;
      const isExhausted = newRetryCount >= (item.max_retries || 3);

      await supabase.from('dead_letter_queue').update({
        status: isExhausted ? 'exhausted' : 'pending',
        retry_count: newRetryCount,
        error_message: e.message?.slice(0, 2000),
        // Exponential backoff: 5min, 15min, 45min
        next_retry_at: isExhausted ? null : new Date(Date.now() + Math.pow(3, newRetryCount) * 5 * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', item.id);

      if (isExhausted) {
        exhausted++;
        console.error(`[retry-dead-letters] ✗ Exhausted: ${item.source_function}/${item.operation} after ${newRetryCount} retries`);
      } else {
        failed++;
        console.warn(`[retry-dead-letters] ↻ Retry ${newRetryCount}: ${item.source_function}/${item.operation}: ${e.message}`);
      }
    }
  }

  const summary = { processed: items.length, resolved, failed, exhausted };
  console.log(`[retry-dead-letters] Summary:`, summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));
