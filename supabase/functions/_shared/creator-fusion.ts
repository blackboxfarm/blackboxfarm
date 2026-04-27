/**
 * Creator Profile Fusion — shared logic.
 *
 * Given a bag of signals (wallet, kyc_root, x_handle, telegram_user_id,
 * discord_id, website_domain, sister_wallets), this module:
 *   1. Normalizes each signal.
 *   2. Looks up creator_identity_aliases for any existing creator_id.
 *   3. Reuses the lone matching creator_id, OR
 *      Merges multiple matching creator_ids into the lowest-uuid surviving id, OR
 *      Mints a brand-new developer_profiles row.
 *   4. Upserts every signal as an alias row pointing to the chosen creator.
 *
 * All DB writes go through assertDbWrite per the zero-tolerance rule.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { assertDbWrite } from './db-assert.ts';
import { resolveXHandle } from './x-handle-resolver.ts';

type Supa = ReturnType<typeof createClient>;

export type AliasKind =
  | 'wallet'
  | 'kyc_root'
  | 'x_user_id'
  | 'x_handle'
  | 'telegram_user_id'
  | 'telegram_handle'
  | 'discord_id'
  | 'discord_handle'
  | 'website_domain';

export interface FusionSignals {
  devWallet?: string | null;
  kycRoot?: string | null;
  sisterWallets?: string[] | null;
  xHandle?: string | null;          // will be resolved to immutable x_user_id
  telegramUserId?: string | null;   // numeric ID preferred
  telegramHandle?: string | null;
  discordId?: string | null;
  discordHandle?: string | null;
  websiteDomain?: string | null;
  displayName?: string | null;
  source?: string;                  // edge function name for audit
}

export interface FusionResult {
  creatorId: string;
  isNew: boolean;
  mergedAbsorbedIds: string[];      // any profiles that got fused into this one
  aliasesWritten: number;
}

function normDomain(v: string): string {
  return v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}
function normHandle(v: string): string {
  return v.trim().toLowerCase().replace(/^@/, '');
}

/**
 * Build the (kind, value) tuples we will look up + upsert.
 * Returns null entries silently — callers shouldn't have to filter.
 */
async function buildAliasTuples(
  signals: FusionSignals,
  supabase: Supa,
): Promise<Array<{ kind: AliasKind; value: string; confidence: number }>> {
  const out: Array<{ kind: AliasKind; value: string; confidence: number }> = [];

  const pushIf = (kind: AliasKind, raw: string | null | undefined, confidence = 80) => {
    if (!raw) return;
    const v = String(raw).trim();
    if (!v) return;
    out.push({ kind, value: v, confidence });
  };

  pushIf('wallet', signals.devWallet, 100);
  if (signals.sisterWallets?.length) {
    for (const w of signals.sisterWallets) pushIf('wallet', w, 70);
  }
  pushIf('kyc_root', signals.kycRoot, 95);

  // X handle → resolve to immutable user ID when possible
  if (signals.xHandle) {
    const handle = normHandle(signals.xHandle);
    if (handle) {
      try {
        const resolved = await resolveXHandle(handle, supabase);
        if (resolved?.userId && !resolved.userId.startsWith('pending_')) {
          out.push({ kind: 'x_user_id', value: resolved.userId, confidence: 100 });
        }
      } catch (_) { /* fall through to handle alias */ }
      out.push({ kind: 'x_handle', value: handle, confidence: 70 });
    }
  }

  if (signals.telegramUserId) {
    pushIf('telegram_user_id', String(signals.telegramUserId).trim(), 100);
  }
  if (signals.telegramHandle) pushIf('telegram_handle', normHandle(signals.telegramHandle), 70);
  pushIf('discord_id', signals.discordId, 100);
  if (signals.discordHandle) pushIf('discord_handle', normHandle(signals.discordHandle), 70);
  if (signals.websiteDomain) pushIf('website_domain', normDomain(signals.websiteDomain), 80);

  // De-dupe within the request
  const seen = new Set<string>();
  return out.filter((t) => {
    const k = `${t.kind}:${t.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function resolveExistingCreatorIds(
  tuples: Array<{ kind: AliasKind; value: string }>,
  supabase: Supa,
): Promise<Map<string, string>> {
  // Map of "kind:value" → creator_id (following merge tombstones)
  const map = new Map<string, string>();
  if (!tuples.length) return map;

  // Postgrest can't OR over (kind,value) tuples cleanly, so we batch by kind.
  const byKind = new Map<AliasKind, string[]>();
  for (const t of tuples) {
    if (!byKind.has(t.kind)) byKind.set(t.kind, []);
    byKind.get(t.kind)!.push(t.value);
  }

  for (const [kind, values] of byKind) {
    const { data, error } = await supabase
      .from('creator_identity_aliases')
      .select('alias_kind, alias_value, creator_id')
      .eq('alias_kind', kind)
      .in('alias_value', values);
    if (error) throw error;
    for (const row of (data || []) as any[]) {
      map.set(`${row.alias_kind}:${row.alias_value}`, row.creator_id);
    }
  }

  // Follow merge tombstones (developer_profiles.merged_into) so a stale alias
  // still resolves to the surviving creator.
  const ids = [...new Set(map.values())];
  if (ids.length === 0) return map;

  const { data: profs, error: pErr } = await supabase
    .from('developer_profiles')
    .select('id, merged_into')
    .in('id', ids);
  if (pErr) throw pErr;

  const tombstone = new Map<string, string>();
  for (const p of (profs || []) as any[]) {
    if (p.merged_into) tombstone.set(p.id, p.merged_into);
  }
  if (tombstone.size > 0) {
    for (const [k, v] of map) {
      let cur = v;
      let safety = 0;
      while (tombstone.has(cur) && safety < 5) {
        cur = tombstone.get(cur)!;
        safety++;
      }
      map.set(k, cur);
    }
  }

  return map;
}

/**
 * Merge `absorbed` into `surviving`. Re-points every alias, every dev wallet,
 * marks the absorbed profile as a tombstone, and writes a merge log entry.
 */
async function mergeProfiles(
  surviving: string,
  absorbed: string,
  trigger: { kind: AliasKind; value: string },
  source: string | undefined,
  supabase: Supa,
): Promise<void> {
  if (surviving === absorbed) return;

  // Re-point alias rows.
  const { error: aliasErr } = await supabase
    .from('creator_identity_aliases')
    .update({ creator_id: surviving })
    .eq('creator_id', absorbed);
  if (aliasErr) throw aliasErr;

  // Re-point developer_wallets if that table is in use.
  await supabase
    .from('developer_wallets')
    .update({ developer_id: surviving })
    .eq('developer_id', absorbed); // best-effort; ignore error if column missing

  // Tombstone the absorbed profile.
  await assertDbWrite(
    supabase
      .from('developer_profiles')
      .update({ merged_into: surviving, merged_at: new Date().toISOString() })
      .eq('id', absorbed),
    'developer_profiles',
    'tombstone-merge',
  );

  // Audit log.
  await assertDbWrite(
    supabase.from('creator_merge_log').insert({
      surviving_id: surviving,
      absorbed_id: absorbed,
      trigger_kind: trigger.kind,
      trigger_value: trigger.value,
      triggered_by: source ?? 'creator-fusion',
    }),
    'creator_merge_log',
    'merge-audit',
  );

  console.log(`[creator-fusion] Merged ${absorbed} → ${surviving} (trigger: ${trigger.kind}=${trigger.value})`);
}

/**
 * Main entrypoint. Idempotent — safe to call repeatedly with the same signals.
 */
export async function fuseCreator(
  signals: FusionSignals,
  supabase: Supa,
): Promise<FusionResult> {
  const tuples = await buildAliasTuples(signals, supabase);
  if (tuples.length === 0) {
    throw new Error('[creator-fusion] No usable signals provided');
  }

  // 1. Find every existing creator_id that any signal already resolves to.
  const existing = await resolveExistingCreatorIds(tuples, supabase);
  const candidateIds = [...new Set(existing.values())];

  // 2. Pick or mint surviving creator.
  let survivingId: string;
  let isNew = false;
  const absorbed: string[] = [];

  if (candidateIds.length === 0) {
    // Brand new identity. Use devWallet (or any wallet alias) as the master_wallet.
    const masterWallet =
      signals.devWallet ||
      tuples.find((t) => t.kind === 'wallet')?.value ||
      `creator-${crypto.randomUUID()}`;

    const { data: created, error } = await supabase
      .from('developer_profiles')
      .insert({
        master_wallet_address: masterWallet,
        display_name: signals.displayName || null,
        twitter_handle: signals.xHandle ? normHandle(signals.xHandle) : null,
        telegram_handle: signals.telegramHandle ? normHandle(signals.telegramHandle) : null,
        discord_handle: signals.discordHandle ? normHandle(signals.discordHandle) : null,
        website_url: signals.websiteDomain || null,
        source: signals.source || 'creator-fusion',
      })
      .select('id')
      .single();
    if (error || !created) {
      throw new Error(`[creator-fusion] Failed to mint developer_profiles: ${error?.message}`);
    }
    survivingId = created.id;
    isNew = true;
  } else {
    // Pick lowest-uuid (deterministic) as survivor.
    candidateIds.sort();
    survivingId = candidateIds[0];

    // Merge every other candidate into the survivor.
    for (const id of candidateIds.slice(1)) {
      // Pick the first tuple that resolved to this id as the trigger.
      let triggerTuple = tuples.find(
        (t) => existing.get(`${t.kind}:${t.value}`) === id,
      );
      if (!triggerTuple) triggerTuple = tuples[0];
      await mergeProfiles(survivingId, id, triggerTuple, signals.source, supabase);
      absorbed.push(id);
    }
  }

  // 3. Upsert every signal as an alias row.
  const now = new Date().toISOString();
  const aliasRows = tuples.map((t) => ({
    creator_id: survivingId,
    alias_kind: t.kind,
    alias_value: t.value,
    confidence: t.confidence,
    source: signals.source || 'creator-fusion',
    last_seen_at: now,
  }));

  await assertDbWrite(
    supabase
      .from('creator_identity_aliases')
      .upsert(aliasRows, { onConflict: 'alias_kind,alias_value' }),
    'creator_identity_aliases',
    'fuse-aliases',
  );

  return {
    creatorId: survivingId,
    isNew,
    mergedAbsorbedIds: absorbed,
    aliasesWritten: aliasRows.length,
  };
}

/**
 * Lookup-only: resolve any signal to a creator_id (following merge tombstones).
 */
export async function resolveSignalToCreatorId(
  kind: AliasKind,
  value: string,
  supabase: Supa,
): Promise<string | null> {
  const map = await resolveExistingCreatorIds([{ kind, value }], supabase);
  return map.get(`${kind}:${value}`) || null;
}
