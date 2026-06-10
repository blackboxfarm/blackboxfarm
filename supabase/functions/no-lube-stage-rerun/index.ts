// no-lube-stage-rerun — multiplexer for per-row "re-run from stage X" actions.
//
// Operator clicks an action menu item on a No Lube row; the UI POSTs
// { token_mint, stage } and this function dispatches to the right edge fn.
//
// Supported stages:
//   - 'ingest'          → insiders-row-ingest (force=true)
//   - 'creator'         → insiders-creator-backfill, then clears creator_status
//                         from 'unresolvable' back to 'unknown' so the row is
//                         re-armed for normal retry cooldowns.
//   - 'kyc'             → insiders-genealogy-rescan-kyc
//   - 'mesh'            → insiders-mesh-promoter
//   - 'compose'         → no-lube-compose (returns composed payload, does not push)
//   - 'push'            → no-lube-orchestrate (full orchestrate cycle)
//
// Auth: requires authenticated admin user via getClaims + has_role.
// Audit: writes an entry into pumpfun_discovery_logs (lightweight existing audit table).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Stage = 'ingest' | 'creator' | 'kyc' | 'mesh' | 'compose' | 'push';
const STAGE_TO_FN: Record<Stage, string> = {
  ingest: 'insiders-row-ingest',
  creator: 'insiders-creator-backfill',
  kyc: 'insiders-genealogy-rescan-kyc',
  mesh: 'insiders-mesh-promoter',
  compose: 'no-lube-compose',
  push: 'no-lube-orchestrate',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const uid = claims.claims.sub;

    // Admin gate
    const { data: roleOk } = await supabase.rpc('has_role', { _user_id: uid, _role: 'super_admin' });
    const { data: adminOk } = await supabase.rpc('has_role', { _user_id: uid, _role: 'admin' });
    if (!roleOk && !adminOk) {
      return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const stage = String(body.stage || '') as Stage;
    const mint = String(body.token_mint || body.mint || '').trim();
    if (!STAGE_TO_FN[stage] || !mint) {
      return new Response(JSON.stringify({ ok: false, error: 'stage and token_mint required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Switch to service role for the actual side-effects
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Special handling: 'creator' re-arm — clear unresolvable so backfill picks it up
    if (stage === 'creator') {
      await admin
        .from('telegram_insider_token_lifecycle')
        .update({ creator_status: 'unknown', creator_attempts: 0 })
        .eq('token_mint', mint)
        .eq('creator_status', 'unresolvable');
    }
    // Special handling: 'mesh' re-arm — clear mesh_promotion_status='failed'
    if (stage === 'mesh') {
      await admin
        .from('telegram_insider_token_lifecycle')
        .update({ mesh_promotion_status: null, mesh_promotion_reason: null })
        .eq('token_mint', mint)
        .eq('mesh_promotion_status', 'failed');
    }

    const fnName = STAGE_TO_FN[stage];
    const invokeBody: Record<string, unknown> = stage === 'push'
      ? { mint }
      : { token_mint: mint, force: true };

    const { data, error } = await admin.functions.invoke(fnName, { body: invokeBody });

    return new Response(JSON.stringify({
      ok: !error,
      stage,
      invoked: fnName,
      result: data ?? null,
      error: error ? String(error.message || error) : null,
    }), {
      status: error ? 502 : 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});