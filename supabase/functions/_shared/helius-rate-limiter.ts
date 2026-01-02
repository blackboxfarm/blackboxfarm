/**
 * Helius API Rate Limiter and Logger
 * 
 * Provides:
 * 1. Rate limiting across all edge functions
 * 2. Logging of all Helius API calls to helius_api_usage table
 * 3. Circuit breaker for 429 responses
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

// Rate limiting configuration
const MAX_CALLS_PER_MINUTE = 50;
const CIRCUIT_BREAKER_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// In-memory tracking (resets per function invocation)
let callCount = 0;
let lastResetTime = Date.now();
let circuitBreakerTripped = false;
let circuitBreakerTrippedAt = 0;

interface HeliusCallParams {
  functionName: string;
  endpoint: string;
  method?: string;
  requestParams?: any;
}

// Reset call count every minute
function checkRateLimit(): boolean {
  const now = Date.now();
  
  // Reset counter every minute
  if (now - lastResetTime > 60000) {
    callCount = 0;
    lastResetTime = now;
  }
  
  // Check circuit breaker
  if (circuitBreakerTripped) {
    if (now - circuitBreakerTrippedAt > CIRCUIT_BREAKER_DURATION_MS) {
      console.log('🔌 Circuit breaker reset');
      circuitBreakerTripped = false;
    } else {
      const remainingMs = CIRCUIT_BREAKER_DURATION_MS - (now - circuitBreakerTrippedAt);
      console.log(`⚡ Circuit breaker active, ${Math.round(remainingMs / 1000)}s remaining`);
      return false;
    }
  }
  
  // Check rate limit
  if (callCount >= MAX_CALLS_PER_MINUTE) {
    console.log(`🚦 Rate limit reached (${callCount}/${MAX_CALLS_PER_MINUTE} calls/min)`);
    return false;
  }
  
  callCount++;
  return true;
}

// Trip circuit breaker on 429 response
function tripCircuitBreaker(): void {
  console.log('🔴 Circuit breaker TRIPPED - pausing Helius calls for 5 minutes');
  circuitBreakerTripped = true;
  circuitBreakerTrippedAt = Date.now();
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) return;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Estimate credits based on method
    let creditsUsed = 1;
    const premiumMethods = ['getAsset', 'getAssetBatch', 'searchAssets', 'TOKEN_MINT'];
    if (params.method && premiumMethods.some(m => params.method?.includes(m))) {
      creditsUsed = 10;
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
  
  const sanitized = JSON.parse(JSON.stringify(params));
  const sensitiveKeys = ['api-key', 'apiKey', 'api_key', 'secretKey', 'privateKey', 'secret', 'password'];
  
  function recursiveSanitize(obj: any) {
    if (typeof obj !== 'object' || obj === null) return;
    
    for (const key in obj) {
      if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        recursiveSanitize(obj[key]);
      }
    }
  }
  
  recursiveSanitize(sanitized);
  return sanitized;
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
  // Check rate limit
  if (!checkRateLimit()) {
    console.log(`⏳ Helius call skipped due to rate limit: ${params.endpoint}`);
    return null;
  }
  
  const startTime = Date.now();
  
  try {
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
      tripCircuitBreaker();
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
 */
export function canMakeHeliusCall(): boolean {
  const now = Date.now();
  
  // Check circuit breaker
  if (circuitBreakerTripped && now - circuitBreakerTrippedAt < CIRCUIT_BREAKER_DURATION_MS) {
    return false;
  }
  
  // Reset counter if needed
  if (now - lastResetTime > 60000) {
    callCount = 0;
    lastResetTime = now;
  }
  
  return callCount < MAX_CALLS_PER_MINUTE;
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(): { callsRemaining: number; circuitBreakerActive: boolean } {
  const now = Date.now();
  
  if (now - lastResetTime > 60000) {
    callCount = 0;
    lastResetTime = now;
  }
  
  return {
    callsRemaining: Math.max(0, MAX_CALLS_PER_MINUTE - callCount),
    circuitBreakerActive: circuitBreakerTripped && now - circuitBreakerTrippedAt < CIRCUIT_BREAKER_DURATION_MS,
  };
}
