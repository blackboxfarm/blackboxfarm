// nolube-channel-roster-sync
// Enumerates the No Lube Public + Private channel rosters via MTProto, diffs
// against `nolube_channel_members`, applies spike-detection seed tagging,
// and writes a snapshot row for charting.
//
// Invocation:
//   POST /functions/v1/nolube-channel-roster-sync
//   body (optional): { profile_key?: string, channel_kinds?: ('public'|'private')[], force_baseline?: boolean }
// Default profile_key = 'no_lube'. Cron runs it every 15 min.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TelegramClient, MemoryStorage } from "@mtcute/deno";
import { convertFromTelethonSession } from "@mtcute/convert";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WINDOW_MINUTES = 15;
const SPIKE_MIN_JOINS = 20;
const SPIKE_MEDIAN_MULTIPLIER = 5;
const ROSTER_PAGE_LIMIT = 200;
const ROSTER_HARD_CAP = 10000;

function getEnv(name: string, required = true): string {
  const v = Deno.env.get(name);
  if (!v && required) throw new Error(`${name} not configured`);
  return v ?? '';
}

function getSupabase() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

async function loadSessionString(supabase: ReturnType<typeof getSupabase>): Promise<string> {
  const fromEnv = Deno.env.get('TELEGRAM_SESSION_STRING');
  if (fromEnv) return fromEnv;
  const { data } = await supabase
    .from('telegram_mtproto_session')
    .select('session_string')
    .eq('is_active', true)
    .maybeSingle();
  if (!data?.session_string) throw new Error('No MTProto session available (TELEGRAM_SESSION_STRING or telegram_mtproto_session row)');
  return data.session_string;
}

interface RosterMember {
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
}

async function fetchFullRoster(client: TelegramClient, chatId: number): Promise<RosterMember[]> {
  const out: RosterMember[] = [];
  let offset = 0;
  while (out.length < ROSTER_HARD_CAP) {
    const batch: any[] = await (client as any).getChatMembers(chatId, { limit: ROSTER_PAGE_LIMIT, offset });
    if (!batch || batch.length === 0) break;
    for (const m of batch) {
      const user = m?.user ?? m;
      const id = Number(user?.id);
      if (!Number.isFinite(id)) continue;
      if (user?.isBot) continue;
      out.push({
        telegram_user_id: id,
        username: user?.username ?? null,
        first_name: user?.firstName ?? null,
        last_name: user?.lastName ?? null,
      });
    }
    if (batch.length < ROSTER_PAGE_LIMIT) break;
    offset += batch.length;
  }
  return out;
}

async function rollingMedianJoins(
  supabase: ReturnType<typeof getSupabase>,
  chatId: string,
): Promise<number> {
  // Median of organic_joins_window over last 7 days of snapshots.
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from('nolube_channel_snapshots')
    .select('organic_joins_window')
    .eq('chat_id', chatId)
    .gte('ts', since)
    .order('ts', { ascending: false })
    .limit(700);
  const arr = (data ?? []).map(r => Number(r.organic_joins_window || 0)).sort((a, b) => a - b);
  if (arr.length === 0) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}

interface SyncOutcome {
  channel_kind: 'public' | 'private';
  chat_id: string;
  total_members: number;
  new_inserts: number;
  marked_left: number;
  reactivated: number;
  seed_batch_id: string | null;
  spike_triggered: boolean;
  baseline: boolean;
}

async function syncChannel(opts: {
  supabase: ReturnType<typeof getSupabase>;
  client: TelegramClient;
  profileKey: string;
  channelKind: 'public' | 'private';
  chatId: string;
  forceBaseline: boolean;
}): Promise<SyncOutcome> {
  const { supabase, client, profileKey, channelKind, chatId, forceBaseline } = opts;
  const chatIdNum = Number(chatId);

  const roster = await fetchFullRoster(client, chatIdNum);
  const rosterIds = new Set(roster.map(r => r.telegram_user_id));

  // Determine if this is the first-ever sync for this chat → baseline tag everyone.
  const { count: existing } = await supabase
    .from('nolube_channel_members')
    .select('id', { count: 'exact', head: true })
    .eq('chat_id', chatId);
  const isBaseline = forceBaseline || (existing ?? 0) === 0;

  let baselineBatchId: string | null = null;
  if (isBaseline && roster.length > 0) {
    const { data: batch } = await supabase
      .from('nolube_seed_batches')
      .insert({
        profile_key: profileKey,
        channel_kind: channelKind,
        chat_id: chatId,
        detected_via: 'baseline',
        expected_count: roster.length,
        actual_count: roster.length,
        ended_at: new Date().toISOString(),
        notes: 'Initial roster baseline — pre-existing seeded members.',
      })
      .select('id')
      .single();
    baselineBatchId = batch?.id ?? null;
  }

  // Existing rows for this chat (need joined_at + left_at + is_seed to compute diffs).
  const { data: existingRows } = await supabase
    .from('nolube_channel_members')
    .select('telegram_user_id,left_at,is_seed,classification_locked,seed_batch_id')
    .eq('chat_id', chatId);
  const existingMap = new Map<number, { left_at: string | null; is_seed: boolean }>();
  for (const r of existingRows ?? []) {
    existingMap.set(Number(r.telegram_user_id), { left_at: r.left_at, is_seed: r.is_seed });
  }

  const nowIso = new Date().toISOString();
  const insertsOrReactivations: any[] = [];
  let newInserts = 0;
  let reactivated = 0;

  for (const m of roster) {
    const prior = existingMap.get(m.telegram_user_id);
    if (!prior) {
      newInserts++;
      insertsOrReactivations.push({
        profile_key: profileKey,
        channel_kind: channelKind,
        chat_id: chatId,
        telegram_user_id: m.telegram_user_id,
        username: m.username,
        first_name: m.first_name,
        last_name: m.last_name,
        joined_at: nowIso,
        left_at: null,
        is_seed: isBaseline,
        seed_batch_id: isBaseline ? baselineBatchId : null,
        source: 'roster',
        last_seen_at: nowIso,
      });
    } else if (prior.left_at) {
      // member rejoined after leaving
      reactivated++;
      insertsOrReactivations.push({
        profile_key: profileKey,
        channel_kind: channelKind,
        chat_id: chatId,
        telegram_user_id: m.telegram_user_id,
        username: m.username,
        first_name: m.first_name,
        last_name: m.last_name,
        joined_at: nowIso,
        left_at: null,
        is_seed: false,
        source: 'roster',
        last_seen_at: nowIso,
      });
    } else {
      // still present — touch last_seen_at + identifying fields
      await supabase
        .from('nolube_channel_members')
        .update({
          username: m.username,
          first_name: m.first_name,
          last_name: m.last_name,
          last_seen_at: nowIso,
        })
        .eq('chat_id', chatId)
        .eq('telegram_user_id', m.telegram_user_id);
    }
  }

  if (insertsOrReactivations.length > 0) {
    // upsert by (chat_id, telegram_user_id) so reactivations overwrite the previous left_at
    const { error } = await supabase
      .from('nolube_channel_members')
      .upsert(insertsOrReactivations, { onConflict: 'chat_id,telegram_user_id' });
    if (error) throw new Error('member upsert failed: ' + error.message);
  }

  // Mark members no longer in roster as left.
  let markedLeft = 0;
  for (const [tgId, prior] of existingMap) {
    if (!rosterIds.has(tgId) && !prior.left_at) {
      markedLeft++;
      await supabase
        .from('nolube_channel_members')
        .update({ left_at: nowIso })
        .eq('chat_id', chatId)
        .eq('telegram_user_id', tgId);
    }
  }

  // Spike detection: count joins in last WINDOW_MINUTES (only "new + reactivated", not baseline).
  let spikeTriggered = false;
  let activeSpikeBatchId: string | null = null;
  if (!isBaseline) {
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const { data: recentJoins } = await supabase
      .from('nolube_channel_members')
      .select('id,telegram_user_id,is_seed,seed_batch_id,classification_locked')
      .eq('chat_id', chatId)
      .gte('joined_at', since);
    const windowJoins = recentJoins?.length ?? 0;
    const median = await rollingMedianJoins(supabase, chatId);
    const threshold = Math.max(SPIKE_MIN_JOINS, median * SPIKE_MEDIAN_MULTIPLIER);
    if (windowJoins >= SPIKE_MIN_JOINS && windowJoins >= threshold && median > 0) {
      // open spike batch + tag all unlocked window joiners as seed
      const { data: batch } = await supabase
        .from('nolube_seed_batches')
        .insert({
          profile_key: profileKey,
          channel_kind: channelKind,
          chat_id: chatId,
          detected_via: 'spike',
          actual_count: windowJoins,
          trigger_window_joins: windowJoins,
          trigger_rolling_median: median,
          ended_at: new Date().toISOString(),
          notes: `Auto-detected: ${windowJoins} joins in ${WINDOW_MINUTES} min vs rolling median ${median.toFixed(2)}.`,
        })
        .select('id')
        .single();
      activeSpikeBatchId = batch?.id ?? null;
      spikeTriggered = true;
      if (activeSpikeBatchId) {
        const toFlag = (recentJoins ?? []).filter(r => !r.classification_locked && !r.is_seed).map(r => r.id);
        if (toFlag.length > 0) {
          await supabase
            .from('nolube_channel_members')
            .update({ is_seed: true, seed_batch_id: activeSpikeBatchId })
            .in('id', toFlag);
        }
      }
    }
  }

  // Write snapshot row.
  const snapSince = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data: windowJoinRows } = await supabase
    .from('nolube_channel_members')
    .select('is_seed,joined_at,left_at')
    .eq('chat_id', chatId)
    .or(`joined_at.gte.${snapSince},left_at.gte.${snapSince}`);
  let orgJoins = 0, orgLeaves = 0, seedLeaves = 0;
  for (const r of windowJoinRows ?? []) {
    if (r.joined_at && r.joined_at >= snapSince && !r.is_seed) orgJoins++;
    if (r.left_at && r.left_at >= snapSince) {
      if (r.is_seed) seedLeaves++; else orgLeaves++;
    }
  }

  const { data: totals } = await supabase
    .from('nolube_channel_members')
    .select('is_seed,left_at')
    .eq('chat_id', chatId)
    .is('left_at', null);
  let total = 0, seedActive = 0, organicActive = 0;
  for (const r of totals ?? []) {
    total++;
    if (r.is_seed) seedActive++; else organicActive++;
  }

  await supabase.from('nolube_channel_snapshots').insert({
    profile_key: profileKey,
    channel_kind: channelKind,
    chat_id: chatId,
    total_members: total,
    seed_active: seedActive,
    organic_active: organicActive,
    organic_joins_window: orgJoins,
    organic_leaves_window: orgLeaves,
    seed_leaves_window: seedLeaves,
    seed_active_batch_id: activeSpikeBatchId,
    notes: spikeTriggered ? 'spike detected' : (isBaseline ? 'baseline seeded' : null),
  });

  return {
    channel_kind: channelKind,
    chat_id: chatId,
    total_members: total,
    new_inserts: newInserts,
    marked_left: markedLeft,
    reactivated,
    seed_batch_id: activeSpikeBatchId ?? baselineBatchId,
    spike_triggered: spikeTriggered,
    baseline: isBaseline,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const profileKey: string = body.profile_key ?? 'no_lube';
    const channelKinds: ('public' | 'private')[] = Array.isArray(body.channel_kinds) && body.channel_kinds.length > 0
      ? body.channel_kinds : ['public', 'private'];
    const forceBaseline: boolean = !!body.force_baseline;

    const supabase = getSupabase();

    const { data: cfg } = await supabase
      .from('profile_subscription_configs')
      .select('profile_key, public_chat_id, private_chat_id')
      .eq('profile_key', profileKey)
      .maybeSingle();
    if (!cfg) throw new Error(`profile config not found for ${profileKey}`);

    const targets: { kind: 'public' | 'private'; chat_id: string | null }[] = [
      { kind: 'public', chat_id: cfg.public_chat_id },
      { kind: 'private', chat_id: cfg.private_chat_id },
    ].filter(t => channelKinds.includes(t.kind));

    const apiId = Number(getEnv('TELEGRAM_API_ID'));
    const apiHash = getEnv('TELEGRAM_API_HASH');
    const sessionString = await loadSessionString(supabase);
    const mtcuteSession = convertFromTelethonSession(sessionString);

    const client = new TelegramClient({ apiId, apiHash, storage: new MemoryStorage() });
    await client.importSession(mtcuteSession);
    await client.connect();

    const results: SyncOutcome[] = [];
    try {
      for (const t of targets) {
        if (!t.chat_id) {
          console.warn(`[nolube-roster] ${t.kind} chat_id not configured`);
          continue;
        }
        try {
          const r = await syncChannel({ supabase, client, profileKey, channelKind: t.kind, chatId: t.chat_id, forceBaseline });
          results.push(r);
        } catch (e) {
          console.error(`[nolube-roster] ${t.kind} sync failed:`, e);
          results.push({
            channel_kind: t.kind, chat_id: t.chat_id, total_members: 0,
            new_inserts: 0, marked_left: 0, reactivated: 0,
            seed_batch_id: null, spike_triggered: false, baseline: false,
          });
        }
      }
    } finally {
      try { await client.close(); } catch { /* ignore */ }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[nolube-roster] fatal:', e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});