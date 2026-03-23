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

    pairs.push({
      rank,
      pairId,
      url,
      fallbackSymbol,
      fallbackName,
    });
  }

  return pairs.sort((a, b) => a.rank - b.rank);
}

async function scrapePageMarkdown(url: string): Promise<string> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY not configured");
  }

  console.log(`[DexTop200] Scraping ${url} with Firecrawl...`);

  const response = await fetch(FIRECRAWL_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 3000,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || `Firecrawl scrape failed for ${url} (${response.status})`);
  }

  const markdown = data?.data?.markdown || data?.markdown;
  if (!markdown) {
    throw new Error(`No markdown returned for ${url}`);
  }

  return markdown;
}

export async function scrapeDexTopPages(): Promise<RankedDexPair[]> {
  const markdownPages = await Promise.all(DEX_TOP_PAGE_URLS.map(scrapePageMarkdown));
  const pairs = markdownPages.flatMap(parseDexTopPageMarkdown);
  const uniqueByRank = new Map<number, RankedDexPair>();

  for (const pair of pairs) {
    if (!uniqueByRank.has(pair.rank)) {
      uniqueByRank.set(pair.rank, pair);
    }
  }

  const ranked = [...uniqueByRank.values()].sort((a, b) => a.rank - b.rank);
  console.log(`[DexTop200] Parsed ${ranked.length} ranked pairs from DexScreener pages`);

  return ranked;
}