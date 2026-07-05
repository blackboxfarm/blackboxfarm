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
 *   logger.info('Starting batch processing');
 *   try { ... logger.info('Processed 23 records'); await logger.success({ tokensProcessed: 5 }); }
 *   catch (e) { logger.error('Fatal: DB timeout'); await logger.fail(e.message); throw e; }
 */

import { createClient } from "npm:@supabase/supabase-js@2";

interface LogEvent {
  level: 'info' | 'warn' | 'error';
  msg: string;
  data?: unknown;
  ts: string;
}

interface RunLogger {
  success: (metadata?: Record<string, unknown>) => Promise<void>;
  fail: (errorMessage: string, metadata?: Record<string, unknown>) => Promise<void>;
  /** Add metadata mid-run without completing */
  addMeta: (key: string, value: unknown) => void;
  /** Log an informational event */
  info: (msg: string, data?: unknown) => void;
  /** Log a warning event */
  warn: (msg: string, data?: unknown) => void;
  /** Log an error event (does NOT complete the run — call fail() for that) */
  error: (msg: string, data?: unknown) => void;
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
  const startedAt = new Date().toISOString();
  const meta: Record<string, unknown> = {};
  const events: LogEvent[] = [];

  const logEvent = (level: LogEvent['level'], msg: string, data?: unknown) => {
    events.push({ level, msg, data, ts: new Date().toISOString() });
    // Also console log for Supabase function logs viewer
    const prefix = `[${functionName}]`;
    if (level === 'error') console.error(prefix, msg, data ?? '');
    else if (level === 'warn') console.warn(prefix, msg, data ?? '');
    else console.log(prefix, msg, data ?? '');
  };

  // Fire-and-forget insert of the 'running' row
  const supabase = getSupabase();
  const startInsertPromise = supabase
    ? supabase.from('edge_function_runs').insert({
        id: runId,
        function_name: functionName,
        invocation_source: invocationSource,
        status: 'running',
        started_at: startedAt,
      })
    : null;

  if (supabase) {
    startInsertPromise?.then(({ error }) => {
      if (error) console.warn(`[RunLogger] insert failed: ${error.message}`);
    });
  }

  const complete = async (status: 'success' | 'error', errorMessage?: string, extraMeta?: Record<string, unknown>) => {
    const durationMs = Date.now() - startTime;
    const finalMeta = { ...meta, ...extraMeta, events };
    if (!supabase) return;
    try {
      if (startInsertPromise) {
        const { error: insertError } = await startInsertPromise;
        if (insertError) {
          console.warn(`[RunLogger] insert await failed: ${insertError.message}`);
        }
      }

      // Single upsert path with onConflict: 'id' avoids the duplicate-key race
      // between the fire-and-forget INSERT and this completion write.
      const { error: upsertError } = await supabase.from('edge_function_runs').upsert({
        id: runId,
        function_name: functionName,
        invocation_source: invocationSource,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        status,
        error_message: errorMessage?.slice(0, 2000),
        metadata: finalMeta,
      }, { onConflict: 'id' });

      if (upsertError) {
        throw upsertError;
      }
    } catch (e) {
      console.warn(`[RunLogger] update failed:`, e);
    }
  };

  return {
    success: (metadata) => complete('success', undefined, metadata),
    fail: (errorMessage, metadata) => complete('error', errorMessage, metadata),
    addMeta: (key, value) => { meta[key] = value; },
    info: (msg, data?) => logEvent('info', msg, data),
    warn: (msg, data?) => logEvent('warn', msg, data),
    error: (msg, data?) => logEvent('error', msg, data),
  };
}

/**
 * Wrap a Deno.serve handler with automatic run logging.
 * Detects invocation source from request body `{ source: 'orchestrator' }`.
 * 
 * The logger is attached to the request as `req._logger` for functions
 * that want to add rich context events during execution.
 */
export function withRunLog(
  functionName: string,
  handler: (req: Request, logger?: RunLogger) => Promise<Response> | Response
): (req: Request) => Promise<Response> {
  const finishRunLog = (promise: Promise<void>) => {
    promise.catch((error) => {
      console.warn(`[RunLogger] completion failed:`, error);
    });
  };

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
      const response = await handler(req, logger);
      const status = response.status;
      if (status >= 200 && status < 400) {
        finishRunLog(logger.success({ httpStatus: status }));
      } else {
        finishRunLog(logger.fail(`HTTP ${status}`, { httpStatus: status }));
      }
      return response;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      finishRunLog(logger.fail(msg));
      throw error;
    }
  };
}
