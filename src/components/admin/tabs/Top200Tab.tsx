import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Trophy,
  Search,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Edit2,
  Save,
  X,
  TrendingUp,
  TrendingDown,
  Flame,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";

const WORKER_URL = "https://dex-trending-solana.yayasanjembatanbali.workers.dev/api/trending/solana";
const SOL_MINTS = new Set(["So11111111111111111111111111111111111111112"]);

interface WorkerPair {
  pairId: string;
  tokenMint: string;
  symbol?: string | null;
  name?: string | null;
  liquidityUsd?: number | null;
  volume24h?: number | null;
  priceUsd?: string | null;
  fdv?: number | null;
  url: string;
}

interface EditState {
  token_mint: string;
  symbol: string;
  name: string;
  ath_24h_usd: string;
  current_status: string;
  launchpad: string;
  oracle_score: string;
}

function truncate(s: string | null, n = 16) {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function formatUsd(num?: number | null) {
  if (num == null) return "—";
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
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

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 10) return <span className="text-amber-400 font-bold">🏆 {rank}</span>;
  if (rank <= 50) return <span className="text-yellow-500 font-semibold">{rank}</span>;
  if (rank <= 200) return <span className="text-foreground font-medium">{rank}</span>;
  return <span className="text-muted-foreground">{rank}</span>;
}

const LAUNCHPAD_LOGOS: Record<string, string> = {
  "pump.fun": "/launchpad-logos/pumpfun.png",
  "bonk.fun": "/launchpad-logos/bonkfun.png",
  "bags.fm": "/launchpad-logos/bagsfm.png",
  raydium: "/launchpad-logos/raydium.png",
};

function EditTokenDialog({
  open,
  onClose,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial: EditState | null;
  onSave: (s: EditState) => void;
  saving: boolean;
}) {
  const [state, setState] = useState<EditState | null>(null);

  React.useEffect(() => {
    if (initial) setState({ ...initial });
  }, [initial]);

  if (!state) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-4 w-4" /> Edit {state.symbol || state.token_mint.slice(0, 8)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Symbol</Label>
              <Input
                value={state.symbol}
                onChange={(e) => setState({ ...state, symbol: e.target.value })}
                className="text-sm h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={state.name}
                onChange={(e) => setState({ ...state, name: e.target.value })}
                className="text-sm h-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <Label className="text-xs">Oracle Score (0-100)</Label>
              <Input
                type="number"
                step="1"
                value={state.oracle_score}
                onChange={(e) => setState({ ...state, oracle_score: e.target.value })}
                className="text-sm h-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Launchpad</Label>
              <Input
                value={state.launchpad}
                onChange={(e) => setState({ ...state, launchpad: e.target.value })}
                className="text-sm h-8"
                placeholder="pump.fun, raydium…"
              />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select
                value={state.current_status}
                onValueChange={(v) => setState({ ...state, current_status: v })}
              >
                <SelectTrigger className="w-full h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">✅ Active</SelectItem>
                  <SelectItem value="graduated">🎓 Graduated</SelectItem>
                  <SelectItem value="rugged">🚫 Rugged</SelectItem>
                  <SelectItem value="dormant">💤 Dormant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-3 w-3 mr-1" />Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={() => onSave(state)}>
            <Save className="h-3 w-3 mr-1" />{saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Top200Tab() {
  const [activePage, setActivePage] = useState<"top200" | "rising">("top200");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [editState, setEditState] = useState<EditState | null>(null);
  const { toast } = useToast();

  const doSearch = useCallback(() => {
    setSearch(searchInput.trim());
  }, [searchInput]);

  const { data: allTokens, isLoading, refetch } = useQuery({
    queryKey: ["dex-top-500-leaderboard"],
    queryFn: async () => {
      const workerResponse = await fetch(WORKER_URL);
      if (!workerResponse.ok) {
        throw new Error(`Cloudflare worker returned ${workerResponse.status}`);
      }

      const workerData = await workerResponse.json();
      const workerPairs: WorkerPair[] = (workerData.pairs || [])
        .filter((pair: any) => pair.ok && pair.tokenMint)
        .filter((pair: any) => !SOL_MINTS.has(pair.tokenMint))
        .filter((pair: any) => !(pair.symbol === "SOL" && pair.name === "Solana"));

      const uniquePairs = workerPairs.filter(
        (pair, index, arr) => arr.findIndex((entry) => entry.tokenMint === pair.tokenMint) === index,
      );

      if (uniquePairs.length === 0) return [];

      const mints = uniquePairs.map((pair) => pair.tokenMint);
      const { data: dbTokens, error } = await supabase
        .from("token_lifecycle")
        .select("*")
        .in("token_mint", mints);

      if (error) throw error;

      const dbMap = new Map((dbTokens || []).map((token: any) => [token.token_mint, token]));

      return uniquePairs.slice(0, 500).map((pair, index) => {
        const dbToken: any = dbMap.get(pair.tokenMint) || {};

        return {
          ...dbToken,
          token_mint: pair.tokenMint,
          symbol: dbToken.symbol ?? pair.symbol ?? null,
          name: dbToken.name ?? pair.name ?? null,
          liquidity_usd: pair.liquidityUsd ?? dbToken.liquidity_usd ?? null,
          volume_24h: pair.volume24h ?? dbToken.volume_24h ?? null,
          price_usd: pair.priceUsd ?? dbToken.price_usd ?? null,
          fdv: pair.fdv ?? dbToken.fdv ?? null,
          dex_url: pair.url,
          _rank: index + 1,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    if (!allTokens) return [];
    if (!search) return allTokens;
    const q = search.toLowerCase();
    return allTokens.filter(
      (r: any) =>
        r.symbol?.toLowerCase().includes(q) ||
        r.name?.toLowerCase().includes(q) ||
        r.token_mint?.toLowerCase().includes(q) ||
        r.creator_wallet?.toLowerCase().includes(q),
    );
  }, [allTokens, search]);

  const page1 = useMemo(() => (search ? filtered : filtered.filter((r: any) => r._rank <= 200)), [filtered, search]);
  const page2 = useMemo(() => (search ? [] : filtered.filter((r: any) => r._rank > 200)), [filtered, search]);
  const displayRows = activePage === "top200" ? page1 : page2;

  const stats = useMemo(() => {
    if (!allTokens) return { total: 0, boosted: 0, graduated: 0 };
    return {
      total: allTokens.length,
      boosted: allTokens.filter((t: any) => t.active_boosts > 0).length,
      graduated: allTokens.filter((t: any) => t.current_status === "graduated").length,
    };
  }, [allTokens]);

  const saveMut = useMutation({
    mutationFn: async (s: EditState) => {
      const updates: Record<string, any> = {
        symbol: s.symbol || null,
        name: s.name || null,
        current_status: s.current_status,
        launchpad: s.launchpad || null,
      };
      if (s.ath_24h_usd) updates.ath_24h_usd = parseFloat(s.ath_24h_usd);
      if (s.oracle_score) updates.oracle_score = parseInt(s.oracle_score);

      const { error } = await supabase
        .from("token_lifecycle")
        .update(updates)
        .eq("token_mint", s.token_mint);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Token updated" });
      setEditState(null);
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const openEdit = (r: any) => {
    setEditState({
      token_mint: r.token_mint,
      symbol: r.symbol || "",
      name: r.name || "",
      ath_24h_usd: r.ath_24h_usd?.toString() || "",
      current_status: r.current_status || "active",
      launchpad: r.launchpad || "",
      oracle_score: r.oracle_score?.toString() || "",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-400" /> Dex Top 200
          </h2>
          <p className="text-sm text-muted-foreground">
            Live mirror of the Dex/Cloudflare worker order — edit tokens inline
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{stats.total} live</span>
          <span>{stats.boosted} boosted</span>
          <span>{stats.graduated} graduated</span>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 ml-2">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={activePage === "top200" ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setActivePage("top200")}
        >
          <TrendingUp className="h-3.5 w-3.5" /> Top 200
          <Badge variant="secondary" className="text-[10px] ml-1">
            {page1.length}
          </Badge>
        </Button>
        <Button
          variant={activePage === "rising" ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setActivePage("rising")}
        >
          <TrendingDown className="h-3.5 w-3.5" /> 201–500
          <Badge variant="secondary" className="text-[10px] ml-1">
            {page2.length}
          </Badge>
        </Button>
        <form onSubmit={(e) => { e.preventDefault(); doSearch(); }} className="flex gap-1.5 ml-auto">
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

      <Card className="w-full -mx-6 sm:-mx-6" style={{ width: "calc(100% + 3rem)" }}>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="[&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:py-2 [&>th]:text-[11px] [&>th]:font-semibold">
                  <TableHead>Rank</TableHead>
                  <TableHead>Img</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Mint</TableHead>
                  <TableHead>Liquidity</TableHead>
                  <TableHead>Market Cap</TableHead>
                  <TableHead>Volume 24h</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>ATH 24h</TableHead>
                  <TableHead>FDV</TableHead>
                  <TableHead>Boosts</TableHead>
                  <TableHead>Launchpad</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Oracle</TableHead>
                  <TableHead>Pair Created</TableHead>
                  <TableHead>First Seen</TableHead>
                  <TableHead>Last Fetched</TableHead>
                  <TableHead>Dev Wallet</TableHead>
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
                        r.current_status === "rugged"
                          ? "bg-destructive/10 line-through opacity-60"
                          : r._rank <= 10
                            ? "bg-amber-500/5"
                            : r._rank <= 50
                              ? "bg-yellow-500/5"
                              : ""
                      }`}
                    >
                      <TableCell><RankBadge rank={r._rank} /></TableCell>
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
                      <TableCell className="font-mono text-green-400">{formatUsd(r.liquidity_usd)}</TableCell>
                      <TableCell className="font-mono">{formatUsd(r.market_cap)}</TableCell>
                      <TableCell className="font-mono">{formatUsd(r.volume_24h)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.price_usd != null ? `$${Number(r.price_usd).toPrecision(4)}` : "—"}
                      </TableCell>
                      <TableCell className="font-mono">
                        {r.ath_24h_usd != null ? `$${Number(r.ath_24h_usd).toFixed(6)}` : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">{formatUsd(r.fdv)}</TableCell>
                      <TableCell>
                        {r.active_boosts > 0 ? (
                          <Badge variant="default" className="text-[10px] gap-0.5">
                            <Flame className="h-2.5 w-2.5" />{r.active_boosts}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {r.launchpad ? (
                          <div className="flex items-center gap-1">
                            {LAUNCHPAD_LOGOS[r.launchpad.toLowerCase()] && (
                              <img src={LAUNCHPAD_LOGOS[r.launchpad.toLowerCase()]} alt="" className="w-4 h-4 object-contain" />
                            )}
                            <span className="text-[10px]">{r.launchpad}</span>
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {r.current_status === "rugged" ? (
                          <Badge variant="destructive" className="text-[10px]">🚫 Rug</Badge>
                        ) : r.current_status === "graduated" ? (
                          <Badge variant="default" className="text-[10px]">🎓</Badge>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">{r.current_status || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.oracle_score != null ? (
                          <Badge
                            variant={r.oracle_score >= 70 ? "default" : r.oracle_score >= 40 ? "secondary" : "destructive"}
                            className="text-[10px] font-mono"
                          >
                            {r.oracle_score}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[10px]">
                        {r.pair_created_at ? formatDistanceToNow(new Date(r.pair_created_at), { addSuffix: true }) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[10px]">
                        {r.first_seen_at ? formatDistanceToNow(new Date(r.first_seen_at), { addSuffix: true }) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[10px]">
                        {r.last_fetched_at ? formatDistanceToNow(new Date(r.last_fetched_at), { addSuffix: true }) : "—"}
                      </TableCell>
                      <TableCell>
                        {r.creator_wallet ? (
                          <a
                            href={`https://solscan.io/account/${r.creator_wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 font-mono text-xs text-blue-400 hover:text-blue-300"
                          >
                            {r.creator_wallet.slice(0, 6)}…{r.creator_wallet.slice(-4)}
                            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                          </a>
                        ) : "—"}
                      </TableCell>
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
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-xs text-muted-foreground">
              {activePage === "top200"
                ? `Ranks 1–200 · ${page1.length} tokens`
                : `Ranks 201–500 · ${page2.length} tokens`}
              {search && ` (filtered: ${filtered.length})`}
            </span>
          </div>
        </CardContent>
      </Card>

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
