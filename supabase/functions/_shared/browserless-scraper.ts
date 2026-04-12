/**
 * Browserless scraper utility
 * Uses self-hosted Browserless (Chromium) for JS-heavy page scraping
 */

export interface ScrapeResult {
  url: string;
  html?: string;
  text?: string;
  title?: string;
  success: boolean;
  error?: string;
  elapsed_ms: number;
}

export interface ScrapeOptions {
  waitForSelector?: string;
  waitMs?: number;
  extractText?: boolean;
  screenshot?: boolean;
}

function getConfig() {
  const url = Deno.env.get('BROWSERLESS_URL');
  const token = Deno.env.get('BROWSERLESS_TOKEN');
  if (!url || !token) throw new Error('BROWSERLESS_URL or BROWSERLESS_TOKEN not configured');
  return { url: url.replace(/\/$/, ''), token };
}

/**
 * Scrape a page using Browserless /content endpoint (returns HTML)
 */
export async function scrapeHtml(targetUrl: string, opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  const { url, token } = getConfig();
  const start = Date.now();

  try {
    const res = await fetch(`${url}/content?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        waitForSelector: opts.waitForSelector,
        waitForTimeout: opts.waitMs || 3000,
        gotoOptions: { waitUntil: 'networkidle2', timeout: 30000 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { url: targetUrl, success: false, error: `HTTP ${res.status}: ${errText}`, elapsed_ms: Date.now() - start };
    }

    const html = await res.text();

    // Extract title from HTML
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || undefined;

    return { url: targetUrl, html, title, success: true, elapsed_ms: Date.now() - start };
  } catch (err) {
    return { url: targetUrl, success: false, error: err instanceof Error ? err.message : String(err), elapsed_ms: Date.now() - start };
  }
}

/**
 * Scrape and extract plain text using Browserless /scrape endpoint
 */
export async function scrapeText(targetUrl: string, opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  const { url, token } = getConfig();
  const start = Date.now();

  try {
    const res = await fetch(`${url}/scrape?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        elements: [{ selector: 'body' }],
        waitForSelector: opts.waitForSelector,
        waitForTimeout: opts.waitMs || 3000,
        gotoOptions: { waitUntil: 'networkidle2', timeout: 30000 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { url: targetUrl, success: false, error: `HTTP ${res.status}: ${errText}`, elapsed_ms: Date.now() - start };
    }

    const data = await res.json();
    const bodyData = data?.data?.[0];
    const text = bodyData?.results?.[0]?.text || bodyData?.text || '';
    const html = bodyData?.results?.[0]?.html || bodyData?.html || '';

    return { url: targetUrl, text, html, success: true, elapsed_ms: Date.now() - start };
  } catch (err) {
    return { url: targetUrl, success: false, error: err instanceof Error ? err.message : String(err), elapsed_ms: Date.now() - start };
  }
}

/**
 * Take a screenshot using Browserless /screenshot endpoint
 */
export async function screenshotPage(targetUrl: string, opts: ScrapeOptions = {}): Promise<{ success: boolean; imageBase64?: string; error?: string }> {
  const { url, token } = getConfig();

  try {
    const res = await fetch(`${url}/screenshot?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        options: { fullPage: false, type: 'png' },
        waitForTimeout: opts.waitMs || 3000,
        gotoOptions: { waitUntil: 'networkidle2', timeout: 30000 },
      }),
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }

    const buffer = await res.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return { success: true, imageBase64: base64 };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
