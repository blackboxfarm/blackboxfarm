import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import { DEATH_TAXONOMY_CLIENT, type DeathCauseClient, type DeathIntent } from "@/data/autopsyTaxonomy";

const TIER_COLORS: Record<string, string> = {
  A: "bg-destructive/15 text-destructive border-destructive/30",
  B: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  C: "bg-muted text-muted-foreground border-border",
};

const INTENT_GROUPS: { intent: DeathIntent; title: string; blurb: string }[] = [
  { intent: "malicious", title: "Malicious", blurb: "Pre-meditated extraction. Tier-A is auto-publish; Tier-B awaits review." },
  { intent: "negligent", title: "Negligent", blurb: "Not pre-meditated, but holders were left in the dark or abandoned." },
  { intent: "organic", title: "Organic", blurb: "No foul play. Attention faded, dev didn't bail with malice." },
  { intent: "neutral", title: "Unclassified", blurb: "Insufficient signal to assign a cause." },
];

function CauseCard({ cause }: { cause: DeathCauseClient }) {
  return (
    <div className="border border-border rounded-md p-4 bg-card/50">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={TIER_COLORS[cause.tier]}>{cause.tier}</Badge>
          <h4 className="font-semibold">{cause.label}</h4>
          <code className="text-[10px] text-muted-foreground">{cause.id}</code>
        </div>
        {cause.autoPublishMinConfidence < 999 && (
          <span className="text-[10px] text-muted-foreground">
            auto-publish ≥ {cause.autoPublishMinConfidence} conf
          </span>
        )}
      </div>
      <p className="text-sm text-foreground/90 mb-2">{cause.summary}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mb-3">{cause.description}</p>
      {cause.signals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cause.signals.map((s) => (
            <code key={s} className="text-[10px] bg-muted/50 border border-border rounded px-1.5 py-0.5 font-mono">
              {s}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DeathTaxonomyModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Info className="h-3 w-3 mr-1" /> Death Causes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Death-Cause Taxonomy</DialogTitle>
          <DialogDescription>
            Every Lamb (pump.fun token that died at ≥75% bonding curve) is classified into one of these causes.
            Auto-publish is currently DISABLED on every tier — every report goes through manual approval until we've reviewed quality.
            Tokens below 75% curve ATH or with NULL curve data are ignored entirely (not logged, not surfaced).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 mt-2">
          <section className="border border-amber-500/30 bg-amber-500/5 rounded-md p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-amber-500 mb-2">Bad-Dev vs Sad-Dev</h3>
            <p className="text-sm text-foreground/90 mb-2">
              A creator running 20 linked wallets, dripping sells into every fresh buy, letting the token bleed from 80%
              back down to 70% and walking away — that's <strong className="text-destructive">NOT</strong> a sad dev.
              That's <code className="text-xs">curve_wallet_washer</code> (Tier-A, malicious).
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Bad Dev signals:</strong> creator wallet linked to ≥3 prior dead tokens
              AND token shows linked_wallet_count &gt; 5 OR bundled_buy_count &gt; 0. Sustained dev_holding_pct while
              price collapses is a tell — they're hiding behind cluster wallets.
              <br />
              <strong className="text-foreground">Sad Dev (ignored):</strong> creator's prior tokens just organically faded
              with no wash patterns and no linked-wallet sells. We don't autopsy these — boring failures aren't worth
              warning about. We only autopsy <em>warnings</em>.
            </p>
          </section>
          {INTENT_GROUPS.map((g) => {
            const causes = DEATH_TAXONOMY_CLIENT.filter((c) => c.intent === g.intent);
            if (!causes.length) return null;
            return (
              <section key={g.intent}>
                <header className="mb-2">
                  <h3 className="text-base font-bold uppercase tracking-wide">{g.title}</h3>
                  <p className="text-xs text-muted-foreground">{g.blurb}</p>
                </header>
                <div className="space-y-3">
                  {causes.map((c) => <CauseCard key={c.id} cause={c} />)}
                </div>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}