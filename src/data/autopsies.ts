export interface AutopsyEntry {
  slug: string;
  title: string;
  subtitle: string;
  mintAddress: string;
  ticker: string;
  verdict: string;
  riskScore: string;
  publishedAt: string; // ISO
  mdPath: string;      // public path
  downloadName: string;
  tags: string[];
  /** Autopsy-treated hero/OG image (1500x500-ish banner) — see docs/autopsy-image-protocol.md */
  heroImage: string;
  /** Original source banner the autopsy treatment was applied to (for provenance/regeneration) */
  sourceBanner?: string;
  /** Harm Score 0-100 (backward-looking damage to holders). Replaces Risk on dead tokens. */
  harmScore?: number | null;
  harmHeadline?: string | null;
  harmBreakdown?: any | null;
}

export const AUTOPSIES: AutopsyEntry[] = [
  {
    slug: 'gpt-greedy-pissing-testicle',
    title: 'GPT — "Greedy Pissing Testicle"',
    subtitle: 'Textbook coordinated rug: atomic launch-snipe, 100% bonding-curve capture, 6-second dump cascade.',
    mintAddress: '7GAFVwLZeuop8omK16jNELtXVsjqJ8eSDy1FSSanpump',
    ticker: 'GPT',
    verdict: 'COORDINATED RUG',
    riskScore: '10/10',
    publishedAt: '2026-04-29T15:00:00Z',
    mdPath: '/autopsies/gpt-greedy-pissing-testicle.md',
    downloadName: 'GPT_Autopsy_BlackBoxFarm.md',
    tags: ['rug', 'pump.fun', 'atomic-snipe', 'coordinated-exit'],
    heroImage: '/autopsies/gpt-greedy-pissing-testicle-autopsy-v2.jpg',
    sourceBanner: 'https://cdn.dexscreener.com/cms/images/5CFdN3bFcGLttRHB?width=1500&height=500&quality=95&format=auto',
    harmScore: 92,
    harmHeadline: 'Coordinated rug · 100% bonding-curve capture · 6-second dump',
    harmBreakdown: {
      drawdown_pct: 100,
      death_hours: 0.1,
      intent: 'rug_pull',
      multiplier: 1.5,
      components: { loss: 32, bag: 14, draw: 15, dev: 13, speed: 10 },
    },
  },
];

export function getAutopsy(slug: string): AutopsyEntry | undefined {
  return AUTOPSIES.find((a) => a.slug === slug);
}