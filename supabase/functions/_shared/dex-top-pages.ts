const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/scrape";

const DEX_TOP_PAGE_URLS = [
  "https://dexscreener.com/solana",
  "https://dexscreener.com/solana/page-2",
];

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
// Detects upstream error pages / CDN failures returned as 200 OK
const GARBAGE_PATTERNS = [
  /^bad gateway/i,
  /^gateway timeout/i,
  /^access denied/i,
  /^error\b/i,
  /^<!DOCTYPE\s+html[^>]*>\s*<html[^>]*>\s*<head[^>]*>[\s\S]{0,500}(502|503|504|403|error|blocked)/i,
  /^{"error"/i,
  /cloudflare/i,
  /just a moment/i, // Cloudflare challenge page
];

function isUsableMarkdown(body: string | undefined | null): { usable: boolean; reason?: string } {
  if (!body || body.trim().length === 0) {
    return { usable: false, reason: 'empty_body' };
  }
  const trimmed = body.trim();
  // Very short responses are almost certainly error pages, not 100+ token listings
  if (trimmed.length < 200) {
    return { usable: false, reason: `body_too_short (${trimmed.length} chars)` };
  }
  for (const pattern of GARBAGE_PATTERNS) {
    if (pattern.test(trimmed)) {
      // Extract a preview for logging
      const preview = trimmed.slice(0, 80).replace(/\n/g, ' ');
      return { usable: false, reason: `upstream_error: "${preview}..."` };
    }
  }
  return { usable: true };
}

// ─── Scrape configs ─────────────────────────────────────────────────────
// Each config specifies waitFor AND a matching timeout (timeout must be ≥ 2× waitFor)
const SCRAPE_CONFIGS_PAGE1 = [
  { waitFor: 3000, timeout: 30000, onlyMainContent: true },
  { waitFor: 5000, timeout: 30000, onlyMainContent: false },
  { waitFor: 8000, timeout: 30000, onlyMainContent: true },
];

const SCRAPE_CONFIGS_PAGE2 = [
  { waitFor: 10000, timeout: 45000, onlyMainContent: false },
  { waitFor: 15000, timeout: 55000, onlyMainContent: true },
  { waitFor: 20000, timeout: 60000, onlyMainContent: false },
];

async function scrapePageMarkdown(url: string, configIndex = 0, isPage2 = false): Promise<{ markdown: string; retried: boolean }> {
  const SCRAPE_CONFIGS = isPage2 ? SCRAPE_CONFIGS_PAGE2 : SCRAPE_CONFIGS_PAGE1;
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY not configured");
  }

  // Check centralized rate-limit budget
  const { checkFirecrawlBudget } = await import('./firecrawl-guard.ts');
  const budget = checkFirecrawlBudget('dex-top-200');
  if (!budget.allowed) {
    throw new Error(`FIRECRAWL_SELF_THROTTLED: ${budget.reason}`);
  }

  const config = SCRAPE_CONFIGS[configIndex] || SCRAPE_CONFIGS[0];
  const attempt = configIndex + 1;
  console.log(`[DexTop200] Scraping ${url} (attempt ${attempt}, waitFor=${config.waitFor}, timeout=${config.timeout})...`);

  const response = await fetch(FIRECRAWL_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: config.onlyMainContent,
      waitFor: config.waitFor,
      timeout: config.timeout,
      storeInCache: false,
    }),
  });

  // ─── HTTP-level error handling ──────────────────────────────────────
  if (!response.ok) {
    let errMsg: string;
    try {
      const data = await response.json();
      errMsg = data?.error || `Firecrawl scrape failed for ${url} (${response.status})`;
    } catch {
      const text = await response.text().catch(() => '');
      errMsg = `Firecrawl HTTP ${response.status}: ${text.slice(0, 120)}`;
    }

    if (response.status === 402) {
      throw new Error(`FIRECRAWL_CREDITS_EXHAUSTED: ${errMsg}`);
    }
    if (response.status === 429) {
      throw new Error(`FIRECRAWL_RATE_LIMITED: ${errMsg}`);
    }
    if (response.status === 403) {
      throw new Error(`FIRECRAWL_BLOCKED: Possible IP/fingerprint block (${response.status})`);
    }

    // Retry with next config if available
    if (configIndex + 1 < SCRAPE_CONFIGS.length) {
      console.warn(`[DexTop200] Attempt ${attempt} failed for ${url}: ${errMsg}. Retrying...`);
      await new Promise(r => setTimeout(r, 3000));
      return scrapePageMarkdown(url, configIndex + 1, isPage2);
    }

    throw new Error(errMsg);
  }

  // ─── Parse JSON safely ──────────────────────────────────────────────
  let data: any;
  try {
    data = await response.json();
  } catch {
    const rawText = await response.text().catch(() => '');
    const preview = rawText.slice(0, 100).replace(/\n/g, ' ');
    const errMsg = `Firecrawl returned non-JSON response: "${preview}"`;
    console.error(`[DexTop200] ${errMsg}`);

    if (configIndex + 1 < SCRAPE_CONFIGS.length) {
      await new Promise(r => setTimeout(r, 3000));
      return scrapePageMarkdown(url, configIndex + 1, isPage2);
    }
    throw new Error(errMsg);
  }

  const markdown = data?.data?.markdown || data?.markdown;

  // ─── Content validation gate ────────────────────────────────────────
  const validation = isUsableMarkdown(markdown);
  if (!validation.usable) {
    const errMsg = `Scrape returned unusable content for ${url}: ${validation.reason}`;
    console.warn(`[DexTop200] Attempt ${attempt}: ${errMsg}`);

    if (configIndex + 1 < SCRAPE_CONFIGS.length) {
      await new Promise(r => setTimeout(r, 3000));
      return scrapePageMarkdown(url, configIndex + 1, isPage2);
    }
    throw new Error(errMsg);
  }

  // Check if we actually got ranked entries — content looks valid but no pairs = possible structure change
  const testPairs = parseDexTopPageMarkdown(markdown);
  if (testPairs.length === 0 && configIndex + 1 < SCRAPE_CONFIGS.length) {
    console.warn(`[DexTop200] Attempt ${attempt}: markdown returned but 0 pairs parsed for ${url}. Retrying...`);
    await new Promise(r => setTimeout(r, 3000));
    return scrapePageMarkdown(url, configIndex + 1, isPage2);
  }

  return { markdown, retried: configIndex > 0 };
}

export async function scrapeDexTopPages(): Promise<{ pairs: RankedDexPair[]; health: ScrapeHealthResult }> {
  const health: ScrapeHealthResult = {
    page1_ok: false, page2_ok: false,
    page1_count: 0, page2_count: 0,
    page1_error: null, page2_error: null,
    total_parsed: 0, retry_used: false,
  };

  const results: { markdown: string; retried: boolean }[] = [];

  // Scrape both pages independently — one failing shouldn't kill the other
  // Stagger: scrape page 1 first, then page 2 with a brief gap to avoid concurrent Firecrawl pressure
  for (let i = 0; i < DEX_TOP_PAGE_URLS.length; i++) {
    const pageKey = i === 0 ? 'page1' : 'page2';
    const isPage2 = i === 1;

    // Brief stagger between pages to avoid Firecrawl rate-limit collisions
    if (isPage2) {
      await new Promise(r => setTimeout(r, 5000));
    }

    try {
      const result = await scrapePageMarkdown(DEX_TOP_PAGE_URLS[i], 0, isPage2);
      results.push(result);
      if (result.retried) health.retry_used = true;
      health[`${pageKey}_ok` as keyof ScrapeHealthResult] = true as any;
    } catch (e: any) {
      console.error(`[DexTop200] ${pageKey} FAILED:`, e.message);
      (health as any)[`${pageKey}_error`] = e.message;
      results.push({ markdown: '', retried: false });
    }
  }

  const allPairs: RankedDexPair[] = [];
  for (let i = 0; i < results.length; i++) {
    const parsed = results[i].markdown ? parseDexTopPageMarkdown(results[i].markdown) : [];
    const pageKey = i === 0 ? 'page1' : 'page2';
    (health as any)[`${pageKey}_count`] = parsed.length;
    allPairs.push(...parsed);
  }

  const uniqueByRank = new Map<number, RankedDexPair>();
  for (const pair of allPairs) {
    if (!uniqueByRank.has(pair.rank)) {
      uniqueByRank.set(pair.rank, pair);
    }
  }

  const ranked = [...uniqueByRank.values()].sort((a, b) => a.rank - b.rank);
  health.total_parsed = ranked.length;

  console.log(`[DexTop200] Parsed ${ranked.length} ranked pairs (p1: ${health.page1_count}, p2: ${health.page2_count}, retry: ${health.retry_used})`);

  return { pairs: ranked, health };
}
