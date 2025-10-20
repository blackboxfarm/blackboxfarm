import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

interface LogHeliusCallParams {
  functionName: string;
  endpoint: string;
  method?: string;
  requestParams?: any;
  userId?: string;
  ipAddress?: string;
}

interface HeliusLogger {
  complete: (status: number, success: boolean, error?: string) => Promise<void>;
}

// Sanitize request params to remove sensitive data
function sanitizeParams(params: any): any {
  if (!params) return null;
  
  const sanitized = JSON.parse(JSON.stringify(params));
  
  // Remove API keys, secrets, private keys
  const sensitiveKeys = ['api-key', 'apiKey', 'secretKey', 'privateKey', 'secret', 'password'];
  
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

// Estimate credits used based on method
function estimateCredits(method?: string): number {
  if (!method) return 1;
  
  // WebSocket connections use 1 credit per message
  // Most RPC calls use 1 credit
  // Some premium methods might use more
  const premiumMethods = ['getAsset', 'getAssetBatch', 'searchAssets'];
  
  if (premiumMethods.includes(method)) {
    return 10; // Premium methods cost more
  }
  
  return 1;
}

export async function logHeliusCall(params: LogHeliusCallParams): Promise<HeliusLogger> {
  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  // Create a service role client for logging
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  return {
    async complete(status: number, success: boolean, error?: string) {
      const responseTime = Date.now() - startTime;
      
      try {
        await supabase.from('helius_api_usage').insert({
          function_name: params.functionName,
          endpoint: params.endpoint,
          method: params.method,
          request_params: sanitizeParams(params.requestParams),
          response_status: status,
          response_time_ms: responseTime,
          success: success,
          error_message: error,
          user_id: params.userId || null,
          ip_address: params.ipAddress || null,
          credits_used: estimateCredits(params.method)
        });
      } catch (logError) {
        // Don't fail the original request if logging fails
        console.error('Failed to log Helius API usage:', logError);
      }
    }
  };
}

// Wrapper function for fetch calls to Helius
export async function loggedHeliusFetch(
  url: string,
  options: RequestInit,
  params: LogHeliusCallParams
): Promise<Response> {
  const logger = await logHeliusCall(params);
  
  try {
    const response = await fetch(url, options);
    await logger.complete(
      response.status,
      response.ok,
      response.ok ? undefined : `HTTP ${response.status}`
    );
    return response;
  } catch (error) {
    await logger.complete(
      0,
      false,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}
