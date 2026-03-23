import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Trophy, TrendingUp, TrendingDown, Search, ExternalLink, Copy, Check,
  RefreshCw, Edit2, Save, X, AlertTriangle, Crown, Shield,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── helpers ──────────────────────────────────────────────────
function truncate(s: string | null, n = 16) {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function MintCell({ mint }: { mint: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="flex items-center gap-1 font-mono text-xs">
      {mint.slice(0, 6)}…{mint.slice(-4)}
      <button onClick={copy} className="text-muted-foreground hover:text-foreground">
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}

/** Composite quality score 0-100 used for ranking */
function qualityScore(r: any): number {
  let score = 0;
  // ATH value (log scale, max 25)
  if (r.ath_24h_usd && r.ath_24h_usd > 0) {
    const log = Math.log10(r.ath_24h_usd * 1e6); // shift so small prices still score
    score += Math.min(25, Math.max(0, log * 4));
  }
  // Dev reputation (max 20)
  if (r.dev_reputation_score != null) score += Math.min(20, (r.dev_reputation_score / 100) * 20);
  // Graduated +15
  if (r.is_graduated) score += 15;
  // Legitimate builder +10
  if (r.dev_is_legitimate_builder) score += 10;
  // Not rugged +10 / rugged -15
  if (r.dev_tokens_rugged != null && r.dev_tokens_rugged > 0) score -= 15;
  else score += 10;
  // Not blacklisted +5
  if (!r.dev_auto_blacklisted) score += 5;
  // Was posted +5
  if (r.was_posted) score += 5;
  // KYC verified +5
  if (r.kyc_verified) score += 5;
  // Successful tokens bonus (max 5)
  if (r.dev_tokens_successful != null) score += Math.min(5, r.dev_tokens_successful * 1.5);
  return Math.round(Math.max(0, Math.min(100, score)));
}

function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 70 ? "default" : score >= 45 ? "secondary" : "destructive";
  return <Badge variant={variant} className="text-[10px] font-mono">{score}</Badge>;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 10) return <span className="text-amber-400 font-bold">🏆 {rank}</span>;
  if (rank <= 50) return <span className="text-yellow-500 font-semibold">{rank}</span>;
  if (rank <= 200) return <span className="text-foreground font-medium">{rank}</span>;
  return <span className="text-muted-foreground">{rank}</span>;
}

// ── edit dialog ──────────────────────────────────────────────
interface EditState {
  token_mint: string;
  symbol: string;
  community_mod_handles: string;
  community_admin_handles: string;
  ath_24h_usd: string;
  is_rug: boolean;
}

function EditTokenDialog({
  open, onClose, initial, onSave, saving,
}: {
  open: boolean;
  onClose: () => void;
  initial: EditState | null;
  onSave: (s: EditState) => void;
  saving: boolean;
}) {
  const [state, setState] = useState<EditState | null>(null);
  React.useEffect(() => { if (initial) setState({ ...initial }); }, [initial]);
  if (!state) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-4 w-4" /> Edit {state.symbol || "Token"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Community Mod Handles (comma-separated @handles)</Label>
            <Textarea
              value={state.community_mod_handles}
              onChange={(e) => setState({ ...state, community_mod_handles: e.target.value })}
              placeholder="@mod1, @mod2, @mod3"
              className="text-sm h-16"
            />
          </div>
          <div>
            <Label className="text-xs">Community Admin Handles (comma-separated @handles)</Label>
            <Textarea
              value={state.community_admin_handles}
              onChange={(e) => setState({ ...state, community_admin_handles: e.target.value })}
              placeholder="@admin1, @admin2"
              className="text-sm h-16"
            />
          </div>
          <div>
            <Label className="text-xs">ATH 24h USD</Label>
            <Input
              type="number"
              step="0.000001"
              value={state.ath_24h_usd}
              onChange={(e) => setState({ ...state, ath_24h_usd: e.target.value })}
              className="text-sm h-8"
            />
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-xs">Status</Label>
            <Select
              value={state.is_rug ? "rug" : "active"}
              onValueChange={(v) => setState({ ...state, is_rug: v === "rug" })}
            >
              <SelectTrigger className="w-32 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">✅ Active</SelectItem>
                <SelectItem value="rug">🚫 Rug</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-3 w-3 mr-1" />Cancel</Button>
          <Button size="sm" disabled={saving} onClick={() => onSave(state)}>
            <Save className="h-3 w-3 mr-1" />{saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── main component ───────────────────────────────────────────
export default function Top200Tab() {
  const [activePage, setActivePage] = useState<"top200" | "rising">("top200");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [editState, setEditState] = useState<EditState | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const doSearch = useCallback(() => {
    setSearch(searchInput.trim());
  }, [searchInput]);

  // Fetch 500 tokens from master directory with relevant fields
  const { data: allTokens, isLoading, refetch } = useQuery({
    queryKey: ["top-200-leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("master_token_directory" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as any[];
    },
  });

  // Score + rank
  const ranked = useMemo(() => {
    if (!allTokens) return [];
    const scored = allTokens.map((t) => ({
      ...t,
      _score: qualityScore(t),
    }));
    scored.sort((a, b) => b._score - a._score);
    return scored.map((t, i) => ({ ...t, _rank: i + 1 }));
  }, [allTokens]);

  // Filter
  const filtered = useMemo(() => {
    if (!search) return ranked;
    const q = search.toLowerCase();
    return ranked.filter(
      (r) =>
        r.symbol?.toLowerCase().includes(q) ||
        r.name?.toLowerCase().includes(q) ||
        r.token_mint?.toLowerCase().includes(q)
    );
  }, [ranked, search]);

  // Split into pages
  const page1 = useMemo(() => (search ? filtered : filtered.filter((r) => r._rank <= 200)), [filtered, search]);
  const page2 = useMemo(() => (search ? [] : filtered.filter((r) => r._rank > 200)), [filtered, search]);
  const displayRows = activePage === "top200" ? page1 : page2;

  // Edit mutation — update source tables
  const saveMut = useMutation({
    mutationFn: async (s: EditState) => {
      const mods = s.community_mod_handles
        .split(",")
        .map((h) => h.trim().replace(/^@/, ""))
        .filter(Boolean);
      const admins = s.community_admin_handles
        .split(",")
        .map((h) => h.trim().replace(/^@/, ""))
        .filter(Boolean);

      // Update ATH on token_lifecycle
      const athVal = s.ath_24h_usd ? parseFloat(s.ath_24h_usd) : null;
      const { error: tlErr } = await supabase
        .from("token_lifecycle")
        .update({
          ath_24h_usd: athVal,
          current_status: s.is_rug ? "rugged" : "active",
        })
        .eq("token_mint", s.token_mint);
      if (tlErr) console.warn("token_lifecycle update:", tlErr.message);

      // Update community handles on x_communities via the linked token
      // Find communities linked to this token
      const { data: communities } = await supabase
        .from("x_communities")
        .select("id, linked_token_mints")
        .contains("linked_token_mints", [s.token_mint]);

      if (communities && communities.length > 0) {
        // Update the first linked community
        const { error: xcErr } = await supabase
          .from("x_communities")
          .update({
            moderator_usernames: mods.length ? mods : null,
            admin_usernames: admins.length ? admins : null,
          })
          .eq("id", communities[0].id);
        if (xcErr) console.warn("x_communities update:", xcErr.message);
      }
    },
    onSuccess: () => {
      toast({ title: "Token updated", description: "Changes saved. Refreshing view…" });
      setEditState(null);
      supabase.rpc("refresh_master_token_directory" as any).then(() => refetch());
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const openEdit = (r: any) => {
    setEditState({
      token_mint: r.token_mint,
      symbol: r.symbol || "",
      community_mod_handles: (r.community_mod_handles || []).join(", "),
      community_admin_handles: (r.community_admin_handles || []).join(", "),
      ath_24h_usd: r.ath_24h_usd?.toString() || "",
      is_rug: r.dev_tokens_rugged > 0 || r.current_status === "rugged",
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-400" /> Top 200 Leaderboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Quality-ranked tokens that shift position based on ATH, reputation, graduation &amp; dev trust
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Page toggle + search */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={activePage === "top200" ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setActivePage("top200")}
        >
          <TrendingUp className="h-3.5 w-3.5" /> Top 200
          <Badge variant="secondary" className="text-[10px] ml-1">{ranked.filter((r) => r._rank <= 200).length}</Badge>
        </Button>
        <Button
          variant={activePage === "rising" ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setActivePage("rising")}
        >
          <TrendingDown className="h-3.5 w-3.5" /> Rising / Falling (201-500)
          <Badge variant="secondary" className="text-[10px] ml-1">{ranked.filter((r) => r._rank > 200).length}</Badge>
        </Button>
        <form
          onSubmit={(e) => { e.preventDefault(); doSearch(); }}
          className="flex gap-1.5 ml-auto"
        >
          <Input
            placeholder="Search symbol, name, mint…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="text-sm h-8 w-56"
          />
          <Button type="submit" size="sm" variant="secondary" className="h-8 px-3">
            <Search className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>

      {/* Table */}
      <Card className="w-full -mx-6 sm:-mx-6" style={{ width: "calc(100% + 3rem)" }}>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="[&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:py-2 [&>th]:text-[11px] [&>th]:font-semibold">
                  <TableHead>Rank</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Img</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Mint</TableHead>
                  <TableHead>Launchpad</TableHead>
                  <TableHead>Websites</TableHead>
                  <TableHead>X Communities</TableHead>
                  <TableHead>X Handles</TableHead>
                  <TableHead>ATH 24h</TableHead>
                  <TableHead>Grad</TableHead>
                  <TableHead>Dev Wallet</TableHead>
                  <TableHead>Rep Score</TableHead>
                  <TableHead>Trust</TableHead>
                  <TableHead>Rugged</TableHead>
                  <TableHead>Successful</TableHead>
                  <TableHead>KYC</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={20} className="text-center py-12">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : displayRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={20} className="text-center py-8 text-muted-foreground">
                      No tokens found
                    </TableCell>
                  </TableRow>
                ) : (
                  displayRows.map((r: any) => (
                    <TableRow
                      key={r.token_mint}
                      className={`[&>td]:px-2 [&>td]:py-1.5 [&>td]:whitespace-nowrap hover:bg-muted/50 ${
                        r._rank <= 10 ? "bg-amber-500/5" : r._rank <= 50 ? "bg-yellow-500/5" : ""
                      }`}
                    >
                      <TableCell><RankBadge rank={r._rank} /></TableCell>
                      <TableCell><ScoreBadge score={r._score} /></TableCell>
                      <TableCell>
                        {r.image_url ? (
                          <img src={r.image_url} alt="" className="h-5 w-5 rounded-full object-cover" loading="lazy" />
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-muted" />
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">{r.symbol ?? "—"}</TableCell>
                      <TableCell>{truncate(r.name, 20)}</TableCell>
                      <TableCell><MintCell mint={r.token_mint} /></TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{r.launchpad ?? "—"}</Badge>
                      </TableCell>
                      {/* Websites */}
                      <TableCell>
                        {r.websites?.length ? (
                          <div className="flex flex-col gap-0.5 max-w-[180px]">
                            {r.websites.slice(0, 2).map((url: string, i: number) => {
                              let display = url;
                              try { display = new URL(url).hostname.replace("www.", ""); } catch {}
                              return (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                  className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5 truncate">
                                  🌐 {display} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                </a>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* X Communities with admin/mod badges */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5 max-w-[260px]">
                          {r.x_community_urls?.length ? (
                            r.x_community_urls.slice(0, 2).map((url: string, i: number) => {
                              const name = r.x_community_names?.[i] || url.split("/").pop() || "Community";
                              return (
                                <div key={i} className="border border-border/50 rounded px-1 py-0.5 bg-muted/30">
                                  <a href={url} target="_blank" rel="noopener noreferrer"
                                    className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5 truncate">
                                    🏛️ {truncate(name, 24)} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                  </a>
                                  {r.community_admin_handles?.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                                      {r.community_admin_handles.map((h: string, j: number) => (
                                        <a key={j} href={`https://x.com/${h}`} target="_blank" rel="noopener noreferrer">
                                          <Badge variant="default" className="text-[9px] px-1 py-0 bg-amber-600/80 hover:bg-amber-500">
                                            <Crown className="h-2 w-2 mr-0.5" />@{h}
                                          </Badge>
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                  {r.community_mod_handles?.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                                      {r.community_mod_handles.slice(0, 4).map((h: string, j: number) => (
                                        <a key={j} href={`https://x.com/${h}`} target="_blank" rel="noopener noreferrer">
                                          <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                            <Shield className="h-2 w-2 mr-0.5" />@{h}
                                          </Badge>
                                        </a>
                                      ))}
                                      {r.community_mod_handles.length > 4 && (
                                        <Badge variant="outline" className="text-[9px] px-1 py-0">+{r.community_mod_handles.length - 4}</Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      {/* X Handles */}
                      <TableCell>
                        {r.mesh_x_handles?.length ? (
                          <div className="flex flex-wrap gap-0.5 max-w-[160px]">
                            {r.mesh_x_handles.slice(0, 3).map((h: string, i: number) => (
                              <a key={i} href={`https://x.com/${h}`} target="_blank" rel="noopener noreferrer">
                                <Badge variant="outline" className="text-[10px] px-1 py-0 text-blue-400 hover:text-blue-300">@{h}</Badge>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.ath_24h_usd != null ? `$${Number(r.ath_24h_usd).toFixed(6)}` : "—"}
                      </TableCell>
                      <TableCell>{r.is_graduated ? "✅" : "—"}</TableCell>
                      <TableCell>
                        {(() => {
                          const w = r.creator_wallet || r.dev_wallets?.[0];
                          if (!w) return <span className="text-muted-foreground">—</span>;
                          return (
                            <a href={`https://solscan.io/account/${w}`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 font-mono text-xs text-blue-400 hover:text-blue-300">
                              {w.slice(0, 6)}…{w.slice(-4)}
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                            </a>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {r.dev_reputation_score != null ? (
                          <Badge
                            variant={Number(r.dev_reputation_score) >= 70 ? "default" : Number(r.dev_reputation_score) >= 40 ? "secondary" : "destructive"}
                            className="text-[10px]"
                          >
                            {Number(r.dev_reputation_score).toFixed(0)}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{r.dev_trust_level ?? "—"}</TableCell>
                      <TableCell>
                        {r.dev_tokens_rugged > 0 ? (
                          <span className="text-red-400 flex items-center gap-0.5">
                            <AlertTriangle className="h-3 w-3" /> {r.dev_tokens_rugged}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{r.dev_tokens_successful ?? "—"}</TableCell>
                      <TableCell>{r.kyc_verified ? "✅" : "—"}</TableCell>
                      <TableCell>{r.was_posted ? "✅" : "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(r)}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {/* Summary bar */}
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-xs text-muted-foreground">
              {activePage === "top200"
                ? `Showing ranks 1–200 · ${page1.length} tokens`
                : `Showing ranks 201–500 · ${page2.length} tokens`}
              {search && ` (filtered: ${filtered.length} results)`}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <EditTokenDialog
        open={!!editState}
        onClose={() => setEditState(null)}
        initial={editState}
        onSave={(s) => saveMut.mutate(s)}
        saving={saveMut.isPending}
      />
    </div>
  );
}
