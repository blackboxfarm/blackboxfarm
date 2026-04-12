/**
 * Scraper Router — Unified facade for Browserless (primary) ↔ Firecrawl (fallback)
 * 
 * Reads scraper_provider_config to determine provider order.
 * Logs every request to scraper_audit_log for detailed tracking.
 * Auto-falls-back on failure if auto_fallback_enabled = true.
 */

import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { scrapeHtml, scrapeText } from './browserless-scraper.ts';

// ─── Types ──────────────────────────────────────────────────────────────

export interface ScrapeRequest {
  url: string;
  functionName: string;
  formats?: string[];
  onlyMainContent?: boolean;
  waitFor?: number;
  timeout?: number;
}

export interface ScrapeResponse {
  success: boolean;
  markdown?: string;
  html?: string;
  links?: string[];
  metadata?: Record<string, any>;
  provider: string;
  fellBack: boolean;
  responseTimeMs: number;
  error?: string;
}

interface ProviderConfig {
  provider_primary: string;
  provider_fallback: string;
  browserless_enabled: boolean;
  firecrawl_enabled: boolean;
  auto_fallback_enabled: boolean;
}

// ─── Config cache (per cold start) ──────────────────────────────────────

let configCache: ProviderConfig | null = null;
let configCacheTime = 0;
const CONFIG_TTL_MS = 60_000; // Refresh config every minute

async function getProviderConfig(): Promise<ProviderConfig> {
  const now = Date.now();
  if (configCache && now - configCacheTime < CONFIG_TTL_MS) {
    return configCache;
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await supabase
      .from('scraper_provider_config')
      .select('provider_primary, provider_fallback, browserless_enabled, firecrawl_enabled, auto_fallback_enabled')
      .limit(1)
      .single();

    if (error || !data) {
      console.warn('[ScraperRouter] Config fetch failed, using defaults:', error?.message);
      return {
        provider_primary: 'browserless',
        provider_fallback: 'firecrawl',
        browserless_enabled: true,
        firecrawl_enabled: true,
        auto_fallback_enabled: true,
      };
    }

    configCache = data as ProviderConfig;
    configCacheTime = now;
    return configCache;
  } catch (e) {
    console.error('[ScraperRouter] Config error:', e);
    return {
      provider_primary: 'browserless',
      provider_fallback: 'firecrawl',
      browserless_enabled: true,
      firecrawl_enabled: true,
      auto_fallback_enabled: true,
    };
  }
}

// ─── Audit logging ──────────────────────────────────────────────────────

async function logAudit(entry: {
  functionName: string;
  targetUrl: string;
  providerUsed: string;
  providerWasPrimary: boolean;
  fellBack: boolean;
  fallbackProvider?: string;
  success: boolean;
  httpStatus?: number;
  responseTimeMs: number;
  responseSizeBytes?: number;
  contentUsable?: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await supabase.from('scraper_audit_log').insert({
      function_name: entry.functionName,
      target_url: entry.targetUrl,
      provider_used: entry.providerUsed,
      provider_was_primary: entry.providerWasPrimary,
      fell_back: entry.fellBack,
      fallback_provider: entry.fallbackProvider || null,
      success: entry.success,
      http_status: entry.httpStatus || null,
      response_time_ms: entry.responseTimeMs,
      response_size_bytes: entry.responseSizeBytes || null,
      content_usable: entry.contentUsable ?? null,
      error_message: entry.errorMessage || null,
      metadata: entry.metadata || null,
    });
  } catch (e) {
    console.error('[ScraperRouter] Audit log error:', e);
  }
}

// ─── Provider implementations ───────────────────────────────────────────

async function scrapeBrowserless(req: ScrapeRequest): Promise<ScrapeResponse> {
  const start = Date.now();
  try {
    const result = await scrapeHtml(req.url, {
      waitMs: req.waitFor || 5000,
    });

    const elapsed = Date.now() - start;

    if (!result.success) {
      return {
        success: false,
        provider: 'browserless',
        fellBack: false,
        responseTimeMs: elapsed,
        error: result.error,
      };
    }

    // Convert HTML to markdown, preserving links (critical for parsers)
    const html = result.html || '';
    const textContent = htmlToMarkdown(html);

    return {
      success: true,
      markdown: textContent,
      html,
      metadata: { title: result.title },
      provider: 'browserless',
      fellBack: false,
      responseTimeMs: elapsed,
    };
  } catch (e) {
    return {
      success: false,
      provider: 'browserless',
      fellBack: false,
      responseTimeMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function scrapeFirecrawl(req: ScrapeRequest): Promise<ScrapeResponse> {
  const start = Date.now();
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');

  if (!apiKey) {
    return {
      success: false,
      provider: 'firecrawl',
      fellBack: false,
      responseTimeMs: 0,
      error: 'FIRECRAWL_API_KEY not configured',
    };
  }

  try {
    let formattedUrl = req.url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: req.formats || ['markdown'],
        onlyMainContent: req.onlyMainContent ?? true,
        waitFor: req.waitFor,
        timeout: req.timeout,
        storeInCache: false,
      }),
    });

    const elapsed = Date.now() - start;
    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        provider: 'firecrawl',
        fellBack: false,
        responseTimeMs: elapsed,
        error: data.error || `HTTP ${response.status}`,
      };
    }

    const scraped = data.data || data;
    return {
      success: true,
      markdown: scraped.markdown || '',
      html: scraped.html || '',
      links: scraped.links || [],
      metadata: scraped.metadata || {},
      provider: 'firecrawl',
      fellBack: false,
      responseTimeMs: elapsed,
    };
  } catch (e) {
    return {
      success: false,
      provider: 'firecrawl',
      fellBack: false,
      responseTimeMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─── Main router ────────────────────────────────────────────────────────

/**
 * Smart scrape — uses primary provider, falls back to secondary on failure.
 * Logs every attempt to scraper_audit_log.
 */
export async function smartScrape(req: ScrapeRequest): Promise<ScrapeResponse> {
  const config = await getProviderConfig();

  const providers: Array<{ name: string; fn: (r: ScrapeRequest) => Promise<ScrapeResponse>; enabled: boolean }> = [
    { name: 'browserless', fn: scrapeBrowserless, enabled: config.browserless_enabled },
    { name: 'firecrawl', fn: scrapeFirecrawl, enabled: config.firecrawl_enabled },
  ];

  // Order by config
  const ordered = [
    providers.find(p => p.name === config.provider_primary),
    providers.find(p => p.name === config.provider_fallback),
  ].filter(Boolean) as typeof providers;

  let result: ScrapeResponse | null = null;
  let fellBack = false;
  let primaryResult: ScrapeResponse | null = null;

  for (let i = 0; i < ordered.length; i++) {
    const provider = ordered[i];

    if (!provider.enabled) {
      console.log(`[ScraperRouter] ${provider.name} disabled, skipping`);
      continue;
    }

    const isPrimary = i === 0;
    console.log(`[ScraperRouter] ${isPrimary ? '🔵 PRIMARY' : '🟡 FALLBACK'}: ${provider.name} → ${req.url}`);

    result = await provider.fn(req);

    // Log audit
    logAudit({
      functionName: req.functionName,
      targetUrl: req.url,
      providerUsed: provider.name,
      providerWasPrimary: isPrimary,
      fellBack,
      fallbackProvider: fellBack ? provider.name : undefined,
      success: result.success,
      responseTimeMs: result.responseTimeMs,
      responseSizeBytes: (result.markdown?.length || 0) + (result.html?.length || 0),
      contentUsable: result.success && (result.markdown?.length || 0) > 50,
      errorMessage: result.error,
      metadata: { formats: req.formats, waitFor: req.waitFor },
    }).catch(() => {});

    if (result.success) {
      result.fellBack = fellBack;
      return result;
    }

    // Primary failed — try fallback?
    if (isPrimary) {
      primaryResult = result;
      if (!config.auto_fallback_enabled) {
        console.warn(`[ScraperRouter] Primary failed, auto_fallback disabled`);
        return result;
      }
      fellBack = true;
      console.warn(`[ScraperRouter] Primary ${provider.name} failed: ${result.error}. Falling back...`);
    }
  }

  // Both failed
  return result || {
    success: false,
    provider: 'none',
    fellBack,
    responseTimeMs: 0,
    error: 'All providers disabled or failed',
  };
}

/**
 * Firecrawl search — no Browserless equivalent, stays Firecrawl-only.
 * Still logged for audit trail.
 */
export async function smartSearch(query: string, functionName: string, options?: {
  limit?: number;
  lang?: string;
  country?: string;
  scrapeOptions?: Record<string, any>;
}): Promise<{ success: boolean; data?: any[]; error?: string }> {
  const start = Date.now();
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');

  if (!apiKey) {
    return { success: false, error: 'FIRECRAWL_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit: options?.limit || 5,
        lang: options?.lang,
        country: options?.country,
        scrapeOptions: options?.scrapeOptions,
      }),
    });

    const elapsed = Date.now() - start;
    const data = await response.json();

    logAudit({
      functionName,
      targetUrl: `search:${query}`,
      providerUsed: 'firecrawl',
      providerWasPrimary: true,
      fellBack: false,
      success: response.ok,
      httpStatus: response.status,
      responseTimeMs: elapsed,
      errorMessage: response.ok ? undefined : (data.error || `HTTP ${response.status}`),
    }).catch(() => {});

    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    return { success: true, data: data.data || [] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
