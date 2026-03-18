/**
 * FUNNEL TRACKER — Lightweight helper to increment token pipeline stage counters
 * 
 * Usage:
 *   import { trackFunnelStage } from '../_shared/funnel-tracker.ts';
 *   await trackFunnelStage(supabase, 'discovered', 5);
 * 
 * Stages: discovered → enriched → watchlisted → qualified → bought → sold → dead → post_mortem
 */

type SupabaseClient = { rpc: (name: string, params: Record<string, unknown>) => Promise<{ error: unknown }> };

export async function trackFunnelStage(
  supabase: SupabaseClient,
  stage: string,
  count: number = 1
): Promise<void> {
  if (count <= 0) return;
  const today = new Date().toISOString().split('T')[0];
  try {
    await supabase.rpc('increment_funnel_stage', {
      p_date: today,
      p_stage: stage,
      p_count: count,
    });
  } catch (e) {
    console.warn(`[funnel-tracker] Failed to record ${stage}:`, e);
  }
}
