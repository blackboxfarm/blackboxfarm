import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { Badge } from '@/components/ui/badge';
import { Skull, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { AUTOPSIES } from '@/data/autopsies';

export default function Autopsies() {
  useEffect(() => {
    document.title = 'Token Autopsies | BlackBox Farm — Forensic Rug Post-Mortems';
    const meta = document.querySelector('meta[name="description"]');
    const desc = 'On-chain forensic post-mortems of coordinated Solana rugs and exit-liquidity events. Reverse-engineered wallet flows, PnL reconstructions, and blacklist intel.';
    if (meta) meta.setAttribute('content', desc);
  }, []);

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
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {AUTOPSIES.map((a) => (
            <Link
              key={a.slug}
              to={`/autopsy/${a.slug}`}
              className="group block rounded-xl border border-border bg-card hover:border-destructive/50 transition-all duration-300 overflow-hidden hover:shadow-lg hover:shadow-destructive/10 p-5"
            >
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