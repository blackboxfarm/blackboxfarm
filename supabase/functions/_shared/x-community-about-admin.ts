/**
 * X Community About Page Admin Extractor
 * 
 * Uses Firecrawl (primary) with Browserless fallback to scrape
 * the X community about page for admin/moderator handles.
 */

export interface XCommunityAboutAdminResult {
  adminUsername: string | null;
  moderatorUsernames: string[];
  memberCount: number | null;
  communityName: string | null;
  httpStatus: number;
  error?: string;
  scrapeProvider: 'firecrawl' | 'browserless' | 'none';
  rawData: {
    source: 'firecrawl_about_page' | 'browserless_about_page';
    aboutPageUrl: string;
    finalUrl?: string;
    pageTitle?: string;
    textSnippet: string;
    adminUsername: string | null;
    moderatorUsernames: string[];
    memberCount: number | null;
    communityName: string | null;
  };
}

function normalizeHandle(handle: string | null | undefined): string | null {
  const normalized = handle?.trim().replace(/^@/, '').toLowerCase();
  return normalized || null;
}

/**
 * Parse handles and member count from page text.
 * Shared between Firecrawl and Browserless paths.
 */
function parseAboutPageText(text: string): {
  adminUsername: string | null;
  moderatorUsernames: string[];
  memberCount: number | null;
  communityName: string | null;
} {
  // Reserved words that are NOT real handles
  const RESERVED = new Set([
    'community', 'communities', 'admin', 'moderator', 'moderators',
    'rules', 'about', 'members', 'posts', 'join', 'joined', 'created',
    'i', 'intent', 'search', 'home', 'explore', 'settings', 'help',
    'notifications', 'messages', 'compose', 'lists', 'bookmarks',
    'spaces', 'tos', 'privacy', 'login', 'signup', 'share', 'status',
  ]);

  const allHandles: string[] = [];

  function addHandle(h: string) {
    const clean = h.toLowerCase();
    if (!RESERVED.has(clean) && clean.length >= 2 && clean.length <= 15 && !allHandles.includes(clean)) {
      allHandles.push(clean);
    }
  }

  // Extract all handles from the Moderators section
  const moderatorSection = text.match(/Moderators[\s\S]{0,2000}/i);
  if (moderatorSection) {
    const handleMatches = moderatorSection[0].matchAll(/@([A-Za-z0-9_]{1,15})/g);
    for (const m of handleMatches) addHandle(m[1]);
  }

  // Fallback: "Created by @handle"
  if (allHandles.length === 0) {
    const createdMatch = text.match(/Created[\s\S]{0,160}?by\s+@?([A-Za-z0-9_]{1,15})/i);
    if (createdMatch) addHandle(createdMatch[1]);
  }

  // Also try "Admin" section specifically
  if (allHandles.length === 0) {
    const adminSection = text.match(/Admin[\s\S]{0,500}/i);
    if (adminSection) {
      const handleMatches = adminSection[0].matchAll(/@([A-Za-z0-9_]{1,15})/g);
      for (const m of handleMatches) addHandle(m[1]);
    }
  }

  const memberMatch = text.match(/([\d,]+)\s+Members?\b/i);

  // Extract community name from markdown H1 or first prominent text line.
  // Also strip noise like "Community", "About" headers.
  let communityName: string | null = null;
  const noiseNames = new Set(['community', 'about', 'home', 'communities', 'rules', 'members', 'moderators', 'admin']);
  const stripChrome = (s: string) => s.replace(/\s*\/\s*X\s*$/i, '').replace(/\s*on\s*X\s*$/i, '').trim();

  // 1) Markdown H1 (Firecrawl): "# Name"
  const h1Match = text.match(/^#\s+(.+?)\s*$/m);
  if (h1Match) {
    const candidate = stripChrome(h1Match[1]);
    if (candidate && !noiseNames.has(candidate.toLowerCase()) && candidate.length <= 80) {
      communityName = candidate;
    }
  }

  // 2) Look for "Community Info" header followed by name on next non-empty line
  if (!communityName) {
    const infoMatch = text.match(/Community\s+Info[\s\n]+([^\n]{2,80})/i);
    if (infoMatch) {
      const candidate = stripChrome(infoMatch[1]);
      if (candidate && !noiseNames.has(candidate.toLowerCase())) {
        communityName = candidate;
      }
    }
  }

  // 3) First non-empty, non-noise line within first 1500 chars (Browserless body.innerText)
  if (!communityName) {
    const lines = text.slice(0, 1500).split('\n').map(l => stripChrome(l)).filter(Boolean);
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (line.length < 2 || line.length > 80) continue;
      if (noiseNames.has(lower)) continue;
      if (/^@/.test(line)) continue;
      if (/^\d/.test(line)) continue; // member counts, dates
      if (/^(home|explore|notifications|messages|profile|more|search|settings)$/i.test(line)) continue;
      communityName = line;
      break;
    }
  }

  return {
    adminUsername: allHandles.length > 0 ? allHandles[0] : null,
    moderatorUsernames: allHandles.slice(1),
    memberCount: memberMatch ? Number(memberMatch[1].replace(/,/g, '')) : null,
    communityName,
  };
}

/**
 * Primary: Use Firecrawl to scrape the about page.
 * Firecrawl handles JS rendering and returns markdown/text.
 */
async function fetchViaFirecrawl(
  communityId: string,
  firecrawlApiKey: string,
): Promise<XCommunityAboutAdminResult | null> {
  const aboutPageUrl = `https://x.com/i/communities/${communityId}/about`;
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlApiKey}`,
      },
      body: JSON.stringify({
        url: aboutPageUrl,
        formats: ['markdown'],
        waitFor: 3000,
        onlyMainContent: false,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.warn(`[Firecrawl] HTTP ${response.status} for community ${communityId}: ${errBody.slice(0, 200)}`);
      return null; // Fall through to Browserless
    }

    const data = await response.json();
    const markdown: string = data?.data?.markdown || '';
    
    if (!markdown || markdown.length < 50) {
      console.warn(`[Firecrawl] Empty/short response for community ${communityId}`);
      return null;
    }

    const parsed = parseAboutPageText(markdown);

    return {
      adminUsername: normalizeHandle(parsed.adminUsername),
      moderatorUsernames: parsed.moderatorUsernames
        .map(h => normalizeHandle(h))
        .filter(Boolean) as string[],
      memberCount: parsed.memberCount,
      communityName: parsed.communityName,
      httpStatus: response.status,
      scrapeProvider: 'firecrawl',
      rawData: {
        source: 'firecrawl_about_page',
        aboutPageUrl,
        textSnippet: markdown.slice(0, 3000),
        adminUsername: parsed.adminUsername,
        moderatorUsernames: parsed.moderatorUsernames,
        memberCount: parsed.memberCount,
        communityName: parsed.communityName,
      },
    };
  } catch (error) {
    console.warn(`[Firecrawl] Exception for community ${communityId}:`, error);
    return null;
  }
}

/**
 * Fallback: Use Browserless (if API key available and has quota).
 */
const BROWSERLESS_FUNCTION_URL = 'https://production-sfo.browserless.io/function';

async function fetchViaBrowserless(
  communityId: string,
  browserlessApiKey: string,
): Promise<XCommunityAboutAdminResult | null> {
  const aboutPageUrl = `https://x.com/i/communities/${communityId}/about`;

  const browserlessScript = `
    export default async ({ page }) => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(${JSON.stringify(aboutPageUrl)}, { waitUntil: 'load', timeout: 60000 });

      let text = '';
      let title = '';

      for (let attempt = 0; attempt < 20; attempt++) {
        title = await page.title();
        text = await page.evaluate(() => document.body.innerText || '');

        const hasChallenge = /just a moment|please wait/i.test(title);
        const hasAboutSignals = /community info|created[\\s\\S]{0,160}?by|rules/i.test(text);

        if (!hasChallenge && hasAboutSignals) break;
        await wait(1500);
      }

      title = await page.title();
      text = await page.evaluate(() => document.body.innerText || '');

      return { pageTitle: title, finalUrl: page.url(), text };
    };
  `;

  try {
    const response = await fetch(`${BROWSERLESS_FUNCTION_URL}?token=${browserlessApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: browserlessScript, context: {} }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      // Check for free tier limit
      if (errorBody.includes('units usage limit') || response.status === 402) {
        console.warn(`[Browserless] Free tier exhausted for community ${communityId}`);
        return null;
      }
      console.warn(`[Browserless] HTTP ${response.status} for community ${communityId}`);
      return null;
    }

    const payload = await response.json();
    const text: string = payload?.text || '';
    
    if (!text || text.length < 50) return null;

    const parsed = parseAboutPageText(text);

    return {
      adminUsername: normalizeHandle(parsed.adminUsername),
      moderatorUsernames: parsed.moderatorUsernames
        .map(h => normalizeHandle(h))
        .filter(Boolean) as string[],
      memberCount: parsed.memberCount,
      communityName: parsed.communityName,
      httpStatus: response.status,
      scrapeProvider: 'browserless',
      rawData: {
        source: 'browserless_about_page',
        aboutPageUrl,
        finalUrl: payload?.finalUrl,
        pageTitle: payload?.pageTitle,
        textSnippet: text.slice(0, 3000),
        adminUsername: parsed.adminUsername,
        moderatorUsernames: parsed.moderatorUsernames,
        memberCount: parsed.memberCount,
        communityName: parsed.communityName,
      },
    };
  } catch (error) {
    console.warn(`[Browserless] Exception for community ${communityId}:`, error);
    return null;
  }
}

/**
 * Main entry point: tries Firecrawl first, falls back to Browserless.
 * Returns result with scrapeProvider indicating which was used.
 */
export async function fetchXCommunityAboutAdmin(
  communityId: string,
  browserlessApiKey: string,
): Promise<XCommunityAboutAdminResult> {
  // Try Firecrawl first (paid, reliable)
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (firecrawlKey) {
    const firecrawlResult = await fetchViaFirecrawl(communityId, firecrawlKey);
    if (firecrawlResult) {
      console.log(`[About] Firecrawl success for ${communityId}: admin=${firecrawlResult.adminUsername}, mods=${firecrawlResult.moderatorUsernames.length}`);
      return firecrawlResult;
    }
    console.log(`[About] Firecrawl returned nothing for ${communityId}, trying Browserless...`);
  }

  // Fallback to Browserless
  if (browserlessApiKey) {
    const browserlessResult = await fetchViaBrowserless(communityId, browserlessApiKey);
    if (browserlessResult) {
      console.log(`[About] Browserless success for ${communityId}: admin=${browserlessResult.adminUsername}, mods=${browserlessResult.moderatorUsernames.length}`);
      return browserlessResult;
    }
  }

  // Both failed
  return {
    adminUsername: null,
    moderatorUsernames: [],
    memberCount: null,
    communityName: null,
    httpStatus: 0,
    error: 'Both Firecrawl and Browserless failed or returned no data',
    scrapeProvider: 'none',
    rawData: {
      source: 'firecrawl_about_page',
      aboutPageUrl: `https://x.com/i/communities/${communityId}/about`,
      textSnippet: '',
      adminUsername: null,
      moderatorUsernames: [],
      memberCount: null,
      communityName: null,
    },
  };
}
