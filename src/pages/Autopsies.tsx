import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { Badge } from '@/components/ui/badge';
import { Skull, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { AUTOPSIES, type AutopsyEntry } from '@/data/autopsies';
import { supabase } from '@/integrations/supabase/client';

export default function Autopsies() {
  const [dbAutopsies, setDbAutopsies] = useState<AutopsyEntry[]>([]);

  useEffect(() => {
    document.title = 'Token Autopsies | BlackBox Farm — Forensic Rug Post-Mortems';
    const meta = document.querySelector('meta[name="description"]');
    const desc = 'On-chain forensic post-mortems of coordinated Solana rugs and exit-liquidity events. Reverse-engineered wallet flows, PnL reconstructions, and blacklist intel.';
    if (meta) meta.setAttribute('content', desc);
  }, []);

  useEffect(() => {
    // Merge DB-published autopsies with the curated static list.
    // Static entries (e.g. GPT) win on slug collision so curated copy is preserved.
    supabase
      .from('autopsy_reports')
      .select('slug, title, subtitle, ticker, token_mint, verdict, risk_score, hero_image_path, source_banner_url, tags, published_at')
      .eq('is_current', true)
      .order('published_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (!data) return;
        const staticSlugs = new Set(AUTOPSIES.map(a => a.slug));
        const mapped: AutopsyEntry[] = data
          .filter(r => !staticSlugs.has(r.slug))
          .map(r => ({
            slug: r.slug,
            title: r.title,
            subtitle: r.subtitle ?? '',
            mintAddress: r.token_mint,
            ticker: r.ticker ?? '',
            verdict: r.verdict ?? 'AUTOPSY',
            riskScore: r.risk_score ?? '—',
            publishedAt: r.published_at,
            mdPath: `/autopsies/${r.slug}.md`,
            downloadName: `${r.ticker ?? 'token'}_Autopsy_BlackBoxFarm.md`,
            tags: (r.tags ?? []) as string[],
            heroImage: r.hero_image_path ?? '',
            sourceBanner: r.source_banner_url ?? undefined,
          }));
        setDbAutopsies(mapped);
      });
  }, []);

  const all = [...AUTOPSIES, ...dbAutopsies].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-10 md:py-14 max-w-6xl">
        <header className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/30 mb-4">
            <Skull className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Token Autopsies
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm md:text-base">
            Forensic post-mortems on coordinated rugs and exit-liquidity events.
            Every wallet, every transaction, every dollar — reconstructed from the Solana ledger.
          </p>
          <div className="mt-6 max-w-3xl mx-auto rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-left">
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-destructive/15 text-destructive border-destructive/30 mt-0.5 shrink-0">
                New
              </Badge>
              <p className="text-xs md:text-sm text-foreground/80 leading-relaxed">
                <span className="font-semibold text-foreground">Brand-new public postings of our post-mortem reviews of fast & slow coin deaths.</span>{' '}
                We have <span className="font-semibold text-destructive">thousands</span> queued to publish — every autopsy builds our back-end ledger
                of good and bad devs, their socials, their KYC trails, and their dev wallets, so we all know a little something{' '}
                <span className="italic">before we commit to an ape</span>.
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {all.map((a) => (
            <Link
              key={a.slug}
              to={`/autopsy/${a.slug}`}
              className="group block rounded-xl border border-border bg-card hover:border-destructive/50 transition-all duration-300 overflow-hidden hover:shadow-lg hover:shadow-destructive/10"
            >
              {a.heroImage && (
                <div className="aspect-[3/1] w-full overflow-hidden bg-black border-b border-border">
                  <img
                    src={a.heroImage}
                    alt={`${a.title} autopsy banner`}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                  />
                </div>
              )}
              <div className="p-5">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-destructive/15 text-destructive border-destructive/30">
                  {a.verdict}
                </Badge>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  Risk {a.riskScore}
                </Badge>
              </div>
              <h2 className="font-semibold text-lg leading-tight group-hover:text-destructive transition-colors mb-2 line-clamp-2">
                {a.title}
              </h2>
              <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{a.subtitle}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground/80 pt-3 border-t border-border/60">
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(a.publishedAt), 'MMM d, yyyy')}</span>
                <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{a.ticker}</span>
              </div>
              </div>
            </Link>
          ))}
        </div>

        <p className="text-xs text-muted-foreground/60 text-center mt-12 max-w-2xl mx-auto">
          More autopsies will be added as the HoldersIntel forensic pipeline flags new coordinated exit events.
          Suspect a rug? Email <a href="mailto:research@blackbox.farm" className="underline hover:text-foreground">research@blackbox.farm</a>.
        </p>
      </div>
    </SiteLayout>
  );
}