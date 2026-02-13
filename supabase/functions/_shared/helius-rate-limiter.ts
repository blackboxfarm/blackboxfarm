/**
 * Helius API Rate Limiter and Logger - PERSISTENT VERSION
 * 
 * Provides:
 * 1. Persistent rate limiting across all edge functions (via database)
 * 2. Logging of all Helius API calls to helius_api_usage table
 * 3. Circuit breaker for 429 responses (persistent)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

// Rate limiting configuration
const MAX_CALLS_PER_MINUTE = 50;
const CIRCUIT_BREAKER_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// In-memory fallback (if DB is unavailable)
let localCallCount = 0;
let localLastResetTime = Date.now();
let localCircuitBreakerTripped = false;
let localCircuitBreakerTrippedAt = 0;

interface HeliusCallParams {
  functionName: string;
  endpoint: string;
  method?: string;
  requestParams?: any;
}

interface RateLimitState {
  call_count: number;
  window_start: string;
  circuit_breaker_active: boolean;
  circuit_breaker_until: string | null;
}

// Get or create Supabase client
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) return null;
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Get persistent rate limit state from database
async function getPersistentRateLimitState(): Promise<RateLimitState | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('helius_rate_limit_state')
      .select('*')
      .eq('id', 'global')
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching rate limit state:', error);
      return null;
    }
    
    return data;
  } catch (e) {
    console.error('Failed to get rate limit state:', e);
    return null;
  }
}

// Update persistent rate limit state
async function updatePersistentRateLimitState(update: Partial<RateLimitState>): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('helius_rate_limit_state')
      .upsert({
        id: 'global',
        ...update,
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Error updating rate limit state:', error);
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('Failed to update rate limit state:', e);
    return false;
  }
}

// Check rate limit (with persistent fallback)
async function checkRateLimitPersistent(): Promise<{ allowed: boolean; reason?: string }> {
  const now = Date.now();
  const nowIso = new Date().toISOString();
  
  // Try to get persistent state
  const state = await getPersistentRateLimitState();
  
  if (state) {
    // Check circuit breaker first
    if (state.circuit_breaker_active && state.circuit_breaker_until) {
      const breakerUntil = new Date(state.circuit_breaker_until).getTime();
      if (now < breakerUntil) {
        const remainingSec = Math.round((breakerUntil - now) / 1000);
        console.log(`⚡ Circuit breaker active (persistent), ${remainingSec}s remaining`);
        return { allowed: false, reason: `circuit_breaker:${remainingSec}s` };
      } else {
        // Reset circuit breaker
        await updatePersistentRateLimitState({ 
          circuit_breaker_active: false, 
          circuit_breaker_until: null 
        });
        console.log('🔌 Circuit breaker reset (persistent)');
      }
    }
    
    // Check if we need to reset the window
    const windowStart = new Date(state.window_start).getTime();
    const windowAge = now - windowStart;
    
    if (windowAge > 60000) {
      // Reset the window
      await updatePersistentRateLimitState({ 
        call_count: 1, 
        window_start: nowIso 
      });
      return { allowed: true };
    }
    
    // Check rate limit
    if (state.call_count >= MAX_CALLS_PER_MINUTE) {
      console.log(`🚦 Rate limit reached (${state.call_count}/${MAX_CALLS_PER_MINUTE} calls/min) - persistent`);
      return { allowed: false, reason: 'rate_limit' };
    }
    
    // Increment counter
    await updatePersistentRateLimitState({ 
      call_count: state.call_count + 1 
    });
    
    return { allowed: true };
  }
  
  // Fallback to in-memory (for cold starts or DB issues)
  if (now - localLastResetTime > 60000) {
    localCallCount = 0;
    localLastResetTime = now;
  }
  
  if (localCircuitBreakerTripped) {
    if (now - localCircuitBreakerTrippedAt > CIRCUIT_BREAKER_DURATION_MS) {
      console.log('🔌 Circuit breaker reset (local)');
      localCircuitBreakerTripped = false;
    } else {
      const remainingMs = CIRCUIT_BREAKER_DURATION_MS - (now - localCircuitBreakerTrippedAt);
      console.log(`⚡ Circuit breaker active (local), ${Math.round(remainingMs / 1000)}s remaining`);
      return { allowed: false, reason: 'circuit_breaker_local' };
    }
  }
  
  if (localCallCount >= MAX_CALLS_PER_MINUTE) {
    console.log(`🚦 Rate limit reached (${localCallCount}/${MAX_CALLS_PER_MINUTE} calls/min) - local`);
    return { allowed: false, reason: 'rate_limit_local' };
  }
  
  localCallCount++;
  return { allowed: true };
}

// Trip circuit breaker (persistent)
async function tripCircuitBreakerPersistent(): Promise<void> {
  const breakerUntil = new Date(Date.now() + CIRCUIT_BREAKER_DURATION_MS).toISOString();
  
  console.log('🔴 Circuit breaker TRIPPED - pausing Helius calls for 5 minutes');
  
  // Update persistent state
  const updated = await updatePersistentRateLimitState({
    circuit_breaker_active: true,
    circuit_breaker_until: breakerUntil
  });
  
  // Also set local state as fallback
  if (!updated) {
    localCircuitBreakerTripped = true;
    localCircuitBreakerTrippedAt = Date.now();
  }
}

// Log Helius API call to database
async function logHeliusCall(
  params: HeliusCallParams,
  status: number,
  success: boolean,
  responseTimeMs: number,
  error?: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    
    // Estimate credits based on method
    let creditsUsed = 1;
    const premiumMethods = ['getAsset', 'getAssetBatch', 'searchAssets', 'TOKEN_MINT', 'getTokenAccounts'];
    if (params.method && premiumMethods.some(m => params.method?.includes(m))) {
      creditsUsed = 10;
    }
    
    // High-volume methods
    const highVolumeMethods = ['transactions', 'getSignaturesForAddress'];
    if (params.endpoint && highVolumeMethods.some(m => params.endpoint.includes(m))) {
      creditsUsed = 5;
    }
    
    await supabase.from('helius_api_usage').insert({
      function_name: params.functionName,
      endpoint: params.endpoint,
      method: params.method,
      request_params: params.requestParams ? sanitizeParams(params.requestParams) : null,
      response_status: status,
      response_time_ms: responseTimeMs,
      success,
      error_message: error,
      credits_used: creditsUsed,
    });
  } catch (e) {
    // Don't fail the original request if logging fails
    console.error('Failed to log Helius call:', e);
  }
}

// Sanitize request params to remove API keys
function sanitizeParams(params: any): any {
  if (!params) return null;
  
  try {
    const sanitized = JSON.parse(JSON.stringify(params));
    const sensitiveKeys = ['api-key', 'apiKey', 'api_key', 'secretKey', 'privateKey', 'secret', 'password'];
    
    function recursiveSanitize(obj: any) {
      if (typeof obj !== 'object' || obj === null) return;
      
      for (const key in obj) {
        if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'string' && obj[key].length > 50) {
          // Truncate long strings (like URLs with API keys)
          if (obj[key].includes('api-key') || obj[key].includes('apiKey')) {
            obj[key] = obj[key].replace(/api-key=[^&]+/gi, 'api-key=[REDACTED]');
          }
        } else if (typeof obj[key] === 'object') {
          recursiveSanitize(obj[key]);
        }
      }
    }
    
    recursiveSanitize(sanitized);
    return sanitized;
  } catch {
    return null;
  }
}

/**
 * Rate-limited and logged fetch for Helius API
 * Returns null if rate limited or circuit breaker is active
 */
export async function heliusFetch(
  url: string,
  options: RequestInit,
  params: HeliusCallParams
): Promise<Response | null> {
  // Check rate limit (persistent)
  const rateCheck = await checkRateLimitPersistent();
  if (!rateCheck.allowed) {
    console.log(`⏳ Helius call skipped: ${rateCheck.reason} - ${params.endpoint}`);
    return null;
  }
  
  const startTime = Date.now();
  
  try {
    // Auto-inject X-Api-Key header for Helius REST API calls
    const isHeliusRest = url.includes('api.helius.xyz');
    if (isHeliusRest) {
      // Import dynamically to avoid circular deps
      const heliusKey = Deno.env.get('HELIUS_API_KEY'); // Keep direct access here to avoid circular import
      if (heliusKey) {
        const existingHeaders = options.headers instanceof Headers 
          ? Object.fromEntries(options.headers.entries())
          : (options.headers || {}) as Record<string, string>;
        options = {
          ...options,
          headers: { ...existingHeaders, 'X-Api-Key': heliusKey }
        };
      }
    }
    
    const response = await fetch(url, options);
    const responseTime = Date.now() - startTime;
    
    // Log the call
    await logHeliusCall(
      params,
      response.status,
      response.ok,
      responseTime,
      response.ok ? undefined : `HTTP ${response.status}`
    );
    
    // Trip circuit breaker on 429
    if (response.status === 429) {
      await tripCircuitBreakerPersistent();
    }
    
    return response;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    await logHeliusCall(
      params,
      0,
      false,
      responseTime,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

/**
 * Check if Helius calls are currently allowed (not rate limited or circuit broken)
 * Uses persistent state
 */
export async function canMakeHeliusCall(): Promise<boolean> {
  const result = await checkRateLimitPersistent();
  return result.allowed;
}

/**
 * Get current rate limit status (persistent)
 */
export async function getRateLimitStatus(): Promise<{ 
  callsRemaining: number; 
  circuitBreakerActive: boolean;
  isPersistent: boolean;
}> {
  const state = await getPersistentRateLimitState();
  
  if (state) {
    const now = Date.now();
    const windowStart = new Date(state.window_start).getTime();
    const windowAge = now - windowStart;
    
    // If window is old, calls would reset to MAX
    const callCount = windowAge > 60000 ? 0 : state.call_count;
    
    const circuitBreakerActive = state.circuit_breaker_active && 
      state.circuit_breaker_until && 
      now < new Date(state.circuit_breaker_until).getTime();
    
    return {
      callsRemaining: Math.max(0, MAX_CALLS_PER_MINUTE - callCount),
      circuitBreakerActive: !!circuitBreakerActive,
      isPersistent: true,
    };
  }
  
  // Fallback to local
  const now = Date.now();
  if (now - localLastResetTime > 60000) {
    localCallCount = 0;
    localLastResetTime = now;
  }
  
  return {
    callsRemaining: Math.max(0, MAX_CALLS_PER_MINUTE - localCallCount),
    circuitBreakerActive: localCircuitBreakerTripped && now - localCircuitBreakerTrippedAt < CIRCUIT_BREAKER_DURATION_MS,
    isPersistent: false,
  };
}

// Legacy synchronous exports for backward compatibility (use in-memory)
export function canMakeHeliusCallSync(): boolean {
  const now = Date.now();
  
  if (localCircuitBreakerTripped && now - localCircuitBreakerTrippedAt < CIRCUIT_BREAKER_DURATION_MS) {
    return false;
  }
  
  if (now - localLastResetTime > 60000) {
    localCallCount = 0;
    localLastResetTime = now;
  }
  
  return localCallCount < MAX_CALLS_PER_MINUTE;
}

export function getRateLimitStatusSync(): { callsRemaining: number; circuitBreakerActive: boolean } {
  const now = Date.now();
  
  if (now - localLastResetTime > 60000) {
    localCallCount = 0;
    localLastResetTime = now;
  }
  
  return {
    callsRemaining: Math.max(0, MAX_CALLS_PER_MINUTE - localCallCount),
    circuitBreakerActive: localCircuitBreakerTripped && now - localCircuitBreakerTrippedAt < CIRCUIT_BREAKER_DURATION_MS,
  };
}
