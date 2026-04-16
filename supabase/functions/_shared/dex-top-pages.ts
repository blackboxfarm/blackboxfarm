import { smartScrape } from './scraper-router.ts';
import { createClient } from "npm:@supabase/supabase-js@2.54.0";

export interface RankedDexPair {
  rank: number;
  pairId: string;
  url: string;
  fallbackSymbol: string | null;
  fallbackName: string | null;
}

export interface ScrapeHealthResult {
  page1_ok: boolean;
  page2_ok: boolean;
  page1_count: number;
  page2_count: number;
  page1_error: string | null;
  page2_error: string | null;
  total_parsed: number;
  retry_used: boolean;
  providers_used: string[];
}

interface ScrapeSource {
  id: string;
  url: string;
  label: string;
  sort_order: number;
  is_page2: boolean;
  wait_ms: number[];
}

function cleanLine(line: string): string {
  return line.replace(/\\+/g, " ").replace(/\s+/g, " ").trim();
}

function extractFallbacks(block: string): { fallbackSymbol: string | null; fallbackName: string | null } {
  const lines = block
    .split("\n")
    .map(cleanLine)
    .filter(Boolean)
    .filter((line) => !line.startsWith("![](http"));

  const pairLabel = lines.find((line) => line.includes("/")) || null;
  const fallbackSymbol = pairLabel ? pairLabel.split("/")[0].trim() : null;

  if (!pairLabel) {
    return { fallbackSymbol, fallbackName: null };
  }

  const pairIndex = lines.indexOf(pairLabel);
  const fallbackName =
    lines
      .slice(pairIndex + 1)
      .find((line) => !line.startsWith("$") && !/^\d+[smhdwymo]+$/i.test(line) && !/^[-+]?\d/.test(line)) || null;

  return { fallbackSymbol, fallbackName };
}

export function parseDexTopPageMarkdown(markdown: string): RankedDexPair[] {
  const pairs: RankedDexPair[] = [];
  const entryPattern = /\[#(\d+)([\s\S]*?)\]\(https:\/\/dexscreener\.com\/solana\/([A-Za-z0-9]+)\)/g;

  let match: RegExpExecArray | null;
  while ((match = entryPattern.exec(markdown)) !== null) {
    const rank = Number.parseInt(match[1], 10);
    const pairId = match[3];
    const url = `https://dexscreener.com/solana/${pairId}`;
    const { fallbackSymbol, fallbackName } = extractFallbacks(match[2]);

    if (!Number.isFinite(rank) || !pairId) continue;

    pairs.push({ rank, pairId, url, fallbackSymbol, fallbackName });
  }

  return pairs.sort((a, b) => a.rank - b.rank);
}

// ─── Response validation ────────────────────────────────────────────────
const GARBAGE_PATTERNS = [
  /^bad gateway/i,
  /^gateway timeout/i,
  /^access denied/i,
  /^error\b/i,
  /^<!DOCTYPE\s+html[^>]*>\s*<html[^>]*>\s*<head[^>]*>[\s\S]{0,500}(502|503|504|403|error|blocked)/i,
  /^{"error"/i,
  /cloudflare/i,
  /just a moment/i,
];

function isUsableMarkdown(body: string | undefined | null): { usable: boolean; reason?: string } {
  if (!body || body.trim().length === 0) {
    return { usable: false, reason: 'empty_body' };
  }
  const trimmed = body.trim();
  if (trimmed.length < 200) {
    return { usable: false, reason: `body_too_short (${trimmed.length} chars)` };
  }
  for (const pattern of GARBAGE_PATTERNS) {
    if (pattern.test(trimmed)) {
      const preview = trimmed.slice(0, 80).replace(/\n/g, ' ');
      return { usable: false, reason: `upstream_error: "${preview}..."` };
    }
  }
  return { usable: true };
}

// ─── Fallback URLs if DB query fails ────────────────────────────────────
const FALLBACK_SOURCES: ScrapeSource[] = [
  { id: 'fallback-1', url: 'https://dexscreener.com/solana', label: 'Solana Page 1', sort_order: 1, is_page2: false, wait_ms: [3000, 5000, 8000] },
  { id: 'fallback-2', url: 'https://dexscreener.com/solana/page-2', label: 'Solana Page 2', sort_order: 2, is_page2: true, wait_ms: [10000, 15000, 20000] },
];

async function loadScrapeSources(): Promise<ScrapeSource[]> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.warn('[DexTop200] Missing env vars, using fallback sources');
      return FALLBACK_SOURCES;
    }
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase
      .from('dex_scrape_sources')
      .select('id, url, label, sort_order, is_page2, wait_ms')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error || !data || data.length === 0) {
      console.warn('[DexTop200] DB source query failed or empty, using fallback:', error?.message);
      return FALLBACK_SOURCES;
    }
    console.log(`[DexTop200] Loaded ${data.length} scrape sources from DB`);
    return data as ScrapeSource[];
  } catch (e) {
    console.warn('[DexTop200] Failed to load sources from DB:', e);
    return FALLBACK_SOURCES;
  }
}

async function updateSourceStats(sourceId: string, pairCount: number) {
  try {
    if (sourceId.startsWith('fallback-')) return;
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return;
    const supabase = createClient(supabaseUrl, serviceKey);
    await supabase
      .from('dex_scrape_sources')
      .update({ last_scraped_at: new Date().toISOString(), last_pair_count: pairCount })
      .eq('id', sourceId);
  } catch (e) {
    console.warn('[DexTop200] Failed to update source stats:', e);
  }
}

async function scrapePageMarkdown(url: string, waitConfigs: number[], configIndex = 0, isPage2 = false): Promise<{ markdown: string; retried: boolean; provider: string }> {
  const waitFor = waitConfigs[configIndex] || waitConfigs[0];
  const attempt = configIndex + 1;

  console.log(`[DexTop200] Scraping ${url} (attempt ${attempt}, waitFor=${waitFor})...`);

  const result = await smartScrape({
    url,
    functionName: 'dex-top-200',
    formats: ['markdown'],
    onlyMainContent: configIndex % 2 === 0,
    waitFor,
    timeout: isPage2 ? 60000 : 30000,
    preferredProvider: 'firecrawl',
  });

  if (!result.success) {
    if (configIndex + 1 < waitConfigs.length) {
      console.warn(`[DexTop200] Attempt ${attempt} failed: ${result.error}. Retrying...`);
      await new Promise(r => setTimeout(r, 3000));
      return scrapePageMarkdown(url, waitConfigs, configIndex + 1, isPage2);
    }
    throw new Error(result.error || 'Scrape failed');
  }

  const markdown = result.markdown || '';
  const validation = isUsableMarkdown(markdown);
  if (!validation.usable) {
    if (configIndex + 1 < waitConfigs.length) {
      console.warn(`[DexTop200] Attempt ${attempt}: unusable content: ${validation.reason}. Retrying...`);
      await new Promise(r => setTimeout(r, 3000));
      return scrapePageMarkdown(url, waitConfigs, configIndex + 1, isPage2);
    }
    throw new Error(`Unusable content: ${validation.reason}`);
  }

  const testPairs = parseDexTopPageMarkdown(markdown);
  if (testPairs.length === 0 && configIndex + 1 < waitConfigs.length) {
    console.warn(`[DexTop200] Attempt ${attempt}: 0 pairs parsed. Retrying...`);
    await new Promise(r => setTimeout(r, 3000));
    return scrapePageMarkdown(url, waitConfigs, configIndex + 1, isPage2);
  }

  return { markdown, retried: configIndex > 0, provider: result.provider };
}

export async function scrapeDexTopPages(): Promise<{ pairs: RankedDexPair[]; health: ScrapeHealthResult }> {
  const sources = await loadScrapeSources();

  const health: ScrapeHealthResult = {
    page1_ok: false, page2_ok: false,
    page1_count: 0, page2_count: 0,
    page1_error: null, page2_error: null,
    total_parsed: 0, retry_used: false,
    providers_used: [],
  };

  const allPairs: RankedDexPair[] = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const pageKey = i === 0 ? 'page1' : 'page2';

    if (i > 0) {
      await new Promise(r => setTimeout(r, 5000));
    }

    try {
      const result = await scrapePageMarkdown(source.url, source.wait_ms, 0, source.is_page2);
      if (result.retried) health.retry_used = true;
      if (!health.providers_used.includes(result.provider)) health.providers_used.push(result.provider);
      (health as any)[`${pageKey}_ok`] = true;

      const parsed = parseDexTopPageMarkdown(result.markdown);
      (health as any)[`${pageKey}_count`] = parsed.length;
      allPairs.push(...parsed);

      // Update source stats in background
      updateSourceStats(source.id, parsed.length).catch(() => {});
    } catch (e: any) {
      console.error(`[DexTop200] ${source.label} FAILED:`, e.message);
      (health as any)[`${pageKey}_error`] = e.message;
    }
  }

  const uniqueByRank = new Map<number, RankedDexPair>();
  for (const pair of allPairs) {
    if (!uniqueByRank.has(pair.rank)) {
      uniqueByRank.set(pair.rank, pair);
    }
  }

  const ranked = [...uniqueByRank.values()].sort((a, b) => a.rank - b.rank);
  health.total_parsed = ranked.length;

  console.log(`[DexTop200] Parsed ${ranked.length} ranked pairs (providers: ${health.providers_used.join(',')})`);

  return { pairs: ranked, health };
}
