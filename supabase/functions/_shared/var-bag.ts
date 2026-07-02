// Master Variable Bag — flat key/var registry per token run.
// Every leaf: { value, source, captured_at, mutability, ttl? }
// Namespaces enforced by prefix (bb.phanes, helius, dex, holders, calc, ai, ...).

export type Mutability = 'immutable' | 'transient';

export interface VarLeaf {
  value: unknown;
  source: string;
  captured_at: string;
  mutability: Mutability;
  ttl?: number | null;
}

export type VarBagJson = Record<string, VarLeaf>;

export class VarBag {
  private bag: VarBagJson = {};

  constructor(initial?: VarBagJson) {
    if (initial && typeof initial === 'object') this.bag = { ...initial };
  }

  /** Set a key under a namespace prefix. Immutable keys never overwrite. */
  set(
    prefix: string,
    key: string,
    value: unknown,
    opts: { source: string; mutability?: Mutability; ttl?: number | null } = { source: 'unknown' },
  ): void {
    if (value === null || value === undefined) return;
    if (typeof value === 'string' && value.trim() === '') return;
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    const full = `${prefix}.${key}`.replace(/\.+/g, '.');
    const mutability = opts.mutability ?? 'transient';
    const existing = this.bag[full];
    if (existing && existing.mutability === 'immutable') return;
    this.bag[full] = {
      value,
      source: opts.source,
      captured_at: new Date().toISOString(),
      mutability,
      ttl: opts.ttl ?? null,
    };
  }

  /** Bulk set from a flat object under a prefix. */
  setMany(
    prefix: string,
    obj: Record<string, unknown> | null | undefined,
    opts: { source: string; mutability?: Mutability; ttl?: number | null },
  ): void {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) this.set(prefix, k, v, opts);
  }

  get(full: string): VarLeaf | undefined { return this.bag[full]; }
  has(full: string): boolean { return full in this.bag; }
  keys(): string[] { return Object.keys(this.bag); }
  toJson(): VarBagJson { return this.bag; }

  counts(): { total: number; immutable: number; transient: number; by_source: Record<string, number>; by_prefix: Record<string, number> } {
    let immutable = 0, transient = 0;
    const by_source: Record<string, number> = {};
    const by_prefix: Record<string, number> = {};
    for (const leaf of Object.values(this.bag)) {
      if (leaf.mutability === 'immutable') immutable++;
      else transient++;
      by_source[leaf.source] = (by_source[leaf.source] || 0) + 1;
    }
    for (const k of Object.keys(this.bag)) {
      const p = k.split('.').slice(0, 2).join('.');
      by_prefix[p] = (by_prefix[p] || 0) + 1;
    }
    return { total: immutable + transient, immutable, transient, by_source, by_prefix };
  }

  /** Persist bag onto the run row + append history rows. */
  async persist(
    supabase: any,
    runId: string,
    tokenMint: string,
    stage: 'scrape' | 'enrich' | 'holders' | 'derived' | 'complete',
  ): Promise<void> {
    const bag = this.toJson();
    const counts = this.counts();
    try {
      await supabase.from('blackbox_aggregator_runs').update({
        var_bag_jsonb: bag,
        var_bag_stage: stage,
        var_bag_counts: counts,
        var_bag_updated: new Date().toISOString(),
      }).eq('id', runId);
    } catch (e) {
      console.error('[var-bag] failed to persist bag onto run', runId, e);
    }

    // History: append every leaf. Immutable also mirrors into token_var_immutable.
    const histRows: any[] = [];
    const immutRows: any[] = [];
    for (const [k, leaf] of Object.entries(bag)) {
      histRows.push({
        token_mint: tokenMint,
        run_id: runId,
        var_key: k,
        value_jsonb: leaf.value as any,
        source: leaf.source,
      });
      if (leaf.mutability === 'immutable') {
        immutRows.push({
          token_mint: tokenMint,
          var_key: k,
          value_jsonb: leaf.value as any,
          source: leaf.source,
        });
      }
    }
    // Batch insert in chunks to avoid payload limits
    const chunk = <T,>(arr: T[], n: number) => arr.reduce<T[][]>((acc, _, i) => (i % n === 0 ? acc.concat([arr.slice(i, i + n)]) : acc), []);
    for (const rows of chunk(histRows, 200)) {
      try { await supabase.from('token_var_history').insert(rows); }
      catch (e) { console.error('[var-bag] history insert chunk failed', e); }
    }
    if (immutRows.length) {
      try { await supabase.from('token_var_immutable').upsert(immutRows, { onConflict: 'token_mint,var_key', ignoreDuplicates: true }); }
      catch (e) { console.error('[var-bag] immutable upsert failed', e); }
    }
  }
}

// ---------------------------------------------------------------------------
// Stage-1 helper: turn a Blackbox scrape reply into a set of `bb.<bot>.*` vars.
// ---------------------------------------------------------------------------

const KNOWN_HOSTS: Record<string, RegExp> = {
  twitter:     /(?:^|\.)(x\.com|twitter\.com)$/i,
  telegram:    /(?:^|\.)(t\.me|telegram\.me)$/i,
  dexscreener: /(?:^|\.)dexscreener\.com$/i,
  dextools:    /(?:^|\.)dextools\.io$/i,
  birdeye:     /(?:^|\.)birdeye\.so$/i,
  solscan:     /(?:^|\.)solscan\.io$/i,
  pumpfun:     /(?:^|\.)pump\.fun$/i,
  gmgn:        /(?:^|\.)gmgn\.ai$/i,
  photon:      /(?:^|\.)photon-sol\.tinyastro\.io$/i,
  bullx:       /(?:^|\.)bullx\.io$/i,
  jup:         /(?:^|\.)jup\.ag$/i,
  raydium:     /(?:^|\.)raydium\.io$/i,
};

export function bucketLinks(urls: string[] | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = { other: [] };
  if (!urls) return out;
  for (const u of urls) {
    let matched = false;
    try {
      const host = new URL(u).hostname.toLowerCase();
      for (const [name, re] of Object.entries(KNOWN_HOSTS)) {
        if (re.test(host)) { (out[name] = out[name] || []).push(u); matched = true; break; }
      }
    } catch { /* skip */ }
    if (!matched) out.other.push(u);
  }
  return out;
}

/** Ingest one bot reply → write bb.<bot>.* keys onto the bag. */
export function ingestReplyIntoBag(
  bag: VarBag,
  botKey: string,               // e.g. 'phanes', 'rick', 'trojan'
  rep: {
    raw_text?: string | null;
    parsed_jsonb?: Record<string, any> | null;
    link_urls?: string[] | null;
    entities_jsonb?: any[] | null;
    web_preview?: Record<string, any> | null;
    parser_used?: string | null;
    bot_username?: string | null;
    message_id?: number | null;
    received_at?: string | null;
  },
): void {
  const source = `bb.${botKey}`;
  const prefix = `bb.${botKey}`;
  const opts = { source, mutability: 'transient' as const };

  bag.set(prefix, 'raw_text', rep.raw_text ?? null, opts);
  bag.set(prefix, 'bot_username', rep.bot_username ?? null, { source, mutability: 'immutable' });
  bag.set(prefix, 'parser_used', rep.parser_used ?? null, opts);
  bag.set(prefix, 'message_id', rep.message_id ?? null, { source, mutability: 'immutable' });
  bag.set(prefix, 'received_at', rep.received_at ?? null, { source, mutability: 'immutable' });

  // Parsed fields
  const parsed = rep.parsed_jsonb || {};
  for (const [k, v] of Object.entries(parsed)) {
    if (k === 'extras') continue;
    bag.set(`${prefix}.parsed`, k, v, opts);
  }
  if (parsed.extras && typeof parsed.extras === 'object') {
    for (const [k, v] of Object.entries(parsed.extras)) {
      bag.set(`${prefix}.extras`, k, v, opts);
    }
  }

  // Links bucket
  const buckets = bucketLinks(rep.link_urls || undefined);
  for (const [name, arr] of Object.entries(buckets)) {
    if (arr.length) bag.set(`${prefix}.links`, name, arr, { source, mutability: 'immutable' });
  }
  if (rep.link_urls?.length) {
    bag.set(`${prefix}.links`, 'all', rep.link_urls, { source, mutability: 'immutable' });
  }

  // Entities → mentions / hashtags / cashtags
  const mentions: any[] = [];
  const hashtags: string[] = [];
  const cashtags: string[] = [];
  const text = rep.raw_text || '';
  for (const e of (rep.entities_jsonb || [])) {
    if (!e || typeof e !== 'object') continue;
    const slice = (typeof e.offset === 'number' && typeof e.length === 'number')
      ? text.substring(e.offset, e.offset + e.length) : null;
    if (e.type === 'mention' || e.type === 'mention_name') {
      mentions.push({ handle: slice, user_id: e.user_id ?? null });
    } else if (e.type === 'hashtag' && slice) hashtags.push(slice);
    else if (e.type === 'cashtag' && slice) cashtags.push(slice);
  }
  if (mentions.length) bag.set(prefix, 'mentions', mentions, { source, mutability: 'immutable' });
  if (hashtags.length) bag.set(prefix, 'hashtags', hashtags, { source, mutability: 'immutable' });
  if (cashtags.length) bag.set(prefix, 'cashtags', cashtags, { source, mutability: 'immutable' });

  // Web preview snapshot (immutable — first card wins)
  if (rep.web_preview && typeof rep.web_preview === 'object' && Object.keys(rep.web_preview).length) {
    bag.set(prefix, 'web_preview', rep.web_preview, { source, mutability: 'immutable' });
  }

  // Emoji flags (icon-based link glyphs bots use)
  const emoji = text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
  if (emoji && emoji.length) {
    bag.set(prefix, 'emoji_flags', Array.from(new Set(emoji)), opts);
  }

  // Numeric slugs with 2-word context (best-effort — for the master menu)
  const numMatches: Array<{ token: string; context: string }> = [];
  const numRe = /(\$?[\d,.]+\s*[kKmMbB]?%?)/g;
  let m: RegExpExecArray | null;
  while ((m = numRe.exec(text)) !== null && numMatches.length < 40) {
    const start = Math.max(0, m.index - 40);
    const ctx = text.substring(start, m.index).replace(/\s+/g, ' ').trim().split(' ').slice(-3).join(' ');
    numMatches.push({ token: m[1], context: ctx });
  }
  if (numMatches.length) bag.set(prefix, 'numbers', numMatches, opts);
}

/** Merge two bot bags into a `bb.union.*` view with divergence flags. */
export function buildUnionView(
  bag: VarBag,
  bots: string[],   // e.g. ['phanes','rick']
  fieldKeys: string[],
): void {
  for (const f of fieldKeys) {
    const values: any[] = [];
    const bySrc: Record<string, any> = {};
    for (const b of bots) {
      const leaf = bag.get(`bb.${b}.parsed.${f}`);
      if (leaf) { values.push(leaf.value); bySrc[b] = leaf.value; }
    }
    if (!values.length) continue;
    const distinct = Array.from(new Set(values.map((v) => JSON.stringify(v))));
    bag.set('bb.union.parsed', f, values[0], { source: 'bb.union', mutability: 'transient' });
    if (distinct.length > 1) {
      bag.set('bb.union.divergence', f, bySrc, { source: 'bb.union', mutability: 'transient' });
    }
  }
  // Union links across bots (immutable)
  const linkNames = ['twitter','telegram','dexscreener','dextools','birdeye','solscan','pumpfun','gmgn','other'];
  for (const n of linkNames) {
    const uniq = new Set<string>();
    for (const b of bots) {
      const leaf = bag.get(`bb.${b}.links.${n}`);
      if (leaf && Array.isArray(leaf.value)) for (const u of leaf.value as string[]) uniq.add(u);
    }
    if (uniq.size) bag.set('bb.union.links', n, Array.from(uniq), { source: 'bb.union', mutability: 'immutable' });
  }
}