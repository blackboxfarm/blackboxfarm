/**
 * Provider Health & Capability Gate
 * 
 * Checks provider availability before making calls.
 * Uses api_service_config + recent api_usage_log failures to determine health.
 */

import { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface ProviderHealth {
  serviceName: string;
  isHealthy: boolean;
  isDegraded: boolean;
  recentFailRate: number; // 0-1
  lastError?: string;
  recommendation: string;
}

const healthCache = new Map<string, { health: ProviderHealth; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a provider is healthy enough to use.
 * Looks at recent api_usage_log for failure patterns.
 */
export async function checkProviderHealth(
  supabase: SupabaseClient,
  serviceName: string
): Promise<ProviderHealth> {
  const cached = healthCache.get(serviceName);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.health;
  }

  try {
    // Check recent failures in last 30 minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recentLogs } = await supabase
      .from('api_usage_log')
      .select('response_status, success')
      .eq('service_name', serviceName)
      .gte('timestamp', thirtyMinAgo)
      .limit(50);

    const total = recentLogs?.length || 0;
    const failures = recentLogs?.filter(l => 
      l.response_status === 401 || l.response_status === 403 || !l.success
    ).length || 0;

    const failRate = total > 0 ? failures / total : 0;
    const isHealthy = failRate < 0.3;
    const isDegraded = failRate >= 0.3 && failRate < 0.8;

    // Check for auth failures specifically (401/403 = key is broken)
    const authFailures = recentLogs?.filter(l => 
      l.response_status === 401 || l.response_status === 403
    ).length || 0;
    const hasAuthFailure = authFailures > 0;

    let recommendation = 'Available';
    if (hasAuthFailure) {
      recommendation = `API key invalid or tier insufficient (${authFailures} auth failures)`;
    } else if (isDegraded) {
      recommendation = `Degraded (${(failRate * 100).toFixed(0)}% failure rate)`;
    } else if (!isHealthy) {
      recommendation = `Unavailable (${(failRate * 100).toFixed(0)}% failure rate)`;
    }

    const health: ProviderHealth = {
      serviceName,
      isHealthy: isHealthy && !hasAuthFailure,
      isDegraded: isDegraded || hasAuthFailure,
      recentFailRate: failRate,
      recommendation,
    };

    healthCache.set(serviceName, { health, cachedAt: Date.now() });
    return health;
  } catch (e) {
    // If we can't check, assume degraded
    return {
      serviceName,
      isHealthy: false,
      isDegraded: true,
      recentFailRate: 1,
      recommendation: `Health check failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

/**
 * Check if Solscan is usable (not returning 401s).
 * Quick in-memory check that avoids unnecessary API calls.
 */
export async function isSolscanUsable(supabase: SupabaseClient): Promise<boolean> {
  const health = await checkProviderHealth(supabase, 'solscan');
  return health.isHealthy;
}

/**
 * Get health summary for multiple providers (for diagnostics UI)
 */
export async function getProviderHealthSummary(
  supabase: SupabaseClient,
  providers: string[] = ['solscan', 'helius', 'pumpfun', 'dexscreener']
): Promise<ProviderHealth[]> {
  return Promise.all(providers.map(p => checkProviderHealth(supabase, p)));
}
