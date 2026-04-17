import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { reconcilePositionBalance } from '../_shared/flipit-reconcile.ts';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';

enableHeliusTracking('flipit-drift-sentinel');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * FlipIt Drift Sentinel
 *
 * Runs on a schedule (every 10 min) to detect DB ↔ on-chain drift.
 * For each holding position:
 *   - Fetch on-chain balance via Helius DAS
 *   - If drift > 5% → patch quantity, set needs_reconciliation = true (UI badge)
 *   - If on-chain balance = 0 → set ghost_position = true
 *
 * Prioritizes the stalest positions first (oldest last_chain_sync_at).
 * Caps each run at 25 positions to stay polite with Helius credits.
 */

const MAX_POSITIONS_PER_RUN = 25;

serve(
  withRunLog('flipit-drift-sentinel', async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Optional override: scan a single position by id
    let onlyPositionId: string | null = null;
    try {
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      if (body?.positionId) onlyPositionId = String(body.positionId);
    } catch (_) {
      // ignore
    }

    let query = supabase
      .from('flip_positions')
      .select('id, wallet_id, token_mint, quantity_tokens, quantity_tokens_raw, super_admin_wallets!flip_positions_wallet_id_fkey(pubkey)')
      .eq('status', 'holding')
      .order('last_chain_sync_at', { ascending: true, nullsFirst: true })
      .limit(MAX_POSITIONS_PER_RUN);

    if (onlyPositionId) {
      query = supabase
        .from('flip_positions')
        .select('id, wallet_id, token_mint, quantity_tokens, quantity_tokens_raw, super_admin_wallets!flip_positions_wallet_id_fkey(pubkey)')
        .eq('id', onlyPositionId);
    }

    const { data: positions, error } = await query;

    if (error) {
      console.error('[drift-sentinel] Failed to fetch positions:', error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!positions || positions.length === 0) {
      return new Response(JSON.stringify({ ok: true, scanned: 0, message: 'no holding positions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const summary = { scanned: 0, patched: 0, ghosts: 0, drifted: 0, errors: 0 };
    const details: any[] = [];

    for (const pos of positions) {
      const walletPubkey = (pos as any).super_admin_wallets?.pubkey;
      if (!walletPubkey) {
        summary.errors++;
        continue;
      }

      const result = await reconcilePositionBalance({
        walletPubkey,
        tokenMint: pos.token_mint,
        positionId: pos.id,
        storedRaw: pos.quantity_tokens_raw,
        storedUi: pos.quantity_tokens,
        supabase,
        driftTolerancePct: 5, // sentinel uses looser tolerance than pre-sell
      });

      summary.scanned++;
      if (!result.ok && result.reason === 'GHOST_POSITION') {
        summary.ghosts++;
        details.push({ id: pos.id, mint: pos.token_mint, status: 'ghost' });
      } else if (result.ok) {
        if (result.patched) summary.patched++;
        if (result.driftDetected) summary.drifted++;
        if (result.driftDetected) {
          details.push({
            id: pos.id,
            mint: pos.token_mint,
            status: 'drift',
            onChainUi: result.onChainUi,
          });
        }
      } else {
        summary.errors++;
      }

      // small delay between positions to be polite
      await new Promise((r) => setTimeout(r, 150));
    }

    console.log('[drift-sentinel] Scan complete:', summary);

    return new Response(JSON.stringify({ ok: true, ...summary, details }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  })
);
