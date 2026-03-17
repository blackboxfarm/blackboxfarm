/**
 * RUN LOGGER — Persistent edge function execution tracking
 * 
 * Wraps edge function handlers to log every invocation (start, end, status, duration)
 * to the `edge_function_runs` table for centralized monitoring.
 * 
 * Usage:
 *   import { withRunLog } from '../_shared/run-logger.ts';
 *   Deno.serve(withRunLog('my-function', async (req) => { ... return new Response(...) }));
 * 
 * Or for non-serve contexts:
 *   const logger = createRunLogger('my-function', 'cron');
 *   try { ... await logger.success({ tokensProcessed: 5 }); }
 *   catch (e) { await logger.fail(e.message); throw e; }
 */

import { createClient } from "npm:@supabase/supabase-js@2";

interface RunLogger {
  success: (metadata?: Record<string, unknown>) => Promise<void>;
  fail: (errorMessage: string, metadata?: Record<string, unknown>) => Promise<void>;
  /** Add metadata mid-run without completing */
  addMeta: (key: string, value: unknown) => void;
}

function getSupabase() {
  const url = Deno.env.get('SUPABASE_URL') || 'https://apxauapuusmgwbbzjgfl.supabase.co';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  if (!key) return null;
  return createClient(url, key);
}

/**
 * Create a standalone run logger for manual use in functions that
 * don't use the `withRunLog` wrapper (e.g. orchestrators, cron handlers).
 */
export function createRunLogger(
  functionName: string,
  invocationSource: string = 'unknown'
): RunLogger {
  const startTime = Date.now();
  const runId = crypto.randomUUID();
  const meta: Record<string, unknown> = {};

  // Fire-and-forget insert of the 'running' row
  const supabase = getSupabase();
  if (supabase) {
    supabase.from('edge_function_runs').insert({
      id: runId,
      function_name: functionName,
      invocation_source: invocationSource,
      status: 'running',
    }).then(({ error }) => {
      if (error) console.warn(`[RunLogger] insert failed: ${error.message}`);
    });
  }

  const complete = async (status: 'success' | 'error', errorMessage?: string, extraMeta?: Record<string, unknown>) => {
    const durationMs = Date.now() - startTime;
    const finalMeta = { ...meta, ...extraMeta };
    if (!supabase) return;
    try {
      await supabase.from('edge_function_runs').update({
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        status,
        error_message: errorMessage?.slice(0, 2000),
        metadata: finalMeta,
      }).eq('id', runId);
    } catch (e) {
      console.warn(`[RunLogger] update failed:`, e);
    }
  };

  return {
    success: (metadata) => complete('success', undefined, metadata),
    fail: (errorMessage, metadata) => complete('error', errorMessage, metadata),
    addMeta: (key, value) => { meta[key] = value; },
  };
}

/**
 * Wrap a Deno.serve handler with automatic run logging.
 * Detects invocation source from request body `{ source: 'orchestrator' }`.
 */
export function withRunLog(
  functionName: string,
  handler: (req: Request) => Promise<Response> | Response
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    // Pass through OPTIONS
    if (req.method === 'OPTIONS') {
      return handler(req);
    }

    // Try to detect invocation source from body
    let invocationSource = 'api';
    let clonedBody: string | undefined;
    try {
      clonedBody = await req.clone().text();
      if (clonedBody) {
        const parsed = JSON.parse(clonedBody);
        if (parsed.source) invocationSource = parsed.source;
      }
    } catch {
      // Not JSON or empty body — that's fine
    }

    const logger = createRunLogger(functionName, invocationSource);

    try {
      const response = await handler(req);
      const status = response.status;
      if (status >= 200 && status < 400) {
        await logger.success({ httpStatus: status });
      } else {
        await logger.fail(`HTTP ${status}`, { httpStatus: status });
      }
      return response;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await logger.fail(msg);
      throw error;
    }
  };
}
