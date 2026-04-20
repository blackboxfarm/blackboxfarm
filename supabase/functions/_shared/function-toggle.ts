/**
 * Function Toggle Guard
 *
 * Runtime kill-switch for cron-driven edge functions.
 * Reads `function_toggles` table, caches result for 60s per instance.
 * Fails OPEN — if the toggle table is unreachable, the function runs normally.
 *
 * Usage at the top of a function handler:
 *   import { isFunctionEnabled } from '../_shared/function-toggle.ts';
 *   if (!await isFunctionEnabled('my-function-name')) {
 *     return new Response(JSON.stringify({ skipped: 'disabled' }), { status: 200 });
 *   }
 */
import { createClient } from "npm:@supabase/supabase-js@2.54.0";

interface CacheEntry {
  enabled: boolean;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 60s

let _client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

/**
 * Returns true if the function is enabled (or if the toggle row is missing,
 * or if the DB call fails — fail-open).
 */
export async function isFunctionEnabled(functionName: string): Promise<boolean> {
  const now = Date.now();
  const cached = cache.get(functionName);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    if (!cached.enabled) {
      // Fire-and-forget skip telemetry
      recordSkip(functionName).catch(() => {});
    }
    return cached.enabled;
  }

  const client = getClient();
  if (!client) {
    // No env — fail open
    cache.set(functionName, { enabled: true, fetchedAt: now });
    return true;
  }

  try {
    const { data, error } = await client
      .from('function_toggles')
      .select('enabled')
      .eq('function_name', functionName)
      .maybeSingle();

    if (error) {
      console.warn(`[function-toggle] Query error for ${functionName}, failing open:`, error.message);
      cache.set(functionName, { enabled: true, fetchedAt: now });
      return true;
    }

    // Missing row = enabled by default
    const enabled = data?.enabled !== false;
    cache.set(functionName, { enabled, fetchedAt: now });

    if (!enabled) {
      recordSkip(functionName).catch(() => {});
    }
    return enabled;
  } catch (err) {
    console.warn(`[function-toggle] Exception for ${functionName}, failing open:`, err);
    cache.set(functionName, { enabled: true, fetchedAt: now });
    return true;
  }
}

async function recordSkip(functionName: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.rpc('record_function_skip', { p_function_name: functionName });
  } catch {
    // ignore
  }
}

/** Test-only helper to clear the cache. */
export function _clearToggleCache() {
  cache.clear();
}