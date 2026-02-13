/**
 * Helius Fetch Interceptor — Universal Traffic Logger
 * 
 * Auto-detects and logs ALL fetch calls to Helius endpoints.
 * Drop-in: just import and call enableHeliusTracking('function-name')
 * at the top of any edge function.
 * 
 * This patches globalThis.fetch to intercept Helius calls transparently.
 * Non-Helius calls pass through unmodified with zero overhead.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const _originalFetch = globalThis.fetch;
let _interceptorActive = false;
let _functionName = 'unknown';

// Helius domain patterns
const HELIUS_PATTERNS = [
  'helius-rpc.com',
  'api.helius.xyz',
  'helius.dev',
];

function isHeliusUrl(url: string): boolean {
  return HELIUS_PATTERNS.some(p => url.includes(p));
}

function extractEndpoint(url: string): string {
  try {
    const u = new URL(url);
    const clean = u.pathname + u.search
      .replace(/api-key=[^&]+&?/g, '')
      .replace(/[?&]$/, '');
    return (u.hostname + clean).slice(0, 200);
  } catch {
    return url.replace(/api-key=[^&]+/g, 'api-key=***').slice(0, 200);
  }
}

function inferMethod(url: string, httpMethod: string): string {
  if (url.includes('/v0/transactions')) return 'parseTransactions';
  if (url.includes('/v0/addresses') && url.includes('/transactions')) return 'getAddressTransactions';
  if (url.includes('/v0/token-metadata')) return 'getTokenMetadata';
  if (url.includes('/v0/token-accounts')) return 'getTokenAccounts';
  if (url.includes('/v0/websocket')) return 'websocket';
  if (url.includes('helius-rpc.com')) return 'rpc';
  return httpMethod;
}

function estimateCredits(url: string, method: string): number {
  if (method === 'parseTransactions') return 5;
  if (method === 'getTokenMetadata') return 10;
  if (method === 'getTokenAccounts') return 10;
  if (method === 'getAddressTransactions') return 5;
  if (url.includes('helius-rpc.com')) return 1;
  return 1;
}

async function logToDatabase(
  functionName: string,
  endpoint: string,
  method: string,
  status: number,
  success: boolean,
  responseTimeMs: number,
  error?: string,
  credits?: number
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return;

    // Use _originalFetch to avoid recursion through supabase client
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { fetch: _originalFetch }
    });

    await supabase.from('helius_api_usage').insert({
      function_name: functionName,
      endpoint,
      method,
      response_status: status,
      response_time_ms: responseTimeMs,
      success,
      error_message: error,
      credits_used: credits || 1,
    });
  } catch {
    // Silent — never affect main flow
  }
}

/**
 * Enable automatic Helius call tracking for this edge function.
 * Call once at the top of your function, before any Helius API calls.
 * 
 * Usage:
 * ```ts
 * import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
 * enableHeliusTracking('my-function-name');
 * ```
 * 
 * @param functionName — The name of the edge function (e.g., 'mint-monitor-scanner')
 */
export function enableHeliusTracking(functionName: string): void {
  if (_interceptorActive) return;
  _interceptorActive = true;
  _functionName = functionName;

  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    // Pass through non-Helius calls with zero overhead
    if (!isHeliusUrl(url)) {
      return _originalFetch(input, init);
    }

    const httpMethod = init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    const endpoint = extractEndpoint(url);
    const method = inferMethod(url, httpMethod);
    const credits = estimateCredits(url, method);
    const startTime = Date.now();

    try {
      const response = await _originalFetch(input, init);
      const elapsed = Date.now() - startTime;

      // Fire-and-forget logging — never blocks the response
      logToDatabase(
        _functionName, endpoint, method,
        response.status, response.ok, elapsed,
        response.ok ? undefined : `HTTP ${response.status}`,
        credits
      ).catch(() => {});

      return response;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      logToDatabase(
        _functionName, endpoint, method,
        0, false, elapsed,
        error instanceof Error ? error.message : String(error),
        credits
      ).catch(() => {});
      throw error;
    }
  };
}
