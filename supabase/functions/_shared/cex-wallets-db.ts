/**
 * DB-backed CEX dictionary with in-memory cache + self-expansion.
 *
 * Why this exists: the file dictionary in `cex-wallets.ts` is small and static.
 * `known_cex_wallets` lets us store unlimited entries and grow the dictionary
 * automatically every time Solscan tells us a wallet has a CEX label.
 *
 * Lookup order:
 *   1. file dictionary (fastest — already in memory)
 *   2. DB cache (refreshed every 10 min)
 *   3. record/insert when Solscan reveals a new CEX address
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { getCexName as getCexNameFile } from './cex-wallets.ts';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let _cache = new Map<string, { name: string; type: string }>(); // wallet -> {name, entity_type}
let _cacheLoadedAt = 0;
let _loading: Promise<void> | null = null;

function getClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function loadCache(): Promise<void> {
  if (Date.now() - _cacheLoadedAt < CACHE_TTL_MS && _cache.size > 0) return;
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('known_cex_wallets')
        .select('wallet_address, cex_name, entity_type')
        .eq('chain', 'solana');
      if (error) {
        console.warn('[cex-wallets-db] load failed:', error.message);
        return;
      }
      const next = new Map<string, { name: string; type: string }>();
      for (const r of data || []) {
        if (r.wallet_address && r.cex_name) {
          next.set(r.wallet_address, { name: r.cex_name, type: r.entity_type || 'cex' });
        }
      }
      _cache = next;
      _cacheLoadedAt = Date.now();
      console.log(`[cex-wallets-db] cache loaded: ${_cache.size} entries`);
    } finally {
      _loading = null;
    }
  })();
  return _loading;
}

/** Returns CEX name from file → DB cache, or null. Async because it warms cache on first call. */
export async function getCexNameAny(wallet: string): Promise<string | null> {
  const fromFile = getCexNameFile(wallet);
  if (fromFile) return fromFile;
  await loadCache();
  return _cache.get(wallet)?.name ?? null;
}

/** Sync variant — only consults already-warmed cache + file dictionary (no DB call). */
export function getCexNameCached(wallet: string): string | null {
  return getCexNameFile(wallet) ?? _cache.get(wallet)?.name ?? null;
}

/** Returns full entity record (name + entity_type) from file/DB, or null. Sync. */
export function getEntityCached(wallet: string): { name: string; type: string } | null {
  const fileName = getCexNameFile(wallet);
  if (fileName) return { name: fileName, type: 'cex' };
  return _cache.get(wallet) ?? null;
}

/** Force a cache refresh (e.g. right before a long BFS). */
export async function warmCexCache(): Promise<number> {
  _cacheLoadedAt = 0;
  await loadCache();
  return _cache.size;
}

/**
 * Self-expand: record a newly-discovered CEX wallet (e.g. learned via Solscan label).
 * Idempotent — ON CONFLICT DO NOTHING. Updates in-memory cache too so the same
 * function-instance benefits immediately.
 */
export async function recordCexWallet(opts: {
  wallet: string;
  cexName: string;
  cexLabel?: string;
  source: string; // e.g. 'solscan-account-detail', 'solscan-funded-by'
  verified?: boolean;
  entityType?: string; // 'cex' | 'bridge' | 'onramp' | 'aggregator' | 'mm_desk' | 'custodian'
}): Promise<void> {
  const { wallet, cexName, cexLabel, source, verified, entityType } = opts;
  if (!wallet || !cexName) return;
  const type = entityType || 'cex';
  // Cache immediately
  _cache.set(wallet, { name: cexName, type });
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from('known_cex_wallets')
      .upsert(
        {
          wallet_address: wallet,
          cex_name: cexName,
          cex_label: cexLabel || cexName,
          chain: 'solana',
          added_by: source,
          is_verified: verified ?? false,
          entity_type: type,
        },
        { onConflict: 'wallet_address', ignoreDuplicates: true },
      );
    if (error) {
      console.warn(`[cex-wallets-db] recordCexWallet failed for ${wallet.slice(0, 8)}: ${error.message}`);
    } else {
      console.log(`[cex-wallets-db] +1 ${type} entry: ${wallet.slice(0, 8)}... → ${cexName} (via ${source})`);
    }
  } catch (e) {
    console.warn(`[cex-wallets-db] recordCexWallet exception:`, e);
  }
}