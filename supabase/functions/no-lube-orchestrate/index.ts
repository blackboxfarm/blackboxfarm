// no-lube-orchestrate — single entry point for the New Token + Re-sighting flow.
//
// Flow:
//   1) Look up the most recent successful no_lube_post_log row for this mint.
//   2) If none: compose+push to the PRIVATE channel only. Stamp last_mcap_at_post.
//   3) If a previous post exists AND current mcap >= last_mcap_at_post * threshold:
//        compose+push to PRIVATE and PUBLIC, exposing {multiplier} in the template.
//        Bump times_posted, refresh last_mcap_at_post, store last_multiplier.
//   4) Otherwise: skip (returns skipped=true with reason).
//
// Threshold lives on no_lube_global_profile.multiplier_threshold (default 2.0).
// Compose handles all variable resolution, eligibility, and translation.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Channel = 'private' | 'public';

async function invoke(fnUrl: string, anon: string, body: unknown) {
  const r = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anon}`,
      'apikey': anon,
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { mint } = await req.json();
    if (!mint || typeof mint !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'mint required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Threshold from global profile
    let threshold = 2.0;
    const { data: gprof } = await supabase
      .from('no_lube_global_profile')
      .select('multiplier_threshold')
      .eq('id', 'singleton')
      .maybeSingle();
    if (gprof?.multiplier_threshold) threshold = Number(gprof.multiplier_threshold) || 2.0;

    // Last successful post for this mint (carries last_mcap_at_post + times_posted)
    const { data: prevRows } = await supabase
      .from('no_lube_post_log')
      .select('id, times_posted, last_mcap_at_post, mcap, posted_at, composed_at')
      .eq('token_mint', mint)
      .eq('posted', true)
      .order('composed_at', { ascending: false })
      .limit(1);
    const prev = prevRows?.[0] || null;
    const isFirstSighting = !prev;

    const composeUrl = `${supabaseUrl}/functions/v1/no-lube-compose`;
    const pushUrl = `${supabaseUrl}/functions/v1/no-lube-push`;

    const composeAndPush = async (channel: Channel, mint: string, multiplier: number | null) => {
      const cmp = await invoke(composeUrl, anonKey, { mint, channel, multiplier });
      if (!cmp.ok || !cmp.json?.ok) {
        return { ok: false, channel, error: 'compose failed', detail: cmp.json, pushed: false };
      }
      if (!cmp.json.post_eligible) {
        return {
          ok: true, channel, pushed: false,
          eligible: false, block_reason: cmp.json.block_reason,
          logId: cmp.json.log_id, mcap: null,
        };
      }
      const text = cmp.json.text as string;
      const logId = cmp.json.log_id;
      let mcap: number | null = null;
      if (logId) {
        const { data: lr } = await supabase
          .from('no_lube_post_log').select('mcap').eq('id', logId).maybeSingle();
        mcap = lr?.mcap != null ? Number(lr.mcap) : null;
      }
      const psh = await invoke(pushUrl, anonKey, { text, log_id: logId, channel });
      const pushed = !!(psh.ok && psh.json?.ok);
      return {
        ok: true, channel, pushed, eligible: true,
        logId, mcap,
        message_id: psh.json?.message_id ?? null,
        push_error: pushed ? null : psh.json,
      };
    };

    const stampPost = async (
      logId: string | null | undefined,
      patch: { times_posted: number; last_mcap_at_post: number; last_multiplier: number | null },
    ) => {
      if (!logId) return;
      await supabase.from('no_lube_post_log').update({
        times_posted: patch.times_posted,
        last_mcap_at_post: patch.last_mcap_at_post,
        last_multiplier: patch.last_multiplier,
        last_posted_at: new Date().toISOString(),
      }).eq('id', logId);
    };

    // ---- FIRST SIGHTING → PRIVATE ONLY ----
    if (isFirstSighting) {
      const result = await composeAndPush('private', mint, null);
      if (result.ok && result.pushed && result.mcap != null) {
        await stampPost(result.logId, {
          times_posted: 1,
          last_mcap_at_post: result.mcap,
          last_multiplier: null,
        });
      }
      return jsonResp({
        ok: true,
        flow: 'first_sighting',
        threshold,
        results: { private: result },
      });
    }

    // ---- RE-SIGHTING: need current mcap from a fresh compose (private) to compare ----
    const baseMcap = Number(prev.last_mcap_at_post ?? prev.mcap ?? 0);
    if (!baseMcap) {
      // No baseline to compare against — treat as first sighting
      const result = await composeAndPush('private', mint, null);
      if (result.ok && result.pushed && result.mcap != null) {
        await stampPost(result.logId, {
          times_posted: (prev.times_posted ?? 0) + 1,
          last_mcap_at_post: result.mcap,
          last_multiplier: null,
        });
      }
      return jsonResp({ ok: true, flow: 'baseline_missing', threshold, results: { private: result } });
    }

    // Probe current mcap via compose (dry_run — no log row written).
    const probe = await invoke(composeUrl, anonKey, { mint, channel: 'private', dry_run: true });
    if (!probe.ok || !probe.json?.ok) {
      return jsonResp({ ok: false, error: 'compose probe failed', detail: probe.json }, 502);
    }
    const probeMcap: number | null =
      probe.json?.mcap != null && isFinite(Number(probe.json.mcap)) ? Number(probe.json.mcap) : null;

    if (probeMcap == null) {
      return jsonResp({ ok: true, flow: 'skipped', skipped: true, reason: 'current_mcap_unknown', threshold });
    }

    const ratio = probeMcap / baseMcap;
    if (ratio < threshold) {
      return jsonResp({
        ok: true,
        flow: 'skipped',
        skipped: true,
        reason: 'below_multiplier_threshold',
        threshold,
        base_mcap: baseMcap,
        current_mcap: probeMcap,
        ratio,
      });
    }

    // Threshold met — multiplier label rounds to nearest 0.1 above integer
    const multiplier = Math.round(ratio * 10) / 10;

    const privateResult = await composeAndPush('private', mint, multiplier);
    const publicResult = await composeAndPush('public', mint, multiplier);

    if (privateResult.ok && privateResult.pushed && privateResult.mcap != null) {
      await stampPost(privateResult.logId, {
        times_posted: (prev.times_posted ?? 1) + 1,
        last_mcap_at_post: privateResult.mcap,
        last_multiplier: multiplier,
      });
    }
    if (publicResult.ok && publicResult.pushed && publicResult.mcap != null) {
      await stampPost(publicResult.logId, {
        times_posted: (prev.times_posted ?? 1) + 1,
        last_mcap_at_post: publicResult.mcap,
        last_multiplier: multiplier,
      });
    }

    return jsonResp({
      ok: true,
      flow: 're_sighting',
      threshold,
      base_mcap: baseMcap,
      current_mcap: probeMcap,
      ratio,
      multiplier,
      results: { private: privateResult, public: publicResult },
    });
  } catch (e: any) {
    console.error('[no-lube-orchestrate] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});