/**
 * Centralized Helius API Client
 * 
 * Single source of truth for all Helius API interactions.
 * Provides URL construction, safe fetch wrapper, and redaction utilities.
 * 
 * MIGRATION GUIDE:
 * Before: const url = `https://mainnet.helius-rpc.com/?api-key=${Deno.env.get('HELIUS_API_KEY')}`;
 * After:  import { getHeliusRpcUrl } from '../_shared/helius-client.ts';
 *         const url = getHeliusRpcUrl();
 * 
 * Before: const url = `https://api.helius.xyz/v0/addresses/${addr}/transactions?api-key=${key}`;
 * After:  import { heliusRestFetch } from '../_shared/helius-client.ts';
 *         const res = await heliusRestFetch(`/v0/addresses/${addr}/transactions`);
 * 
 * ROLLBACK: If this module causes issues, each function can revert to inline
 * Deno.env.get('HELIUS_API_KEY') — the key name hasn't changed.
 */

const HELIUS_RPC_BASE = 'https://mainnet.helius-rpc.com';
const HELIUS_REST_BASE = 'https://api.helius.xyz';

// ─── Key Access ───────────────────────────────────────────────

/** Get the Helius API key from environment. Returns null if not configured. */
export function getHeliusApiKey(): string | null {
  return Deno.env.get('HELIUS_API_KEY') || null;
}

/** Get the Helius API key, throwing if not configured. */
export function requireHeliusApiKey(): string {
  const key = getHeliusApiKey();
  if (!key) throw new Error('HELIUS_API_KEY not configured');
  return key;
}

// ─── URL Construction ─────────────────────────────────────────

/** 
 * Get the Helius RPC endpoint URL (with api-key query param).
 * RPC does NOT support header auth — query param is required.
 */
export function getHeliusRpcUrl(apiKey?: string): string {
  const key = apiKey || requireHeliusApiKey();
  return `${HELIUS_RPC_BASE}/?api-key=${key}`;
}

/**
 * Build a Helius REST API URL.
 * @param path - e.g. '/v0/addresses/xxx/transactions'
 * @param extraParams - additional query params (api-key is added automatically)
 */
export function getHeliusRestUrl(path: string, extraParams?: Record<string, string>): string {
  const key = requireHeliusApiKey();
  const params = new URLSearchParams({ 'api-key': key, ...extraParams });
  const separator = path.includes('?') ? '&' : '?';
  return `${HELIUS_REST_BASE}${path}${separator}${params.toString()}`;
}

// ─── Redaction ────────────────────────────────────────────────

/** Strip api-key values from a URL string for safe logging. */
export function redactHeliusUrl(url: string): string {
  return url.replace(/api-key=[^&\s]+/gi, 'api-key=[REDACTED]');
}

/** Strip api-key values from any string (error messages, stack traces). */
export function redactHeliusSecrets(text: string): string {
  return text.replace(/api-key=[^&\s"')]+/gi, 'api-key=[REDACTED]');
}

// ─── Safe Fetch Wrappers ──────────────────────────────────────

/**
 * Fetch wrapper for Helius RPC calls (JSON-RPC 2.0 POST).
 * - Adds timeout via AbortController
 * - Redacts API key from any error messages
 * - Returns parsed JSON response
 */
export async function heliusRpcFetch(
  method: string,
  params: unknown,
  options?: { timeoutMs?: number; apiKey?: string }
): Promise<any> {
  const url = getHeliusRpcUrl(options?.apiKey);
  const timeoutMs = options?.timeoutMs || 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Helius RPC returned HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(redactHeliusSecrets(data.error.message || JSON.stringify(data.error)));
    }

    return data;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error) {
      error.message = redactHeliusSecrets(error.message);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch wrapper for Helius REST API calls.
 * - Uses X-Api-Key header (removes key from URL for REST endpoints)
 * - Falls back to query param if header auth fails
 * - Adds timeout and redacts errors
 */
export async function heliusRestFetch(
  path: string,
  options?: { 
    method?: string;
    body?: unknown;
    timeoutMs?: number;
    extraParams?: Record<string, string>;
  }
): Promise<Response> {
  const key = requireHeliusApiKey();
  const timeoutMs = options?.timeoutMs || 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Build URL without api-key in query string
  const params = options?.extraParams 
    ? '?' + new URLSearchParams(options.extraParams).toString()
    : '';
  const url = `${HELIUS_REST_BASE}${path}${params}`;

  try {
    const response = await fetch(url, {
      method: options?.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': key,  // Header-based auth for REST API
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    return response;
  } catch (error) {
    if (error instanceof Error) {
      error.message = redactHeliusSecrets(error.message);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convenience: Helius REST fetch that returns parsed JSON.
 * Throws on non-OK responses with redacted error details.
 */
export async function heliusRestJson<T = any>(
  path: string,
  options?: Parameters<typeof heliusRestFetch>[1]
): Promise<T> {
  const response = await heliusRestFetch(path, options);
  
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Helius REST ${response.status}: ${redactHeliusSecrets(text).slice(0, 200)}`);
  }

  return response.json();
}

// ─── Fallback RPC Endpoints ──────────────────────────────────

/** Get ordered list of RPC endpoints (Helius first, public fallbacks last). */
export function getRpcEndpoints(): string[] {
  const endpoints: string[] = [];
  
  const key = getHeliusApiKey();
  if (key) {
    endpoints.push(getHeliusRpcUrl(key));
  }
  
  const customRpc = Deno.env.get('SOLANA_RPC_URL');
  if (customRpc) {
    endpoints.push(customRpc);
  }
  
  endpoints.push('https://api.mainnet-beta.solana.com');
  
  return endpoints;
}
