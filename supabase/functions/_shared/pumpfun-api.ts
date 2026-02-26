// Pump.fun API configuration
// v1 (frontend-api.pump.fun) is deprecated and blocked by Cloudflare
// v3 (frontend-api-v3.pump.fun) is the current active version

export const PUMPFUN_API_BASE = 'https://frontend-api-v3.pump.fun';

// Fallback endpoint (herokuapp mirror)
export const PUMPFUN_API_FALLBACK = 'https://client-api-2-74b1891ee9f9.herokuapp.com';

// Standard headers for pump.fun API requests
export const PUMPFUN_HEADERS: Record<string, string> = {
  'Accept': 'application/json',
  'Origin': 'https://pump.fun',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};
