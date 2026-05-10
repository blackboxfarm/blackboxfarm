/**
 * MESH INGEST — Unified public-input → Reputation Mesh ingestion.
 *
 * Every public surface (Bubble Map, /holders web, Telegram bot) calls this
 * one helper at the top of any CA-bearing query so that:
 *
 *  1. The token enters the reputation mesh (`meshFeed.token`)
 *  2. The creator wallet is registered (`meshFeed.wallet` via meshFeed.token)
 *  3. `holders_intel_seen_tokens` is bumped (atomic RPC) — feeds the scheduler's
 *     demand-weighted ranking and powers the Intel Layer Flywheel
 *  4. The token is queued into `holders_intel_post_queue` (dedup'd by 7-day cooldown)
 *
 * Fire-and-forget by design: NEVER blocks the caller's response.
 * Per zero-tolerance silent-fails policy, individual failures are logged via
 * console.warn but do not throw to the caller — this is auxiliary metadata,
 * not a primary write path. The bump_seen_token RPC is the canonical signal.
 *
 * Usage:
 *   import { ingestPublicCAQuery } from '../_shared/mesh-ingest.ts';
 *   ingestPublicCAQuery(supabase, {
 *     mint, source: 'tg_bot:/holders',
 *     symbol, name, creatorWallet,
 *   }).catch(() => {});
 */

import { meshFeed } from './mesh-feeder.ts';

export type IngestSource =
  | 'web:/holders'
  | 'web:/bubblemap'
  | 'web:/bubblemap:kyc'
  | 'web:/bubblemap:x_community'
  | 'tg_bot:/holders'
  | 'tg_bot:/ca'
  | 'tg_bot:/risk'
  | 'tg_bot:/dev'
  | 'tg_bot:/quick'
  | 'tg_bot:/oracle'
  | 'tg_bot:/insiders'
  | 'tg_bot:/momentum'
  | 'tg_bot:/concentration'
  | 'tg_bot:/compare'
  | 'tg_bot:/ai'
  | 'tg_bot:/ca:auto'
  | 'tg_bot:dm:ca_paste'
  | 'oracle-unified-lookup'
  | 'check-bubble-quota';

export interface IngestParams {
  mint: string;
  source: IngestSource | string;
  symbol?: string | null;
  name?: string | null;
  creatorWallet?: string | null;
  marketCap?: number | null;
  twitterUrl?: string | null;
  telegramUrl?: string | null;
  websiteUrl?: string | null;
  /** Telegram user id, if invoked from the bot — recorded for later attribution */
  telegramUserId?: string | null;
  /** Authenticated user id, if known */
  userId?: string | null;
  /** If true, also queue into holders_intel_post_queue (with 7-day dedup) */
  enqueueForPost?: boolean;
}

/** Map IngestSource → trigger_source enum used by the post queue & scheduler. */
function resolveTriggerSource(src: string): string {
  if (src.startsWith('web:/bubblemap')) return 'bubblemap_query';
  if (src.startsWith('web:/holders'))   return 'holders_input';
  if (src.startsWith('tg_bot:'))        return 'subscriber_query';
  return 'public_query';
}

/** Heuristic CA validation — Solana addresses are base58, 32–44 chars. */
function isValidCA(mint?: string | null): mint is string {
  if (!mint || typeof mint !== 'string') return false;
  const t = mint.trim();
  return t.length >= 30 && t.length <= 50 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(t);
}

/**
 * Main entrypoint — call from every public CA-bearing path.
 * Returns immediately; all DB work runs in the background.
 */
export function ingestPublicCAQuery(
  supabase: any,
  params: IngestParams
): Promise<void> {
  return _ingestImpl(supabase, params).catch((e) => {
    console.warn('[mesh-ingest] non-fatal:', e instanceof Error ? e.message : e);
  });
}

async function _ingestImpl(supabase: any, params: IngestParams): Promise<void> {
  const {
    mint, source, symbol, name, creatorWallet, marketCap,
    twitterUrl, telegramUrl, websiteUrl,
    enqueueForPost = true,
  } = params;

  if (!isValidCA(mint)) return;

  // 1) Atomic bump of the public-demand counter (canonical signal for the scheduler).
  //    Uses a security-definer RPC so anon callers (check-bubble-quota) work.
  try {
    const { error } = await supabase.rpc('bump_seen_token', {
      p_mint: mint,
      p_source: source,
      p_symbol: symbol ?? null,
      p_name: name ?? null,
    });
    if (error) console.warn('[mesh-ingest] bump_seen_token:', error.message);
  } catch (e) {
    console.warn('[mesh-ingest] bump_seen_token threw:', e);
  }

  // 2) Feed the reputation mesh — token + creator wallet + socials in one call.
  try {
    await meshFeed.token(supabase, {
      mint,
      symbol: symbol ?? null,
      name: name ?? null,
      creatorWallet: creatorWallet ?? null,
      twitterUrl: twitterUrl ?? null,
      telegramUrl: telegramUrl ?? null,
      websiteUrl: websiteUrl ?? null,
      source,
    });
  } catch (e) {
    console.warn('[mesh-ingest] meshFeed.token:', e);
  }

  // 3) Optional: queue into holders_intel_post_queue (7-day dedup).
  if (enqueueForPost) {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from('holders_intel_post_queue')
        .select('id')
        .eq('token_mint', mint)
        .gte('created_at', sevenDaysAgo)
        .limit(1);

      if (!existing || existing.length === 0) {
        const { error } = await supabase.from('holders_intel_post_queue').insert({
          token_mint: mint,
          symbol: symbol ?? null,
          name: name ?? null,
          market_cap: marketCap ?? null,
          scheduled_at: new Date().toISOString(),
          status: 'pending',
          trigger_source: resolveTriggerSource(source),
          trigger_comment: source,
        });
        if (error) console.warn('[mesh-ingest] queue insert:', error.message);
      }
    } catch (e) {
      console.warn('[mesh-ingest] queue threw:', e);
    }
  }

  // 4) Fire-and-forget: trigger Recycled X Community evaluation for any
  //    communities linked to this mint. Pure mesh-pipeline write — never
  //    blocks the caller, never throws. Score lands on x_communities and
  //    auto-tags reputation_mesh when band ∈ {likely, confirmed}.
  try {
    supabase.functions
      .invoke('community-recycled-scorer', {
        body: { mode: 'evaluate_for_token', token_mint: mint },
      })
      .then(({ error }: any) => {
        if (error) console.warn('[mesh-ingest] scorer:', error.message ?? error);
      })
      .catch((e: any) => console.warn('[mesh-ingest] scorer threw:', e?.message ?? e));
  } catch (e) {
    console.warn('[mesh-ingest] scorer dispatch threw:', e);
  }
}

/**
 * Convenience for surfaces that already have a Supabase client and just want
 * to fire the ingest without awaiting. Returns void (sync-looking).
 */
export function ingestPublicCAQuerySync(supabase: any, params: IngestParams): void {
  ingestPublicCAQuery(supabase, params).catch(() => {});
}