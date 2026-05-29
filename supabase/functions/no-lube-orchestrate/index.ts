// no-lube-orchestrate — single entry point for the New Token + Re-sighting flow.
//
// Flow:
//   1) Look up the most recent successful no_lube_post_log row for this mint.
//   2) If none: compose+push to the PRIVATE channel only. Stamp last_mcap_at_post.
//   3) If a previous post exists AND current mcap >= FIRST-SEEN mcap * threshold:
//        compose+push to PRIVATE and PUBLIC, exposing {multiplier} in the template.
//        Bump times_posted, refresh last_mcap_at_post, store last_multiplier.
//   4) Otherwise: skip (returns skipped=true with reason).
//
// IMPORTANT: the multiplier is the cumulative growth factor from the very first
// time we ever logged this token (oldest successful post_log row). It is NOT
// based on the previous post's mcap and NOT based on how many times we've seen
// the token. Example: first seen at 26k, later 58k → 2X; later 120k → ~4X;
// later 380k → ~14X (all measured against the original 26k baseline).
//
// Threshold lives on no_lube_global_profile.multiplier_threshold (default 2.0).
// Compose handles all variable resolution, eligibility, and translation.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { assertUpdate } from '../_shared/db-assert.ts';

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

function isTerminalDead(rows: Array<{ verdict_class: string | null; price_change_24h: number | null; block_reason: string | null }>): boolean {
  if (rows.length === 0) return false;
  const firstThree = rows.slice(0, 3);
  return firstThree.length >= 3 && firstThree.every(r =>
    r.verdict_class === 'dead' ||
    (r.price_change_24h != null && Number(r.price_change_24h) <= -80) ||
    String(r.block_reason || '').toLowerCase().startsWith('dead')
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { mint, source_message_id } = await req.json();
    if (!mint || typeof mint !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'mint required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Terminal-dead guard: if the last 3 compose attempts were dead, do not
    // keep creating rows or retrying pushes for the same dead mint forever.
    const { data: recentAttempts } = await supabase
      .from('no_lube_post_log')
      .select('verdict_class, price_change_24h, block_reason, composed_at')
      .eq('token_mint', mint)
      .order('composed_at', { ascending: false })
      .limit(5);
    if (isTerminalDead((recentAttempts || []) as any[])) {
      return jsonResp({
        ok: true,
        flow: 'skipped',
        skipped: true,
        reason: 'terminal_dead_retry_guard',
        attempts_checked: recentAttempts?.length || 0,
        last_reason: recentAttempts?.[0]?.block_reason || null,
      });
    }

    // HARD GUARD: same (mint, source_message_id) can NEVER post twice.
    if (source_message_id != null) {
      const { data: dup } = await supabase
        .from('no_lube_post_log')
        .select('id, posted_at')
        .eq('token_mint', mint)
        .eq('source_message_id', source_message_id)
        .eq('posted', true)
        .limit(1);
      if (dup && dup.length > 0) {
        return jsonResp({
          ok: true, flow: 'skipped', skipped: true,
          reason: 'source_message_already_posted',
          source_message_id, existing_post_id: dup[0].id,
        });
      }
    }

    // Threshold from global profile
    let threshold = 2.0;
    const { data: gprof } = await supabase
      .from('no_lube_global_profile')
      .select('multiplier_threshold')
      .eq('id', 'singleton')
      .maybeSingle();
    if (gprof?.multiplier_threshold) threshold = Number(gprof.multiplier_threshold) || 2.0;

    // Last successful post for this mint (carries times_posted + last_multiplier)
    const { data: prevRows } = await supabase
      .from('no_lube_post_log')
      .select('id, times_posted, last_mcap_at_post, last_multiplier, mcap, posted_at, composed_at, post_kind, tg_message_id, channel')
      .eq('token_mint', mint)
      .eq('posted', true)
      .order('composed_at', { ascending: false })
      .limit(20);
    const allPrev = prevRows || [];
    const snapshotPost = allPrev.find((r: any) => r.post_kind === 'snapshot') || null;
    const bigPicturePosts = allPrev.filter((r: any) => r.post_kind === 'big_picture' || r.post_kind === 'milestone' || r.post_kind == null);
    const prev = bigPicturePosts[0] || null;
    const hasSnapshot = !!snapshotPost;
    const hasBigPicture = !!prev;
    const isFirstSighting = !hasBigPicture; // first big_picture = first "real" sighting

    // FIRST-SEEN mcap = the Insiders scrape's entry_market_cap. This is the
    // canonical baseline captured the moment the token was first announced
    // and never moves. We fall back to the oldest no_lube_post_log row only
    // if the lifecycle row is missing or has no entry mcap (legacy data).
    let firstMcap: number | null = null;
    let baselineSource: 'insiders' | 'post_log' | 'none' = 'none';
    const { data: lcRow } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('entry_market_cap, token_symbol, creator_wallet, creator_status, holders_refreshed_at, blackbox_harvested_at, mesh_hydrated_at, created_at, first_called_at')
      .eq('token_mint', mint)
      .maybeSingle();

    // ---- STRICT ELIGIBILITY GATE ----
    // Two-phase: SNAPSHOT fires fast with only minimal lifecycle row + entry mcap,
    // BIG_PICTURE fires after enrichment completes (holders + blackbox + mesh).
    const eligibilityBlockers: string[] = [];
    if (!lcRow) eligibilityBlockers.push('no_lifecycle_row');
    if (!lcRow?.entry_market_cap || Number(lcRow.entry_market_cap) <= 0) eligibilityBlockers.push('missing_entry_mcap');
    // Snapshot is the fast first-touch post — it does NOT require creator/KYC/holders
    // to be resolved. It pushes ticker + CA + raw DexScreener stats and a "more
    // intel incoming" note. We only enforce creator/enrichment gates for the
    // BIG PICTURE post that follows.
    if (!hasSnapshot && !hasBigPicture) {
      // SNAPSHOT path: only basics required
      if (eligibilityBlockers.length) {
        console.log('[no-lube-orchestrate] snapshot not_eligible', { mint, blockers: eligibilityBlockers });
        return jsonResp({
          ok: true, flow: 'skipped', skipped: true,
          reason: 'snapshot_not_eligible_yet',
          blockers: eligibilityBlockers,
          retry: false,
        });
      }
    } else {
      // BIG_PICTURE / milestone path: full enrichment required
      if (!lcRow?.creator_wallet) eligibilityBlockers.push('creator_unresolved');
      if (lcRow?.creator_status && !['resolved', 'kyc_resolved', 'no_kyc_reachable', 'unresolvable'].includes(String(lcRow.creator_status))) {
        eligibilityBlockers.push(`creator_status_${lcRow.creator_status}`);
      }
      if (!hasBigPicture) {
        if (!lcRow?.holders_refreshed_at) eligibilityBlockers.push('holders_not_refreshed');
        if (!lcRow?.blackbox_harvested_at) eligibilityBlockers.push('blackbox_not_harvested');
        if (!lcRow?.mesh_hydrated_at) eligibilityBlockers.push('mesh_not_hydrated');
      }
      if (eligibilityBlockers.length) {
        console.log('[no-lube-orchestrate] big_picture not_eligible', { mint, blockers: eligibilityBlockers });
        // Safety valve: if the token has been sitting waiting on enrichment
        // for more than 15 minutes, raise a single system_alert so a stalled
        // holders / mesh / blackbox pipeline becomes visible instead of
        // silently blocking Public posts forever.
        try {
          const enrichmentOnly = eligibilityBlockers.every((b) =>
            b === 'holders_not_refreshed' || b === 'blackbox_not_harvested' || b === 'mesh_not_hydrated'
          );
          const firstSeen = lcRow?.first_called_at || lcRow?.created_at;
          const ageMs = firstSeen ? Date.now() - new Date(firstSeen).getTime() : 0;
          if (enrichmentOnly && ageMs > 15 * 60 * 1000) {
            const stuckGate = eligibilityBlockers.sort().join(',');
            const alertKey = `no_lube_orchestrate.bigpicture_enrichment_stalled.${stuckGate}`;
            await supabase
              .from('system_alerts')
              .upsert({
                alert_key: alertKey,
                severity: 'warn',
                source: 'no-lube-orchestrate',
                message: `Big Picture blocked by enrichment gates for >15min: ${stuckGate}`,
                context: { mint, blockers: eligibilityBlockers, age_minutes: Math.round(ageMs / 60000), first_seen: firstSeen },
                last_seen_at: new Date().toISOString(),
                resolved_at: null,
              }, { onConflict: 'alert_key' });
          }
        } catch (e) {
          console.warn('[no-lube-orchestrate] safety-valve alert write failed (non-fatal):', (e as Error).message);
        }
        return jsonResp({
          ok: true, flow: 'skipped', skipped: true,
          reason: 'big_picture_not_eligible_yet',
          blockers: eligibilityBlockers,
          retry: false,
        });
      }
    }

    if (lcRow?.entry_market_cap != null && Number(lcRow.entry_market_cap) > 0) {
      firstMcap = Number(lcRow.entry_market_cap);
      baselineSource = 'insiders';
    } else if (prev) {
      const { data: firstRows } = await supabase
        .from('no_lube_post_log')
        .select('mcap, composed_at')
        .eq('token_mint', mint)
        .eq('posted', true)
        .not('mcap', 'is', null)
        .order('composed_at', { ascending: true })
        .limit(1);
      const f = firstRows?.[0];
      if (f?.mcap != null && isFinite(Number(f.mcap)) && Number(f.mcap) > 0) {
        firstMcap = Number(f.mcap);
        baselineSource = 'post_log';
      }
    }

    const composeUrl = `${supabaseUrl}/functions/v1/no-lube-compose`;
    const pushUrl = `${supabaseUrl}/functions/v1/no-lube-push`;
    const renderUrl = `${supabaseUrl}/functions/v1/no-lube-render-card`;
    const composeCardUrl = `${supabaseUrl}/functions/v1/no-lube-compose-card`;

    // Load public profile CTA config once (only used when pushing to public).
    const { data: pubProfile } = await supabase
      .from('no_lube_channel_profiles')
      .select('trade_bot_username, access_purchase_url, cta_button_text, language, telegram_chat_title')
      .eq('kind', 'public')
      .maybeSingle();
    const { data: privProfile } = await supabase
      .from('no_lube_channel_profiles')
      .select('language')
      .eq('kind', 'private')
      .maybeSingle();

    // Resolve the active template for a (profile_kind, language) pair.
    const loadTemplate = async (kind: 'private' | 'public', language: string | null) => {
      const lang = language || 'universal';
      // Prefer (kind, exact language, is_default), then (kind, exact language), then (kind, universal).
      const { data: rows } = await supabase
        .from('no_lube_card_templates')
        .select('id, profile_kind, language, show_url, url_to_show, show_ca, is_default')
        .eq('profile_kind', kind)
        .eq('enabled', true);
      const list = rows || [];
      const exact = list.filter(r => r.language === lang);
      const universal = list.filter(r => r.language === 'universal');
      const pickFrom = (arr: typeof list) =>
        arr.find(r => r.is_default) || arr[0] || null;
      return pickFrom(exact) || pickFrom(universal) || null;
    };

    const buildPublicCta = () => {
      const url = pubProfile?.access_purchase_url
        || (pubProfile?.trade_bot_username
              ? `https://t.me/${String(pubProfile.trade_bot_username).replace(/^@/, '')}`
              : null);
      if (!url) return null;
      return { text: pubProfile?.cta_button_text || '🚀 Buy / Get Access', url };
    };

    const composeAndPush = async (
      channel: Channel,
      mint: string,
      multiplier: number | null,
      opts: {
        image_url?: string | null;
        cta?: { text: string; url: string } | null;
        kind?: 'snapshot' | 'big_picture';
        reply_to_message_id?: number | null;
      } = {},
    ) => {
      const cmp = await invoke(composeUrl, anonKey, { mint, channel, multiplier, kind: opts.kind || 'big_picture' });
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
      const psh = await invoke(pushUrl, anonKey, {
        text, log_id: logId, channel,
        // Prefer an explicit image_url from the caller (big_picture AI card pipeline),
        // but fall back to whatever compose surfaced (snapshot mint-image toggle).
        image_url: opts.image_url || cmp.json?.image_url || undefined,
        cta: opts.cta || undefined,
        reply_to_message_id: opts.reply_to_message_id ?? undefined,
      });
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
      await assertUpdate(
        supabase.from('no_lube_post_log').update({
          times_posted: patch.times_posted,
          last_mcap_at_post: patch.last_mcap_at_post,
          last_multiplier: patch.last_multiplier,
          last_posted_at: new Date().toISOString(),
          source_message_id: source_message_id ?? null,
        }).eq('id', logId),
        'no_lube_post_log',
      );
    };

    // ---- PHASE 1: SNAPSHOT (fast first-touch, Private only, no image) ----
    if (!hasSnapshot && !hasBigPicture) {
      const result = await composeAndPush('private', mint, null, { kind: 'snapshot' });
      if (result.ok && result.pushed && result.mcap != null) {
        await stampPost(result.logId, {
          times_posted: 1,
          last_mcap_at_post: result.mcap,
          last_multiplier: null,
        });
      }
      return jsonResp({
        ok: true,
        flow: 'snapshot',
        threshold,
        baseline_source: baselineSource,
        base_mcap: firstMcap,
        results: { private: result },
      });
    }

    // ---- PHASE 2: BIG PICTURE (enriched, Private as reply to snapshot + Public) ----
    if (hasSnapshot && !hasBigPicture) {
      const snapshotMsgId = snapshotPost && (snapshotPost as any).channel === 'private'
        ? (snapshotPost as any).tg_message_id ?? null
        : null;
      const result = await composeAndPush('private', mint, null, {
        kind: 'big_picture',
        reply_to_message_id: snapshotMsgId,
      });
      if (result.ok && result.pushed && result.mcap != null) {
        await stampPost(result.logId, {
          times_posted: 1,
          last_mcap_at_post: result.mcap,
          last_multiplier: null,
        });
      }
      return jsonResp({
        ok: true,
        flow: 'big_picture',
        threshold,
        baseline_source: baselineSource,
        base_mcap: firstMcap,
        replied_to: snapshotMsgId,
        results: { private: result },
      });
    }

    // ---- RE-SIGHTING: compare current mcap against the FIRST-SEEN mcap ----
    // NOTE: baseMcap is intentionally computed AFTER the lock_entry_mcap RPC
    // below so the lowest-ever floor (Insiders scrape + BlackBox + HoldersIntel)
    // is what we measure the multiplier against. The math is simply:
    //   ratio = currentMcap / lowestEverEntryMcap
    // and we post when ratio crosses each new integer milestone (2x, 3x...).
    let baseMcap = Number(firstMcap ?? prev.mcap ?? 0);
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

    // LOWEST-EVER ENTRY LOCK: ensure the lifecycle row carries an immutable
    // entry baseline. The RPC now LEAST()s across every source we observe
    // (Insiders scrape, BlackBox/Dex sweeps, HoldersIntel discovery + floor)
    // and the current probe, then mirrors the floor into
    // holders_intel_seen_tokens.entry_mcap_usd so {mcEntry} matches.
    try {
      const tickerProbe = (probe.json?.vars as any)?.ticker || lcRow?.token_symbol || null;
      const { data: locked } = await supabase.rpc('lock_entry_mcap', {
        p_mint: mint,
        p_observed: probeMcap,
        p_symbol: tickerProbe,
        p_source: 'blackbox',
      });
      if (locked != null && Number(locked) > 0) {
        const lockedNum = Number(locked);
        // Always adopt the locked floor as the new baseline — the RPC is
        // downward-only, so this can only ever move baseMcap DOWN (or keep it
        // the same), never up. This guarantees the milestone math uses the
        // lowest mcap we've ever seen, exactly as described in the protocol.
        if (!firstMcap || lockedNum < firstMcap) {
          firstMcap = lockedNum;
          if (baselineSource === 'none') baselineSource = 'insiders';
        }
        baseMcap = lockedNum;
      }
    } catch (e) {
      console.warn('[no-lube-orchestrate] lock_entry_mcap failed (non-fatal):', (e as Error).message);
    }

    // Hard invariant: refuse to proceed without both market caps.
    if (!baseMcap || baseMcap <= 0) {
      return jsonResp({
        ok: true, flow: 'skipped', skipped: true,
        reason: 'missing_mcap_invariant',
        detail: { base_mcap: baseMcap, current_mcap: probeMcap },
      });
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

    // ---- MILESTONE GATE ----
    // Only post when we cross a NEW integer milestone (2x, 3x, 4x, ...).
    // While the price hovers in the same milestone band we stay silent so
    // the channel doesn't repeat "2.1x / 2.2x / 2.1x" over and over.
    const currentMilestone = Math.floor(ratio);
    const prevMilestone = prev.last_multiplier != null
      ? Math.floor(Number(prev.last_multiplier))
      : 1; // first re-sighting baseline = 1x band
    if (currentMilestone <= prevMilestone) {
      return jsonResp({
        ok: true,
        flow: 'skipped',
        skipped: true,
        reason: 'milestone_already_posted',
        threshold,
        base_mcap: baseMcap,
        current_mcap: probeMcap,
        ratio,
        current_milestone: currentMilestone,
        prev_milestone: prevMilestone,
      });
    }

    // ---- Probe ticker for both renders ----
    const tickerForCard =
      (probe.json?.vars?.ticker as string | undefined) || null;

    const renderCard = async (
      kind: 'private' | 'public',
      tpl: Awaited<ReturnType<typeof loadTemplate>>,
      profile: typeof pubProfile,
      brand: string,
    ) => {
      // Prefer the deterministic template compositor when a template exists.
      // This guarantees ticker / multiplier / mcap are NEVER mis-rendered by AI.
      if (tpl) {
        try {
          const composed = await invoke(composeCardUrl, anonKey, {
            mint,
            ticker: tickerForCard,
            multiplier,
            entry_mcap: baseMcap,
            current_mcap: probeMcap,
            language: profile?.language || 'en',
            profile_kind: kind,
            channel_brand: brand,
            token_image_url: (probe.json?.vars as any)?.token_image_url || null,
            banner_url: probe.json?.banner_url || null,
            has_paid_dex: probe.json?.has_paid_dex === true,
          });
          if (composed.ok && composed.json?.ok && composed.json?.image_url) {
            return String(composed.json.image_url);
          }
          console.warn(`[no-lube-orchestrate] compose-card ${kind} failed → falling back to AI render`, composed.json);
        } catch (e) {
          console.warn(`[no-lube-orchestrate] compose-card ${kind} threw → falling back to AI render`, e);
        }
        // MILESTONE INVARIANT: do NOT let the AI render fabricate imagery
        // when the deterministic compositor fails. Returning null here makes
        // composeAndPush push the post as text-only (no fake banner image).
        console.warn(`[no-lube-orchestrate] milestone ${kind}: compose-card unavailable, skipping AI fallback (no synthesized image).`);
        return null;
      }
      // Fallback: legacy AI render-card.
      try {
        const render = await invoke(renderUrl, anonKey, {
          mint,
          ticker: tickerForCard,
          multiplier,
          entry_mcap: baseMcap,
          current_mcap: probeMcap,
          language: profile?.language || 'en',
          profile_kind: kind,
          channel_brand: brand,
          show_url: tpl?.show_url ?? false,
          url_to_show: tpl?.url_to_show
            ?? (kind === 'public' && pubProfile?.trade_bot_username
                  ? `t.me/${String(pubProfile.trade_bot_username).replace(/^@/, '')}`
                  : null),
          show_ca: tpl?.show_ca ?? true,
        });
        if (render.ok && render.json?.ok && render.json?.image_url) {
          return String(render.json.image_url);
        }
        console.warn(`[no-lube-orchestrate] render-card ${kind} failed`, render.json);
      } catch (e) {
        console.warn(`[no-lube-orchestrate] render-card ${kind} threw`, e);
      }
      return null;
    };

    const publicTpl = await loadTemplate('public', pubProfile?.language || null);
    const privateTpl = await loadTemplate('private', privProfile?.language || null);

    // Render both cards in parallel (independent calls).
    const [privateImageUrl, publicImageUrl] = await Promise.all([
      renderCard('private', privateTpl, privProfile, 'Premium Insiders'),
      renderCard('public', publicTpl, pubProfile, pubProfile?.telegram_chat_title || 'No Lube Alpha'),
    ]);

    const privateResult = await composeAndPush('private', mint, multiplier, {
      image_url: privateImageUrl,
    });

    const publicCta = buildPublicCta();
    const publicResult = await composeAndPush('public', mint, multiplier, {
      image_url: publicImageUrl,
      cta: publicCta,
    });

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
      baseline_source: baselineSource,
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