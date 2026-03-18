const BROWSERLESS_FUNCTION_URL = 'https://production-sfo.browserless.io/function';
const ABOUT_PAGE_WAIT_MS = 1500;
const ABOUT_PAGE_MAX_POLLS = 20;

export interface XCommunityAboutAdminResult {
  adminUsername: string | null;
  moderatorUsernames: string[];
  memberCount: number | null;
  httpStatus: number;
  error?: string;
  rawData: {
    source: 'browserless_about_page';
    aboutPageUrl: string;
    finalUrl?: string;
    pageTitle?: string;
    textSnippet: string;
    adminUsername: string | null;
    moderatorUsernames: string[];
    memberCount: number | null;
  };
}

function normalizeHandle(handle: string | null | undefined): string | null {
  const normalized = handle?.trim().replace(/^@/, '').toLowerCase();
  return normalized || null;
}

export async function fetchXCommunityAboutAdmin(
  communityId: string,
  browserlessApiKey: string,
): Promise<XCommunityAboutAdminResult> {
  const aboutPageUrl = `https://x.com/i/communities/${communityId}/about`;

  const browserlessScript = `
    export default async ({ page }) => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(${JSON.stringify(aboutPageUrl)}, { waitUntil: 'load', timeout: 60000 });

      let text = '';
      let title = '';

      for (let attempt = 0; attempt < ${ABOUT_PAGE_MAX_POLLS}; attempt++) {
        title = await page.title();
        text = await page.evaluate(() => document.body.innerText || '');

        const hasChallenge = /just a moment|please wait/i.test(title);
        const hasAboutSignals = /community info|created[\\s\\S]{0,160}?by|rules/i.test(text);

        if (!hasChallenge && hasAboutSignals) break;
        await wait(${ABOUT_PAGE_WAIT_MS});
      }

      title = await page.title();
      text = await page.evaluate(() => document.body.innerText || '');

      // Extract all handles from the Moderators section
      // The about page lists moderators — first one is the Admin (creator)
      const allHandles = [];
      const moderatorSection = text.match(/Moderators[\\s\\S]{0,2000}/i);
      if (moderatorSection) {
        const handleMatches = moderatorSection[0].matchAll(/@([A-Za-z0-9_]{1,15})/g);
        for (const m of handleMatches) {
          allHandles.push(m[1].toLowerCase());
        }
      }

      // Fallback: try "Created by @handle" pattern
      if (allHandles.length === 0) {
        const createdMatch = text.match(/Created[\\s\\S]{0,160}?by\\s+@?([A-Za-z0-9_]{1,15})/i);
        if (createdMatch) allHandles.push(createdMatch[1].toLowerCase());
      }

      const memberMatch = text.match(/([\\d,]+)\\s+Members?\\b/i);

      // First handle = admin, rest = moderators
      const adminUsername = allHandles.length > 0 ? allHandles[0] : null;
      const moderatorUsernames = allHandles.slice(1);

      return {
        pageTitle: title,
        finalUrl: page.url(),
        textSnippet: text.slice(0, 3000),
        adminUsername,
        moderatorUsernames,
        memberCount: memberMatch ? Number(memberMatch[1].replace(/,/g, '')) : null,
      };
    };
  `;

  try {
    const response = await fetch(`${BROWSERLESS_FUNCTION_URL}?token=${browserlessApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: browserlessScript,
        context: {},
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      return {
        adminUsername: null,
        memberCount: null,
        httpStatus: response.status,
        error: errorBody.slice(0, 300),
        rawData: {
          source: 'browserless_about_page',
          aboutPageUrl,
          textSnippet: '',
          adminUsername: null,
          memberCount: null,
        },
      };
    }

    const payload = await response.json();
    const adminUsername = normalizeHandle(payload?.adminUsername);
    const memberCount = typeof payload?.memberCount === 'number' ? payload.memberCount : null;
    const textSnippet = typeof payload?.textSnippet === 'string' ? payload.textSnippet.slice(0, 3000) : '';

    return {
      adminUsername,
      memberCount,
      httpStatus: response.status,
      rawData: {
        source: 'browserless_about_page',
        aboutPageUrl,
        finalUrl: typeof payload?.finalUrl === 'string' ? payload.finalUrl : aboutPageUrl,
        pageTitle: typeof payload?.pageTitle === 'string' ? payload.pageTitle : undefined,
        textSnippet,
        adminUsername,
        memberCount,
      },
    };
  } catch (error) {
    return {
      adminUsername: null,
      memberCount: null,
      httpStatus: 0,
      error: error instanceof Error ? error.message : String(error),
      rawData: {
        source: 'browserless_about_page',
        aboutPageUrl,
        textSnippet: '',
        adminUsername: null,
        memberCount: null,
      },
    };
  }
}
