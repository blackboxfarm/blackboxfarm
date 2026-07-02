import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCcw, Copy, Check } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Canonical variable menu — mirrors NormalizedBotFields in
// supabase/functions/_shared/blackbox-parsers/types.ts
// A field is "filled" when ANY reply in a run has a non-null / non-empty value.
// ---------------------------------------------------------------------------
type Fmt = "text" | "money" | "pct" | "bool" | "int" | "url";
type FieldDef = { key: string; label: string; fmt: Fmt };
type Section = { title: string; fields: FieldDef[] };

const FIELD_MENU: Section[] = [
  { title: "Identity", fields: [
    { key: "symbol", label: "Symbol", fmt: "text" },
    { key: "name", label: "Name", fmt: "text" },
    { key: "mint", label: "Mint", fmt: "text" },
  ]},
  { title: "Market", fields: [
    { key: "price_usd", label: "Price (USD)", fmt: "money" },
    { key: "price_sol", label: "Price (SOL)", fmt: "text" },
    { key: "market_cap_usd", label: "Market Cap", fmt: "money" },
    { key: "fdv_usd", label: "FDV", fmt: "money" },
    { key: "liquidity_usd", label: "Liquidity", fmt: "money" },
    { key: "volume_24h_usd", label: "Volume 24h", fmt: "money" },
    { key: "volume_1h_usd", label: "Volume 1h", fmt: "money" },
    { key: "price_change_5m_pct", label: "Change 5m %", fmt: "pct" },
    { key: "price_change_1h_pct", label: "Change 1h %", fmt: "pct" },
    { key: "price_change_24h_pct", label: "Change 24h %", fmt: "pct" },
  ]},
  { title: "Safety & Tax", fields: [
    { key: "buy_tax_pct", label: "Buy Tax %", fmt: "pct" },
    { key: "sell_tax_pct", label: "Sell Tax %", fmt: "pct" },
    { key: "lp_locked_pct", label: "LP Locked %", fmt: "pct" },
    { key: "lp_burned", label: "LP Burned", fmt: "bool" },
    { key: "mint_authority_revoked", label: "Mint Authority Revoked", fmt: "bool" },
    { key: "freeze_authority_revoked", label: "Freeze Authority Revoked", fmt: "bool" },
  ]},
  { title: "Distribution", fields: [
    { key: "holders", label: "Holders", fmt: "int" },
    { key: "top10_holders_pct", label: "Top 10 %", fmt: "pct" },
    { key: "dev_holdings_pct", label: "Dev Holdings %", fmt: "pct" },
    { key: "insiders_pct", label: "Insiders %", fmt: "pct" },
    { key: "snipers_pct", label: "Snipers %", fmt: "pct" },
    { key: "bundlers_pct", label: "Bundlers %", fmt: "pct" },
  ]},
  { title: "Age", fields: [
    { key: "age_text", label: "Age (text)", fmt: "text" },
    { key: "age_minutes", label: "Age (minutes)", fmt: "int" },
  ]},
  { title: "ATH & Freshness", fields: [
    { key: "ath_usd", label: "ATH (USD)", fmt: "money" },
    { key: "ath_drawdown_pct", label: "ATH Drawdown %", fmt: "pct" },
    { key: "ath_age_text", label: "ATH Age (text)", fmt: "text" },
    { key: "fresh_wallets_pct", label: "Fresh Wallets %", fmt: "pct" },
    { key: "dev_sold", label: "Dev Sold", fmt: "bool" },
  ]},
  { title: "Socials / Links", fields: [
    { key: "twitter_url", label: "Twitter URL", fmt: "url" },
    { key: "telegram_url", label: "Telegram URL", fmt: "url" },
    { key: "website_url", label: "Website URL", fmt: "url" },
  ]},
];

const ALL_FIELDS: FieldDef[] = FIELD_MENU.flatMap((s) => s.fields);

function isFilled(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

function fmtValue(v: any, fmt: Fmt): string {
  if (!isFilled(v)) return "—";
  if (fmt === "money" && typeof v === "number") {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    if (v >= 1) return `$${v.toFixed(2)}`;
    return `$${v.toPrecision(3)}`;
  }
  if (fmt === "pct" && typeof v === "number") return `${v}%`;
  if (fmt === "bool") return v ? "Yes" : "No";
  if (fmt === "int" && typeof v === "number") return v.toLocaleString();
  return String(v);
}

// ---------------------------------------------------------------------------
// Types + data hooks
// ---------------------------------------------------------------------------
type Run = {
  id: string;
  token_mint: string;
  posted_at: string | null;
  status: string | null;
  replies_collected: number | null;
};

type Reply = {
  id: string;
  run_id: string;
  bot_username: string | null;
  parser_used: string | null;
  raw_text: string | null;
  parsed_jsonb: Record<string, any> | null;
  received_at: string | null;
  edit_count: number | null;
};

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="inline-flex items-center text-muted-foreground hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
      title="Copy"
    >
      {ok ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 66 ? "bg-emerald-500" : pct >= 33 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="h-1.5 w-full bg-muted rounded overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function NoLube() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [runCoverage, setRunCoverage] = useState<Record<string, number>>({});
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);

  async function loadRuns() {
    setLoadingRuns(true);
    try {
      let q = (supabase as any)
        .from("blackbox_aggregator_runs")
        .select("id, token_mint, posted_at, status, replies_collected")
        .order("posted_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (status !== "all") q = q.eq("status", status);
      if (search.trim()) q = q.ilike("token_mint", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      const list = (data || []) as Run[];
      setRuns(list);
      if (list.length && !selectedId) setSelectedId(list[0].id);

      // Batch coverage: fetch parsed_jsonb for these runs and compute per-run filled %.
      if (list.length) {
        const ids = list.map((r) => r.id);
        const { data: reps } = await (supabase as any)
          .from("blackbox_bot_replies")
          .select("run_id, parsed_jsonb")
          .in("run_id", ids);
        const cov: Record<string, number> = {};
        for (const id of ids) cov[id] = 0;
        const merged: Record<string, Record<string, any>> = {};
        for (const r of (reps || []) as any[]) {
          merged[r.run_id] = merged[r.run_id] || {};
          const p = r.parsed_jsonb || {};
          for (const f of ALL_FIELDS) {
            if (!isFilled(merged[r.run_id][f.key]) && isFilled(p[f.key])) {
              merged[r.run_id][f.key] = p[f.key];
            }
          }
        }
        for (const id of ids) {
          const m = merged[id] || {};
          const filled = ALL_FIELDS.filter((f) => isFilled(m[f.key])).length;
          cov[id] = Math.round((filled / ALL_FIELDS.length) * 100);
        }
        setRunCoverage(cov);
      } else {
        setRunCoverage({});
      }
    } catch (e: any) {
      toast.error(`Failed to load runs: ${e.message}`);
    } finally {
      setLoadingRuns(false);
    }
  }

  async function loadReplies(runId: string) {
    setLoadingReplies(true);
    try {
      const { data, error } = await (supabase as any)
        .from("blackbox_bot_replies")
        .select("*")
        .eq("run_id", runId)
        .order("received_at", { ascending: true });
      if (error) throw error;
      setReplies((data || []) as Reply[]);
    } catch (e: any) {
      toast.error(`Failed to load replies: ${e.message}`);
    } finally {
      setLoadingReplies(false);
    }
  }

  useEffect(() => { void loadRuns(); /* eslint-disable-next-line */ }, [page, status]);
  useEffect(() => { if (selectedId) void loadReplies(selectedId); }, [selectedId]);

  const selectedRun = runs.find((r) => r.id === selectedId) || null;

  // Merge per-field values across replies for the selected run.
  const merged = useMemo(() => {
    const out: Record<string, Array<{ bot: string; value: any }>> = {};
    for (const rep of replies) {
      const p = rep.parsed_jsonb || {};
      for (const f of ALL_FIELDS) {
        if (isFilled(p[f.key])) {
          (out[f.key] = out[f.key] || []).push({ bot: rep.bot_username || rep.parser_used || "?", value: p[f.key] });
        }
      }
    }
    return out;
  }, [replies]);

  const filledCount = ALL_FIELDS.filter((f) => merged[f.key]?.length).length;
  const coveragePct = Math.round((filledCount / ALL_FIELDS.length) * 100);

  // Collect extras across all replies
  const extras = useMemo(() => {
    const out: Record<string, Array<{ bot: string; value: any }>> = {};
    for (const rep of replies) {
      const ex = (rep.parsed_jsonb as any)?.extras;
      if (ex && typeof ex === "object") {
        for (const [k, v] of Object.entries(ex)) {
          (out[k] = out[k] || []).push({ bot: rep.bot_username || rep.parser_used || "?", value: v });
        }
      }
    }
    return out;
  }, [replies]);

  const symbol =
    replies.find((r) => (r.parsed_jsonb as any)?.symbol)?.parsed_jsonb?.symbol || null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">/nolube — Bot Scrape Variable Coverage</h1>
          <p className="text-sm text-muted-foreground">
            After a CA is posted in the BlackBox.Farm group and the reply bots respond, this shows
            the full menu of variables we know how to extract and — per token, per run — which were
            captured and which were blank.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[420px,1fr] gap-4">
          {/* Runs list */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Runs</CardTitle>
                <Button size="sm" variant="outline" onClick={loadRuns} disabled={loadingRuns}>
                  {loadingRuns ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="Search mint..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (setPage(0), loadRuns())}
                />
                <select
                  value={status}
                  onChange={(e) => { setStatus(e.target.value); setPage(0); }}
                  className="h-9 rounded-md bg-background border border-input px-2 text-sm"
                >
                  <option value="all">all</option>
                  <option value="pending">pending</option>
                  <option value="complete">complete</option>
                  <option value="timeout">timeout</option>
                  <option value="error">error</option>
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[70vh]">
                <div className="divide-y">
                  {runs.map((r) => {
                    const cov = runCoverage[r.id] ?? 0;
                    const active = r.id === selectedId;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className={`w-full text-left px-3 py-2 hover:bg-muted/50 ${active ? "bg-muted" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-mono text-xs truncate">{r.token_mint}</div>
                          <Badge variant="outline" className="text-[10px]">{r.status || "—"}</Badge>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                          <span>{r.posted_at ? new Date(r.posted_at).toLocaleString() : "—"}</span>
                          <span>{r.replies_collected ?? 0} replies · {cov}%</span>
                        </div>
                        <div className="mt-1"><CoverageBar pct={cov} /></div>
                      </button>
                    );
                  })}
                  {!loadingRuns && runs.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground">No runs.</div>
                  )}
                </div>
              </ScrollArea>
              <div className="flex items-center justify-between p-2 border-t">
                <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
                <span className="text-xs text-muted-foreground">Page {page + 1}</span>
                <Button size="sm" variant="ghost" disabled={runs.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </CardContent>
          </Card>

          {/* Run detail */}
          <Card>
            <CardHeader className="pb-2">
              {selectedRun ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">
                      {symbol ? `$${symbol}` : "Unknown"}
                    </CardTitle>
                    <span className="font-mono text-xs text-muted-foreground truncate max-w-[380px]">
                      {selectedRun.token_mint}
                    </span>
                    <CopyBtn text={selectedRun.token_mint} />
                    <Badge variant="outline">{selectedRun.status || "—"}</Badge>
                    <Badge>{selectedRun.replies_collected ?? 0} replies</Badge>
                    <Badge variant="secondary">{coveragePct}% coverage ({filledCount}/{ALL_FIELDS.length})</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Posted {selectedRun.posted_at ? new Date(selectedRun.posted_at).toLocaleString() : "—"}
                  </div>
                  <div className="mt-1"><CoverageBar pct={coveragePct} /></div>
                </div>
              ) : (
                <CardTitle className="text-base">Select a run</CardTitle>
              )}
            </CardHeader>
            <CardContent>
              {loadingReplies ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : !selectedRun ? (
                <p className="text-sm text-muted-foreground">Pick a run from the list.</p>
              ) : (
                <div className="space-y-6">
                  {/* Variable menu */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {FIELD_MENU.map((section) => (
                      <div key={section.title} className="border rounded-md">
                        <div className="px-3 py-2 border-b bg-muted/40 text-sm font-semibold">
                          {section.title}
                        </div>
                        <ul className="divide-y">
                          {section.fields.map((f) => {
                            const hits = merged[f.key] || [];
                            const filled = hits.length > 0;
                            // Distinct values (for divergence badges)
                            const distinct = Array.from(new Set(hits.map((h) => JSON.stringify(h.value))));
                            return (
                              <li key={f.key} className="px-3 py-2 text-sm flex items-start gap-2">
                                <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${filled ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <code className="text-xs bg-muted px-1 rounded">{`{${f.key}}`}</code>
                                    <span className="text-xs text-muted-foreground">{f.label}</span>
                                    {distinct.length > 1 && (
                                      <Badge variant="destructive" className="text-[10px]">diverges</Badge>
                                    )}
                                  </div>
                                  {filled ? (
                                    <div className="mt-1 space-y-0.5">
                                      {hits.map((h, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs">
                                          <span className="font-mono">{fmtValue(h.value, f.fmt)}</span>
                                          <Badge variant="outline" className="text-[10px]">{h.bot}</Badge>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="mt-0.5 text-xs text-muted-foreground italic">— not captured</div>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>

                  {/* Extras */}
                  {Object.keys(extras).length > 0 && (
                    <div className="border rounded-md">
                      <div className="px-3 py-2 border-b bg-muted/40 text-sm font-semibold">
                        Extras (unmapped fields seen by parser)
                      </div>
                      <ul className="divide-y">
                        {Object.entries(extras).map(([k, arr]) => (
                          <li key={k} className="px-3 py-2 text-xs">
                            <code className="bg-muted px-1 rounded">{k}</code>
                            <div className="mt-1 space-y-0.5">
                              {arr.map((h, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span className="font-mono">{String(h.value)}</span>
                                  <Badge variant="outline" className="text-[10px]">{h.bot}</Badge>
                                </div>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Raw per-bot replies */}
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">Raw bot replies ({replies.length})</div>
                    {replies.map((rep) => (
                      <details key={rep.id} className="border rounded-md">
                        <summary className="px-3 py-2 cursor-pointer text-sm flex items-center gap-2 flex-wrap">
                          <Badge>{rep.bot_username || "?"}</Badge>
                          <Badge variant="outline">{rep.parser_used || "?"}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {rep.received_at ? new Date(rep.received_at).toLocaleString() : "—"}
                          </span>
                          {(rep.edit_count ?? 0) > 0 && (
                            <Badge variant="secondary" className="text-[10px]">edits: {rep.edit_count}</Badge>
                          )}
                        </summary>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 border-t">
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-1">raw_text</div>
                            <pre className="whitespace-pre-wrap text-xs bg-muted p-2 rounded max-h-[300px] overflow-auto">{rep.raw_text || ""}</pre>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground mb-1">parsed_jsonb</div>
                            <pre className="whitespace-pre-wrap text-xs bg-muted p-2 rounded max-h-[300px] overflow-auto">{JSON.stringify(rep.parsed_jsonb, null, 2)}</pre>
                          </div>
                        </div>
                      </details>
                    ))}
                    {replies.length === 0 && (
                      <p className="text-sm text-muted-foreground">No replies stored for this run.</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}