/**
 * Pipeline event emitter — writes to autopsy_pipeline_events so the
 * Generate-Report dialog can subscribe via Supabase Realtime and show
 * exactly what's happening in every sub-step (running / ok / fail / skipped).
 *
 * Zero-tolerance rule: never silently swallow a write failure. We catch and
 * console.error here because progress logging must never block the actual
 * pipeline (UX > telemetry), but every miss is loud in the function logs.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

export type EventStatus = 'running' | 'ok' | 'fail' | 'skipped' | 'info';

export interface EmitArgs {
  candidateId?: string | null;
  phase: string;        // 'mesh-hydrate' | 'tx-timeline' | 'community-sweep' | …
  step: string;         // 'identity' | 'creator' | 'harvest-token-socials' | …
  status: EventStatus;
  detail?: string | null;
  reason?: string | null;
  outcome?: 'value_present' | 'confirmed_empty' | 'fetch_failed' | null;
}

export async function emitPipelineEvent(
  supabase: SupabaseClient,
  args: EmitArgs,
): Promise<void> {
  if (!args.candidateId) return; // no candidate yet → nothing for the dialog to show against
  try {
    const { error } = await supabase.from('autopsy_pipeline_events').insert({
      candidate_id: args.candidateId,
      phase: args.phase,
      step: args.step,
      status: args.status,
      detail: args.detail ?? null,
      reason: args.reason ?? null,
      outcome: args.outcome ?? null,
    });
    if (error) {
      console.error('[pipeline-events] insert failed:', error.message);
    }
  } catch (e) {
    console.error('[pipeline-events] emit threw:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Wrap an async sub-step so it auto-emits running → ok/fail with timing.
 * `mapResult` extracts a friendly detail string + outcome from the result.
 */
export async function tracedStep<T>(
  supabase: SupabaseClient,
  base: { candidateId?: string | null; phase: string; step: string },
  fn: () => Promise<T>,
  mapResult?: (r: T) => { detail?: string; outcome?: EmitArgs['outcome']; ok?: boolean; reason?: string },
): Promise<{ result: T | null; error?: string; ms: number }> {
  const t0 = Date.now();
  await emitPipelineEvent(supabase, { ...base, status: 'running' });
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    const m = mapResult?.(result) ?? {};
    const ok = m.ok !== false;
    await emitPipelineEvent(supabase, {
      ...base,
      status: ok ? 'ok' : 'fail',
      detail: m.detail ? `${m.detail} · ${ms}ms` : `${ms}ms`,
      reason: ok ? null : (m.reason ?? null),
      outcome: m.outcome ?? null,
    });
    return { result, ms };
  } catch (e) {
    const ms = Date.now() - t0;
    const reason = e instanceof Error ? e.message : String(e);
    await emitPipelineEvent(supabase, {
      ...base,
      status: 'fail',
      reason,
      detail: `${ms}ms`,
      outcome: 'fetch_failed',
    });
    return { result: null, ms, error: reason };
  }
}