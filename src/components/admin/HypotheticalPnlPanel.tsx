import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { Calculator, ChevronDown, Download, Info, TrendingUp, TrendingDown } from "lucide-react";

interface MinimalRow {
  token_mint: string;
  token_symbol: string | null;
  first_called_at: string;
  entry_market_cap: number | null;
  peak_multiplier: number;
  peak_market_cap: number | null;
}

type SellStrategy = "ath" | "2x" | "5x_or_peak" | "current";

interface Props {
  rows: MinimalRow[];
}

function fmt$(n: number): string {
  if (!isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${n < 0 ? "-" : ""}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${n < 0 ? "-" : ""}$${(a / 1_000).toFixed(2)}k`;
  return `${n < 0 ? "-" : ""}$${a.toFixed(2)}`;
}

function fmtMC(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function csvEscape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function HypotheticalPnlPanel({ rows }: Props) {
  const [open, setOpen] = useState(true);
  const [betSize, setBetSize] = useState<number>(10);
  const [strategy, setStrategy] = useState<SellStrategy>("ath");

  const sim = useMemo(() => {
    let totalSpent = 0;
    let totalReturned = 0;
    let included = 0;
    let excluded = 0;
    const excludedReasons: { mint: string; symbol: string | null; reason: string }[] = [];
    const perToken: {
      mint: string; symbol: string | null; first_called_at: string;
      entry_mc: number | null; peak_mc: number | null; peak_x: number;
      bet: number; ret: number; pnl: number; trigger: string; included: boolean;
    }[] = [];

    for (const r of rows) {
      const peakX = r.peak_multiplier || 0;
      // To compute return we just need a multiplier — entry MC isn't required for ath/2x/5x strategies.
      // For "current" we need peak_market_cap & entry_market_cap to ratio current vs entry.
      let trigger = "";
      let mult = 0;
      let ok = false;

      if (strategy === "ath") {
        if (peakX > 0) { mult = peakX; trigger = `ATH ${peakX}x`; ok = true; }
        else { excluded++; excludedReasons.push({ mint: r.token_mint, symbol: r.token_symbol, reason: "no peak data" }); }
      } else if (strategy === "2x") {
        if (peakX >= 2) { mult = 2; trigger = "Sold at 2x"; ok = true; }
        else if (peakX > 0) { mult = peakX; trigger = `Never hit 2x — sold at peak ${peakX}x`; ok = true; }
        else { excluded++; excludedReasons.push({ mint: r.token_mint, symbol: r.token_symbol, reason: "no peak data" }); }
      } else if (strategy === "5x_or_peak") {
        if (peakX >= 5) { mult = 5; trigger = "Sold at 5x"; ok = true; }
        else if (peakX > 0) { mult = peakX; trigger = `Never hit 5x — sold at peak ${peakX}x`; ok = true; }
        else { excluded++; excludedReasons.push({ mint: r.token_mint, symbol: r.token_symbol, reason: "no peak data" }); }
      } else if (strategy === "current") {
        if (r.entry_market_cap && r.peak_market_cap) {
          // We don't have live current MC here — approximate "hold" as peak (best case).
          mult = r.peak_market_cap / r.entry_market_cap;
          trigger = `Hold (≈peak ${mult.toFixed(1)}x — no live MC)`;
          ok = true;
        } else {
          excluded++;
          excludedReasons.push({ mint: r.token_mint, symbol: r.token_symbol, reason: "missing entry/peak MC" });
        }
      }

      if (!ok) {
        perToken.push({
          mint: r.token_mint, symbol: r.token_symbol, first_called_at: r.first_called_at,
          entry_mc: r.entry_market_cap, peak_mc: r.peak_market_cap, peak_x: peakX,
          bet: 0, ret: 0, pnl: 0, trigger: "excluded", included: false,
        });
        continue;
      }

      const ret = betSize * mult;
      const pnl = ret - betSize;
      totalSpent += betSize;
      totalReturned += ret;
      included++;
      perToken.push({
        mint: r.token_mint, symbol: r.token_symbol, first_called_at: r.first_called_at,
        entry_mc: r.entry_market_cap, peak_mc: r.peak_market_cap, peak_x: peakX,
        bet: betSize, ret, pnl, trigger, included: true,
      });
    }

    // Daily buckets
    const byDay = new Map<string, { spent: number; returned: number; tokens: number }>();
    for (const t of perToken) {
      if (!t.included) continue;
      const day = t.first_called_at.slice(0, 10);
      const cur = byDay.get(day) || { spent: 0, returned: 0, tokens: 0 };
      cur.spent += t.bet;
      cur.returned += t.ret;
      cur.tokens += 1;
      byDay.set(day, cur);
    }
    const sortedDays = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
    let cumSpent = 0;
    let cumReturned = 0;
    const cumChart = sortedDays.map(([day, d]) => {
      cumSpent += d.spent;
      cumReturned += d.returned;
      return {
        day,
        cumSpent: Number(cumSpent.toFixed(2)),
        cumReturned: Number(cumReturned.toFixed(2)),
        cumPnl: Number((cumReturned - cumSpent).toFixed(2)),
        dailyPnl: Number((d.returned - d.spent).toFixed(2)),
        tokens: d.tokens,
      };
    });

    const winners = [...perToken].filter(t => t.included).sort((a, b) => b.pnl - a.pnl).slice(0, 10);
    const duds = [...perToken].filter(t => t.included).sort((a, b) => a.pnl - b.pnl).slice(0, 10);

    return {
      totalSpent, totalReturned,
      netPnl: totalReturned - totalSpent,
      roi: totalSpent > 0 ? ((totalReturned - totalSpent) / totalSpent) * 100 : 0,
      included, excluded, excludedReasons,
      perToken, cumChart, winners, duds,
    };
  }, [rows, betSize, strategy]);

  const handleExport = () => {
    const headers = [
      "First called", "Symbol", "Mint", "Entry MC", "Peak MC", "Peak X",
      "Bet ($)", "Return ($)", "PnL ($)", "Trigger", "Included",
    ];
    const lines = [headers.join(",")];
    for (const t of sim.perToken) {
      lines.push([
        t.first_called_at, t.symbol || "", t.mint,
        t.entry_mc ?? "", t.peak_mc ?? "", t.peak_x,
        t.bet.toFixed(2), t.ret.toFixed(2), t.pnl.toFixed(2),
        t.trigger, t.included ? "yes" : "no",
      ].map(csvEscape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pnl-sim-${strategy}-$${betSize}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="p-0 h-auto hover:bg-transparent">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calculator className="h-5 w-5 text-primary" />
                  Hypothetical "${betSize} Per Call" Simulator
                  <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                </CardTitle>
              </Button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Bet:</span>
              <Input
                type="number"
                value={betSize}
                onChange={(e) => setBetSize(Math.max(1, Math.min(1000, Number(e.target.value) || 10)))}
                className="w-20 h-8"
                min={1}
                max={1000}
              />
              <Slider
                value={[betSize]}
                onValueChange={(v) => setBetSize(v[0])}
                min={1} max={1000} step={1}
                className="w-32"
              />
              <Select value={strategy} onValueChange={(v) => setStrategy(v as SellStrategy)}>
                <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ath">Sell at peak ATH</SelectItem>
                  <SelectItem value="2x">Sell at 2x</SelectItem>
                  <SelectItem value="5x_or_peak">Sell at 5x (or peak)</SelectItem>
                  <SelectItem value="current">Hold (≈peak)</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleExport} size="sm" variant="outline" disabled={sim.perToken.length === 0}>
                <Download className="h-4 w-4 mr-1" />CSV
              </Button>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* KPI Tiles */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card className="bg-muted/30"><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Total Spent</div>
                <div className="text-xl font-bold">{fmt$(sim.totalSpent)}</div>
                <div className="text-xs text-muted-foreground">{sim.included} tokens</div>
              </CardContent></Card>
              <Card className="bg-muted/30"><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Total Returned</div>
                <div className="text-xl font-bold text-green-500">{fmt$(sim.totalReturned)}</div>
              </CardContent></Card>
              <Card className="bg-muted/30"><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Net PnL</div>
                <div className={`text-xl font-bold ${sim.netPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {sim.netPnl >= 0 ? "+" : ""}{fmt$(sim.netPnl)}
                </div>
              </CardContent></Card>
              <Card className="bg-muted/30"><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">ROI</div>
                <div className={`text-xl font-bold ${sim.roi >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {sim.roi >= 0 ? "+" : ""}{sim.roi.toFixed(1)}%
                </div>
              </CardContent></Card>
              <Card className="bg-muted/30"><CardContent className="p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  Excluded
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <Info className="h-3 w-3 cursor-help" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80 text-xs max-h-64 overflow-y-auto">
                      <div className="font-semibold mb-2">Excluded tokens ({sim.excluded})</div>
                      {sim.excludedReasons.length === 0 ? (
                        <div className="text-muted-foreground">None</div>
                      ) : (
                        <ul className="space-y-1">
                          {sim.excludedReasons.slice(0, 30).map((e, i) => (
                            <li key={i} className="flex justify-between gap-2">
                              <span>{e.symbol || e.mint.slice(0, 8)}</span>
                              <span className="text-muted-foreground">{e.reason}</span>
                            </li>
                          ))}
                          {sim.excludedReasons.length > 30 && (
                            <li className="text-muted-foreground">…and {sim.excludedReasons.length - 30} more</li>
                          )}
                        </ul>
                      )}
                    </HoverCardContent>
                  </HoverCard>
                </div>
                <div className="text-xl font-bold text-muted-foreground">{sim.excluded}</div>
              </CardContent></Card>
            </div>

            {/* Cumulative Chart */}
            {sim.cumChart.length > 0 && (
              <div>
                <div className="text-sm font-semibold mb-2">Cumulative Spent vs Returned</div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sim.cumChart}>
                      <defs>
                        <linearGradient id="spentGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(142 70% 45%)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="hsl(142 70% 45%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <RTooltip
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                        formatter={(value: any, name: string) => [fmt$(Number(value)), name]}
                      />
                      <Area type="monotone" dataKey="cumSpent" name="Spent" stroke="hsl(var(--destructive))" fill="url(#spentGrad)" strokeWidth={2} />
                      <Area type="monotone" dataKey="cumReturned" name="Returned" stroke="hsl(142 70% 45%)" fill="url(#retGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Daily PnL Bars */}
            {sim.cumChart.length > 0 && (
              <div>
                <div className="text-sm font-semibold mb-2">Daily PnL</div>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sim.cumChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <RTooltip
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                        formatter={(value: any) => [fmt$(Number(value)), "PnL"]}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                      <Bar dataKey="dailyPnl" name="Daily PnL">
                        {sim.cumChart.map((d, i) => (
                          <rect key={i} fill={d.dailyPnl >= 0 ? "hsl(142 70% 45%)" : "hsl(var(--destructive))"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Winners & Duds */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <TrendingUp className="h-4 w-4 text-green-500" />Top 10 Winners
                </div>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead className="text-right">Peak X</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sim.winners.map((t) => (
                        <TableRow key={t.mint}>
                          <TableCell className="font-medium">{t.symbol || t.mint.slice(0, 6)}</TableCell>
                          <TableCell className="text-right"><Badge>{t.peak_x}x</Badge></TableCell>
                          <TableCell className="text-right text-green-500 font-bold">+{fmt$(t.pnl)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <TrendingDown className="h-4 w-4 text-red-500" />Worst 10 Duds
                </div>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead className="text-right">Peak X</TableHead>
                        <TableHead className="text-right">PnL</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sim.duds.map((t) => (
                        <TableRow key={t.mint}>
                          <TableCell className="font-medium">{t.symbol || t.mint.slice(0, 6)}</TableCell>
                          <TableCell className="text-right"><Badge variant="outline">{t.peak_x}x</Badge></TableCell>
                          <TableCell className={`text-right font-bold ${t.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {t.pnl >= 0 ? "+" : ""}{fmt$(t.pnl)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
