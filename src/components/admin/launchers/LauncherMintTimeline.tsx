import { useLauncherMintEvents } from "@/hooks/useLauncherProfiles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type TickerInfo = { symbol?: string; name?: string };

function useDexTickers(mints: string[]) {
  const key = [...new Set(mints)].sort().join(",");
  return useQuery({
    queryKey: ["dex-tickers", key],
    enabled: mints.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, TickerInfo>> => {
      const addrs = [...new Set(mints)];
      const chunks: string[][] = [];
      for (let i = 0; i < addrs.length; i += 30) chunks.push(addrs.slice(i, i + 30));
      const out: Record<string, TickerInfo> = {};
      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`);
            if (!res.ok) return;
            const json = await res.json();
            for (const p of json?.pairs || []) {
              const addr = p?.baseToken?.address;
              if (addr && !out[addr]) out[addr] = { symbol: p.baseToken.symbol, name: p.baseToken.name };
            }
          } catch {}
        }),
      );
      return out;
    },
  });
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "sold") return "default";
  if (s === "holding") return "secondary";
  if (s === "failed" || s === "skipped") return "destructive";
  return "outline";
}

export function LauncherMintTimeline({ profileId }: { profileId: string }) {
  const { data: events, isLoading } = useLauncherMintEvents(profileId);
  const mints = (events || []).map((e) => e.mint_address);
  const { data: tickers } = useDexTickers(mints);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Mint Timeline (live, 5s)</CardTitle></CardHeader>
      <CardContent className="p-0">
        {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading…</div> : (
          <div className="overflow-x-auto max-h-[480px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/50">
                <tr className="text-left">
                  <th className="p-2">Detected</th>
                  <th className="p-2">Ticker / Mint</th>
                  <th className="p-2">Dev buy</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Entry mcap</th>
                  <th className="p-2">High</th>
                  <th className="p-2">Exit mcap</th>
                  <th className="p-2">×</th>
                  <th className="p-2">PnL (SOL)</th>
                </tr>
              </thead>
              <tbody>
                {(events || []).map((e) => (
                  <tr key={e.id} className="border-t border-border/40 hover:bg-muted/30">
                    <td className="p-2 whitespace-nowrap leading-tight">
                      <div>{new Date(e.detected_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                      <div className="text-xs text-muted-foreground">{new Date(e.detected_at).toLocaleTimeString()}</div>
                    </td>
                    <td className="p-2 font-mono">
                      <div className="flex items-center gap-2">
                        {tickers?.[e.mint_address]?.symbol ? (
                          <span className="font-sans font-semibold text-foreground" title={tickers[e.mint_address].name || ""}>
                            ${tickers[e.mint_address].symbol}
                          </span>
                        ) : null}
                        <a
                          href={`https://pump.fun/coin/${e.mint_address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                          title="Open on Pump.fun"
                        >
                          {e.mint_address.slice(0, 6)}…{e.mint_address.slice(-4)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href={`https://dexscreener.com/solana/${e.mint_address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                          title="Open on DexScreener"
                        >
                          DEX
                        </a>
                        <a
                          href={`/?token=${e.mint_address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                          title="Open in HoldersIntel"
                        >
                          HI
                        </a>
                      </div>
                    </td>
                    <td className="p-2">{e.dev_initial_buy_sol?.toFixed(3) ?? "—"}</td>
                    <td className="p-2"><Badge variant={statusVariant(e.status)}>{e.status}</Badge>{e.skip_reason && <div className="text-[10px] text-muted-foreground">{e.skip_reason}</div>}</td>
                    <td className="p-2">{e.entry_mcap_usd ? `$${Math.round(e.entry_mcap_usd).toLocaleString()}` : "—"}</td>
                    <td className="p-2">{e.highest_mcap_usd ? `$${Math.round(e.highest_mcap_usd).toLocaleString()}` : "—"}</td>
                    <td className="p-2">{e.exit_mcap_usd ? `$${Math.round(e.exit_mcap_usd).toLocaleString()}` : "—"}</td>
                    <td className="p-2">{e.multiple_realized ? `${e.multiple_realized.toFixed(2)}×` : "—"}</td>
                    <td className="p-2">{e.realized_pnl_sol?.toFixed(4) ?? "—"}</td>
                  </tr>
                ))}
                {!events?.length && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No mints detected yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}