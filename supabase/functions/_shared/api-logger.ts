/**
 * Unified API Logger for tracking external service calls
 * Logs to api_usage_log table for cost tracking and monitoring
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ServiceName = 'helius' | 'dexscreener' | 'solscan' | 'rugcheck' | 'pumpfun' | 'jupiter' | 'coingecko' | 'bonkfun' | 'bagsfm';
export type RequestType = 'holders_report' | 'price_discovery' | 'sns_lookup' | 'lp_detection' | 'insider_check' | 'creator_lookup' | 'market_data';

export interface ApiLogParams {
  serviceName: ServiceName;
  endpoint: string;
  method?: string;
  tokenMint?: string;
  functionName: string;
  requestType?: RequestType;
  credits?: number;
  isCached?: boolean;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface ApiLogger {
  complete: (status: number, errorMessage?: string) => Promise<void>;
  fail: (errorMessage: string) => Promise<void>;
}

// Credit costs per service (estimates)
export const SERVICE_CREDITS: Record<ServiceName, number> = {
  helius: 100,      // getProgramAccounts is ~100 credits
  solscan: 1,       // Pro API is 1 credit per call
  dexscreener: 0,   // Free
  rugcheck: 0,      // Free
  pumpfun: 0,       // Free
  jupiter: 0,       // Free
  coingecko: 0,     // Free tier
  bonkfun: 0,       // Free
  bagsfm: 0,        // Free
};

// Rate limits per service (requests per minute)
export const SERVICE_RATE_LIMITS: Record<ServiceName, number> = {
  helius: 50,
  solscan: 100,
  dexscreener: 300,
  rugcheck: 60,     // Estimated
  pumpfun: 120,     // Estimated
  jupiter: 600,
  coingecko: 50,
  bonkfun: 60,      // Estimated
  bagsfm: 60,       // Estimated
};

/**
 * Create an API logger for a service call
 * Returns a logger object with complete() and fail() methods
 */
export function createApiLogger(params: ApiLogParams): ApiLogger {
  const startTime = Date.now();
  const logId = crypto.randomUUID();
  
  // Get Supabase client for logging
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://apxauapuusmgwbbzjgfl.supabase.co';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  
  const logToDatabase = async (status: number, success: boolean, errorMessage?: string) => {
    if (!supabaseKey) {
      console.warn('[ApiLogger] No Supabase key available, skipping log');
      return;
    }
    
    const responseTimeMs = Date.now() - startTime;
    const credits = params.credits ?? SERVICE_CREDITS[params.serviceName] ?? 0;
    
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase.from('api_usage_log').insert({
        service_name: params.serviceName,
        endpoint: params.endpoint,
        method: params.method || 'GET',
        token_mint: params.tokenMint,
        function_name: params.functionName,
        request_type: params.requestType,
        response_status: status,
        response_time_ms: responseTimeMs,
        success,
        error_message: errorMessage,
        credits_used: credits,
        is_cached: params.isCached || false,
        user_id: params.userId,
        session_id: params.sessionId,
        metadata: params.metadata || {},
      });
      
      console.log(`[ApiLogger] ${params.serviceName}:${params.endpoint} → ${status} (${responseTimeMs}ms, ${credits} credits)`);
    } catch (e) {
      // Fire and forget - don't let logging errors affect the main flow
      console.warn('[ApiLogger] Failed to log API call:', e);
    }
  };
  
  return {
    complete: async (status: number, errorMessage?: string) => {
      const success = status >= 200 && status < 400;
      await logToDatabase(status, success, errorMessage);
    },
    fail: async (errorMessage: string) => {
      await logToDatabase(0, false, errorMessage);
    },
  };
}

/**
 * Wrap a fetch call with automatic logging
 * Usage: const response = await loggedFetch(params, () => fetch(url, options));
 */
export async function loggedFetch<T>(
  params: ApiLogParams,
  fetchFn: () => Promise<Response>
): Promise<Response> {
  const logger = createApiLogger(params);
  
  try {
    const response = await fetchFn();
    await logger.complete(response.status);
    return response;
  } catch (error) {
    await logger.fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Log a batch of API calls for a token analysis
 * Aggregates costs into token_analysis_costs table
 */
export async function logTokenAnalysisCosts(
  tokenMint: string,
  costs: {
    heliusCredits?: number;
    solscanCredits?: number;
    dexscreenerCalls?: number;
    rugcheckCalls?: number;
    pumpfunCalls?: number;
    jupiterCalls?: number;
    coingeckoCalls?: number;
    totalApiCalls?: number;
    totalResponseTimeMs?: number;
    holderCount?: number;
  },
  sessionId?: string,
  userId?: string
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://apxauapuusmgwbbzjgfl.supabase.co';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  
  if (!supabaseKey) {
    console.warn('[ApiLogger] No Supabase key available, skipping cost log');
    return;
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Upsert to aggregate daily costs per token
    const { error } = await supabase.from('token_analysis_costs').upsert({
      token_mint: tokenMint,
      analysis_date: new Date().toISOString().split('T')[0],
      session_id: sessionId || 'anonymous',
      user_id: userId,
      total_api_calls: costs.totalApiCalls || 0,
      helius_credits: costs.heliusCredits || 0,
      solscan_credits: costs.solscanCredits || 0,
      dexscreener_calls: costs.dexscreenerCalls || 0,
      rugcheck_calls: costs.rugcheckCalls || 0,
      pumpfun_calls: costs.pumpfunCalls || 0,
      jupiter_calls: costs.jupiterCalls || 0,
      coingecko_calls: costs.coingeckoCalls || 0,
      total_response_time_ms: costs.totalResponseTimeMs || 0,
      holder_count: costs.holderCount,
    }, {
      onConflict: 'token_mint,analysis_date,session_id',
    });
    
    if (error) {
      console.warn('[ApiLogger] Failed to log token analysis costs:', error);
    } else {
      console.log(`[ApiLogger] Token ${tokenMint} analysis costs logged`);
    }
  } catch (e) {
    console.warn('[ApiLogger] Failed to log token analysis costs:', e);
  }
}
