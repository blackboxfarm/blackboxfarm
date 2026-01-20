/**
 * CoinGecko Error Classification System
 * Categorizes API errors for proper handling and alerting
 */

export type CoinGeckoErrorCode = 
  | 'RATE_LIMIT'      // 429 - Too many requests
  | 'AUTH_FAILED'     // 401/403 - Bad API key
  | 'SERVER_ERROR'    // 5xx - CoinGecko down
  | 'TIMEOUT'         // Request took too long
  | 'NETWORK'         // DNS/connection failure
  | 'INVALID_RESPONSE'// 200 but bad data
  | 'UNKNOWN';        // Catch-all

export interface CoinGeckoErrorInfo {
  errorCode: CoinGeckoErrorCode;
  httpStatus: number | null;
  message: string;
  retryAfterSeconds: number | null;
  timestamp: string;
  endpoint: string;
  tier: string;
  shouldAlert: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Classify an error from CoinGecko API into actionable categories
 */
export function classifyCoinGeckoError(
  error: Error | string,
  options: {
    httpStatus?: number;
    retryAfter?: string | null;
    endpoint?: string;
    tier?: string;
  } = {}
): CoinGeckoErrorInfo {
  const errorStr = typeof error === 'string' ? error : error.message;
  const errorLower = errorStr.toLowerCase();
  const { httpStatus, retryAfter, endpoint = 'unknown', tier = 'unknown' } = options;

  const baseInfo = {
    timestamp: new Date().toISOString(),
    endpoint,
    tier,
    message: errorStr.slice(0, 500),
    retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) || null : null,
    httpStatus: httpStatus || null,
  };

  // Rate limit (429)
  if (httpStatus === 429 || errorLower.includes('429') || errorLower.includes('rate limit') || errorLower.includes('too many')) {
    return {
      ...baseInfo,
      errorCode: 'RATE_LIMIT',
      httpStatus: httpStatus || 429,
      shouldAlert: true,
      severity: 'high',
    };
  }

  // Authentication failure (401/403)
  if (httpStatus === 401 || httpStatus === 403 || errorLower.includes('unauthorized') || errorLower.includes('forbidden')) {
    return {
      ...baseInfo,
      errorCode: 'AUTH_FAILED',
      httpStatus: httpStatus || 401,
      shouldAlert: true,
      severity: 'critical',
    };
  }

  // Server errors (5xx)
  if (httpStatus && httpStatus >= 500) {
    return {
      ...baseInfo,
      errorCode: 'SERVER_ERROR',
      shouldAlert: httpStatus >= 502, // Only alert for 502+ (major outages)
      severity: 'medium',
    };
  }

  // Timeout errors
  if (errorLower.includes('timeout') || errorLower.includes('abort') || errorLower.includes('timed out')) {
    return {
      ...baseInfo,
      errorCode: 'TIMEOUT',
      shouldAlert: false, // Don't alert for transient timeouts
      severity: 'low',
    };
  }

  // Network/DNS errors
  if (errorLower.includes('dns') || errorLower.includes('network') || errorLower.includes('enotfound') || errorLower.includes('econnrefused')) {
    return {
      ...baseInfo,
      errorCode: 'NETWORK',
      shouldAlert: false, // Don't alert for network issues
      severity: 'low',
    };
  }

  // Invalid response (got 200 but data is wrong)
  if (errorLower.includes('invalid') || errorLower.includes('missing') || errorLower.includes('undefined')) {
    return {
      ...baseInfo,
      errorCode: 'INVALID_RESPONSE',
      shouldAlert: false,
      severity: 'low',
    };
  }

  // Unknown/catch-all
  return {
    ...baseInfo,
    errorCode: 'UNKNOWN',
    shouldAlert: false,
    severity: 'low',
  };
}

/**
 * Parse HTTP response to extract error details including retry-after header
 */
export function parseResponseError(response: Response, endpoint: string, tier: string): CoinGeckoErrorInfo {
  const retryAfter = response.headers.get('retry-after');
  
  return classifyCoinGeckoError(
    `HTTP ${response.status} ${response.statusText}`,
    {
      httpStatus: response.status,
      retryAfter,
      endpoint,
      tier,
    }
  );
}

/**
 * Determine if we should use fallback based on error type
 */
export function shouldUseFallback(errorInfo: CoinGeckoErrorInfo): boolean {
  // Always fallback for these errors
  return ['RATE_LIMIT', 'AUTH_FAILED', 'SERVER_ERROR', 'TIMEOUT', 'NETWORK'].includes(errorInfo.errorCode);
}

/**
 * Get recommended wait time before retrying CoinGecko
 */
export function getRetryDelay(errorInfo: CoinGeckoErrorInfo): number {
  // Use retry-after header if available
  if (errorInfo.retryAfterSeconds && errorInfo.retryAfterSeconds > 0) {
    return errorInfo.retryAfterSeconds * 1000;
  }

  // Default delays by error type
  switch (errorInfo.errorCode) {
    case 'RATE_LIMIT':
      return 60000; // 1 minute for rate limits
    case 'AUTH_FAILED':
      return 300000; // 5 minutes for auth issues (need manual fix)
    case 'SERVER_ERROR':
      return 30000; // 30 seconds for server issues
    case 'TIMEOUT':
    case 'NETWORK':
      return 5000; // 5 seconds for transient issues
    default:
      return 10000; // 10 seconds default
  }
}

/**
 * Format error info for logging
 */
export function formatErrorForLog(errorInfo: CoinGeckoErrorInfo): string {
  return `[CoinGecko ${errorInfo.tier}] ${errorInfo.errorCode} (HTTP ${errorInfo.httpStatus || 'N/A'}) on ${errorInfo.endpoint}: ${errorInfo.message}`;
}
