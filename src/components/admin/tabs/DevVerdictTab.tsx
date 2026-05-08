import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";

interface Scorecard {
  token_mint: string;
  composite_score: number;
  effort_score: number;
  skill_score: number;
  integrity_score: number;
  sustain_score: number;
  social_score: number;
  verdict: string;
  verdict_confidence: number;
  worth_gate_passed: boolean;
  scored_at: string;
  factor_scores: Record<string, any>;
  solscan_evidence_refs: any[];
  token?: { name: string; symbol: string; ath_24h_usd: number | null; image_url: string | null; current_status: string | null };
}

interface Verdict {
  wallet_address?: string;
  dev_reputation: any | null;
  scorecards: Scorecard[];
  token_mint?: string;
}

const verdictColor: Record<string, string> = {
  expert: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  competent: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  inexperienced: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  sloppy: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  scammy: "bg-red-500/20 text-red-300 border-red-500/40",
  shark: "bg-red-600/20 text-red-300 border-red-600/40",
  tourist: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
  rugger: "bg-red-700/30 text-red-300 border-red-700/40",
  builder: "bg-emerald-600/20 text-emerald-300 border-emerald-600/40",
  grinder: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  sniper: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40",
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(-100, Math.min(100, value || 0));
  const positive = v >= 0;
  const width = Math.abs(v);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={positive ? "text-emerald-400" : "text-red-400"}>{v}</span>
      </div>
      <div className="relative h-2 bg-muted rounded overflow-hidden">
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-foreground/30" />
        <div
          className={`absolute top-0 bottom-0 ${positive ? "left-1/2 bg-emerald-500" : "right-1/2 bg-red-500"}`}
          style={{ width: `${width / 2}%` }}
        />
      </div>
    </div>
  );
}

export default function DevVerdictTab() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Verdict | null>(null);
  const [building, setBuilding] = useState(false);

  async function lookup() {
    setError(null);
    setData(null);
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const isWallet = q.length >= 32 && q.length <= 50 && !q.startsWith("pump");
      const body = isWallet ? { wallet_address: q } : { token_mint: q };
      const { data: resp, error: invErr } = await supabase.functions.invoke("dev-verdict-resolver", { body });
      if (invErr) throw invErr;
      // Heuristic — if both are valid addresses, try wallet first then token
      setData(resp as Verdict);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function rebuildToken(mint: string) {
    setBuilding(true);
    try {
      await supabase.functions.invoke("lifecycle-scorecard-builder", { body: { token_mint: mint } });
      await lookup();
    } finally {
      setBuilding(false);
    }
  }

  const rep = data?.dev_reputation;

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🔬 Dev Verdict Resolver</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Paste a token CA or dev wallet address"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
            />
            <Button onClick={lookup} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Lookup
            </Button>
          </div>
          {error && <div className="text-sm text-red-400 mt-2">{error}</div>}
        </CardContent>
      </Card>

      {rep && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Dev <code className="text-xs bg-muted px-2 py-1 rounded">{rep.wallet_address}</code>
              {rep.archetype && (
                <Badge className={verdictColor[rep.archetype] ?? ""}>{rep.archetype}</Badge>
              )}
              <span className="ml-auto text-2xl font-mono">{rep.composite ?? "—"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <ScoreBar label="Effort" value={rep.weighted_effort ?? 0} />
              <ScoreBar label="Skill" value={rep.weighted_skill ?? 0} />
              <ScoreBar label="Integrity" value={rep.weighted_integrity ?? 0} />
              <ScoreBar label="Sustain" value={rep.weighted_sustain ?? 0} />
              <ScoreBar label="Social" value={rep.weighted_social ?? 0} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>Tokens scored: {rep.tokens_scored}</span>
              <span>•</span>
              <span>Peak mcap: ${Number(rep.peak_mcap_lifetime ?? 0).toLocaleString()}</span>
              <span>•</span>
              <span>Boosts: ${Number(rep.total_boosts_usd ?? 0).toLocaleString()}</span>
            </div>
            {rep.distribution && (
              <div className="mt-3 flex flex-wrap gap-1">
                {Object.entries(rep.distribution).map(([k, v]: any) => (
                  <Badge key={k} variant="outline" className={verdictColor[k] ?? ""}>{k}: {v as number}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {data?.scorecards && data.scorecards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-Token Scorecards ({data.scorecards.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.scorecards.map((c) => (
              <div key={c.token_mint} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-3">
                  {c.token?.image_url && (
                    <img src={c.token.image_url} alt="" className="w-8 h-8 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{c.token?.name ?? c.token_mint.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.token_mint}</div>
                  </div>
                  <Badge className={verdictColor[c.verdict] ?? ""}>{c.verdict}</Badge>
                  <span className="text-xl font-mono">{c.composite_score}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <ScoreBar label="Effort" value={c.effort_score} />
                  <ScoreBar label="Skill" value={c.skill_score} />
                  <ScoreBar label="Integrity" value={c.integrity_score} />
                  <ScoreBar label="Sustain" value={c.sustain_score} />
                  <ScoreBar label="Social" value={c.social_score} />
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Scored {new Date(c.scored_at).toLocaleString()} • confidence {c.verdict_confidence}</span>
                  <Button size="sm" variant="ghost" disabled={building}
                    onClick={() => rebuildToken(c.token_mint)}>
                    {building ? <Loader2 className="w-3 h-3 animate-spin" /> : "Re-score"}
                  </Button>
                </div>
                {c.solscan_evidence_refs?.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      Evidence ({c.solscan_evidence_refs.length})
                    </summary>
                    <pre className="mt-1 bg-muted p-2 rounded overflow-x-auto">
                      {JSON.stringify(c.solscan_evidence_refs, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data && data.scorecards.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No scorecards yet for this wallet/token.{" "}
            {data.token_mint && (
              <Button size="sm" onClick={() => rebuildToken(data.token_mint!)} disabled={building}>
                Build now
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}