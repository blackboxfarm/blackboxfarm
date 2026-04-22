// Insiders Mesh Row Action — per-token manual mesh control
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BAD_TIERS = new Set(['bad_actor', 'suspicious', 'rugger']);
const BAD_TRUST_LEVELS = new Set(['rugger', 'serial_rugger', 'scammer', 'blacklisted']);
const THIS_TOKEN_RUG_CAUSES = new Set(['rug_pull', 'lp_pulled', 'scam', 'rug']);

type Action = 'promote' | 'reconsider' | 'reject' | 'override_promote';

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Super admin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { token_mint, action, reason } = body as { token_mint?: string; action?: Action; reason?: string };

    if (!token_mint || !action) {
      return new Response(JSON.stringify({ error: "token_mint and action required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!['promote', 'reconsider', 'reject', 'override_promote'].includes(action)) {
      return new Response(JSON.stringify({ error: "invalid action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === 'override_promote' && !reason?.trim()) {
      return new Response(JSON.stringify({ error: "reason required for override_promote" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error: rowErr } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('*')
      .eq('token_mint', token_mint)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) {
      return new Response(JSON.stringify({ error: "token not found in lifecycle" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let creator = row.creator_wallet as string | null;
    if (!creator) {
      const { data: lc } = await supabase
        .from('token_lifecycle')
        .select('creator_wallet')
        .eq('token_mint', token_mint)
        .maybeSingle();
      creator = lc?.creator_wallet || null;
    }

    const [{ data: bs }, { data: rep }, { data: tl }] = await Promise.all([
      creator ? supabase.from('dev_behavior_scores').select('risk_tier').eq('wallet_address', creator).maybeSingle() : Promise.resolve({ data: null }),
      creator ? supabase.from('dev_wallet_reputation').select('trust_level, tokens_rugged, auto_blacklisted').eq('wallet_address', creator).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('token_lifecycle').select('death_cause, autopsy_notes, market_cap').eq('token_mint', token_mint).maybeSingle(),
    ]);

    const riskTier = (bs as any)?.risk_tier || null;
    const trustLevel = (rep as any)?.trust_level || null;
    const tokensRugged = (rep as any)?.tokens_rugged || 0;
    const autoBlacklisted = !!(rep as any)?.auto_blacklisted;
    const devHistoryRug =
      (riskTier && BAD_TIERS.has(riskTier)) ||
      (trustLevel && BAD_TRUST_LEVELS.has(trustLevel)) ||
      tokensRugged > 0 ||
      autoBlacklisted;

    const deathCause = (tl as any)?.death_cause || null;
    const thisTokenRug = !!(deathCause && THIS_TOKEN_RUG_CAUSES.has(deathCause));

    const baseTrace = {
      creator_wallet: creator,
      dev_history: {
        risk_tier: riskTier,
        trust_level: trustLevel,
        tokens_rugged: tokensRugged,
        auto_blacklisted: autoBlacklisted,
        has_history_rug: !!devHistoryRug,
      },
      this_token: {
        death_cause: deathCause,
        autopsy_notes: (tl as any)?.autopsy_notes || null,
        market_cap: (tl as any)?.market_cap ?? null,
        is_rug: thisTokenRug,
      },
      peak_multiplier: row.peak_multiplier,
      evaluated_at: new Date().toISOString(),
      manual_action_by: user.id,
      manual_action_at: new Date().toISOString(),
      manual_action: action,
      manual_reason: reason || null,
    };

    let newStatus = row.mesh_promotion_status;
    let newReason = row.mesh_promotion_reason;
    let meshAction: 'upserted' | 'deleted' | 'none' = 'none';

    if (action === 'reject') {
      if (creator) {
        await supabase
          .from('reputation_mesh')
          .delete()
          .eq('source_id', creator)
          .eq('linked_id', token_mint)
          .in('relationship', ['good_actor_creator', 'recovering_actor_creator']);
      }
      meshAction = 'deleted';
      newStatus = 'manually_rejected';
      newReason = `Manually rejected by admin${reason ? `: ${reason}` : ''}`;
      await supabase
        .from('telegram_insider_token_lifecycle')
        .update({
          mesh_promotion_status: newStatus,
          mesh_promotion_reason: newReason,
          mesh_decision_trace: { ...baseTrace, decision: 'manually_rejected', reason: newReason },
        })
        .eq('id', row.id);
    } else if (action === 'promote' || action === 'override_promote' || action === 'reconsider') {
      const force = action === 'override_promote';

      if (!creator) {
        return new Response(JSON.stringify({ error: "creator wallet not resolved — cannot promote" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (thisTokenRug && !force) {
        newStatus = 'rejected_rug';
        newReason = `Re-evaluated: this token still has rug evidence (death_cause=${deathCause})`;
        await supabase
          .from('telegram_insider_token_lifecycle')
          .update({
            mesh_promotion_status: newStatus,
            mesh_promotion_reason: newReason,
            is_rugged: true,
            dev_history_warning: !!devHistoryRug,
            mesh_decision_trace: { ...baseTrace, decision: 'rejected_rug', reason: 'this_token_rug_reconfirmed' },
          })
          .eq('id', row.id);
      } else {
        const peakX = row.peak_multiplier || 0;
        const baseLabel = `${peakX}x token (${row.token_symbol || token_mint.slice(0, 8)})`;
        const reasonText = force
          ? `ADMIN OVERRIDE — promoted manually. Reason: ${reason}`
          : devHistoryRug
            ? `Manually promoted ${baseLabel} — ⚠ dev history (prior rug on different token; this token clean)`
            : `Manually promoted ${baseLabel} — clean dev, no rug pattern`;

        const relationship = force
          ? 'good_actor_creator'
          : devHistoryRug ? 'recovering_actor_creator' : 'good_actor_creator';

        await supabase
          .from('reputation_mesh')
          .delete()
          .eq('source_id', creator)
          .eq('linked_id', token_mint)
          .in('relationship', ['good_actor_creator', 'recovering_actor_creator']);

        const { error: meshErr } = await supabase
          .from('reputation_mesh')
          .insert({
            source_type: 'wallet',
            source_id: creator,
            linked_type: 'token',
            linked_id: token_mint,
            relationship,
            confidence: Math.min(100, Math.round((force ? 60 : devHistoryRug ? 30 : 50) + peakX * 5)),
            evidence: {
              source: 'insiders_manual_admin',
              token_symbol: row.token_symbol,
              peak_multiplier: peakX,
              peak_market_cap: row.peak_market_cap,
              first_called_at: row.first_called_at,
              dev_history_warning: !!devHistoryRug,
              admin_override: force,
              admin_reason: reason || null,
              admin_user_id: user.id,
            },
            discovered_via: 'insiders_manual_admin',
          });
        if (meshErr) throw meshErr;
        meshAction = 'upserted';

        newStatus = 'promoted';
        newReason = reasonText;
        await supabase
          .from('telegram_insider_token_lifecycle')
          .update({
            creator_wallet: creator,
            creator_risk_tier: riskTier,
            mesh_promotion_status: newStatus,
            mesh_promoted_at: new Date().toISOString(),
            mesh_promotion_reason: newReason,
            dev_history_warning: !!devHistoryRug,
            is_rugged: false,
            mesh_decision_trace: {
              ...baseTrace,
              decision: 'promoted',
              reason: force ? 'admin_override' : (devHistoryRug ? 'clean_token_with_dev_history' : 'clean_dev_clean_token'),
              manual_override: force,
            },
          })
          .eq('id', row.id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      action,
      mesh_action: meshAction,
      new_status: newStatus,
      new_reason: newReason,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error('[insiders-mesh-row-action] FATAL:', err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
