/**
 * fuseAndAudit — wraps fuseCreator() with audit logging.
 *
 * Use this everywhere fusion is called from a host function. Behavior:
 *   - SUCCESS: writes a row to creator_fusion_audit (status='success'), returns the FusionResult.
 *   - ERROR:   writes a row to creator_fusion_audit (status='error') with the error message + signals,
 *              and re-throws ONLY when `throwOnError === true`. Default is `false` so a transient
 *              fusion error never breaks the host function's primary write.
 *
 * The audit insert itself uses fire-and-forget (its failure is console.error'd but never thrown)
 * so audit-table outages can't cascade into pipeline outages.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { fuseCreator, type FusionSignals, type FusionResult } from './creator-fusion.ts';

type Supa = ReturnType<typeof createClient>;

export interface FuseAndAuditOptions {
  throwOnError?: boolean;
}

export async function fuseAndAudit(
  signals: FusionSignals,
  supabase: Supa,
  opts: FuseAndAuditOptions = {},
): Promise<FusionResult | null> {
  const source = signals.source || 'unknown';
  try {
    const result = await fuseCreator(signals, supabase);
    // Audit success — fire and forget, never throw.
    supabase
      .from('creator_fusion_audit')
      .insert({
        source,
        signals: signals as unknown as Record<string, unknown>,
        creator_id: result.creatorId,
        is_new: result.isNew,
        merged_absorbed_ids: result.mergedAbsorbedIds,
        aliases_written: result.aliasesWritten,
        status: 'success',
      })
      .then(({ error }) => {
        if (error) console.error(`[fuse-and-audit] audit insert failed (success path):`, error.message);
      });
    return result;
  } catch (e) {
    const errMsg = (e as Error).message;
    console.error(`[fuse-and-audit] fusion failed (source=${source}):`, errMsg);
    supabase
      .from('creator_fusion_audit')
      .insert({
        source,
        signals: signals as unknown as Record<string, unknown>,
        status: 'error',
        error: errMsg.slice(0, 1000),
      })
      .then(({ error }) => {
        if (error) console.error(`[fuse-and-audit] audit insert failed (error path):`, error.message);
      });
    if (opts.throwOnError) throw e;
    return null;
  }
}