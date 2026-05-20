import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Brain } from "lucide-react";

interface Summary {
  headline: string;
  body: string;
  highlights: string[];
  narrative_tie_in?: string;
  risk_note: string;
  disclaimer: string;
}

export function OptimisticAISummary({ tokenMint }: { tokenMint: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCto, setIsCto] = useState(false);

  useEffect(() => {
    if (!tokenMint) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: ctoRow }, { data: fnData }] = await Promise.all([
        supabase.from("token_cto_status").select("is_cto").eq("token_mint", tokenMint).maybeSingle(),
        supabase.functions.invoke("token-optimistic-summary", { body: { tokenMint } }),
      ]);
      if (cancelled) return;
      setIsCto(!!ctoRow?.is_cto);
      if (fnData?.summary) setSummary(fnData.summary as Summary);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tokenMint]);

  if (loading) {
    return (
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Brain className="h-4 w-4 animate-pulse" />
          <span>Generating opportunity analysis…</span>
        </div>
      </div>
    );
  }
  if (!summary) return null;

  return (
    <div className={`relative rounded-lg border p-5 overflow-hidden ${isCto ? "border-amber-400/40 bg-gradient-to-br from-amber-500/10 via-card to-yellow-500/5" : "border-primary/20 bg-primary/5"}`}>
      {isCto && <FireworksLayer />}
      <div className="relative z-10 space-y-3">
        <div className="flex items-center gap-2">
          {isCto ? <Sparkles className="h-5 w-5 text-amber-300" /> : <Brain className="h-5 w-5 text-primary" />}
          <h3 className="text-base font-bold tracking-tight">{summary.headline}</h3>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{summary.body}</p>
        {summary.highlights?.length > 0 && (
          <ul className="space-y-1">
            {summary.highlights.map((h, i) => (
              <li key={i} className="text-xs text-foreground/80 flex gap-2">
                <span className="text-amber-400">★</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        )}
        {summary.narrative_tie_in && (
          <p className="text-xs italic text-foreground/70 border-l-2 border-amber-400/50 pl-3">{summary.narrative_tie_in}</p>
        )}
        <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground space-y-1">
          <div>⚠ {summary.risk_note}</div>
          <div className="font-medium">{summary.disclaimer}</div>
        </div>
      </div>
    </div>
  );
}

function FireworksLayer() {
  const stars = Array.from({ length: 14 });
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none">
      {stars.map((_, i) => {
        const left = (i * 37) % 100;
        const top = (i * 53) % 100;
        const delay = (i % 7) * 0.4;
        const size = 6 + (i % 4) * 3;
        return (
          <span
            key={i}
            className="absolute text-amber-300 animate-ping"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              fontSize: `${size}px`,
              animationDelay: `${delay}s`,
              animationDuration: `${2 + (i % 3)}s`,
              opacity: 0.55,
            }}
          >
            ✦
          </span>
        );
      })}
    </div>
  );
}