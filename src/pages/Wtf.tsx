import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  message_id: number | null;
  timestamp: string;
  token_mint: string | null;
  ticker: string | null;
  mcap: string | null;
  age: string | null;
  top10: string | null;
  mintable: string | null;
  lp_burned: string | null;
  milestone: string | null;
  entry_mc: string | null;
  current_mc: string | null;
  dex_screener: string;
  dex_tools: string;
  raw: string;
};

function pick(re: RegExp, raw: string): string | null {
  const m = raw.match(re);
  return m ? m[1].trim() : null;
}

function parseRow(r: any): Row {
  const raw: string = r.raw_message || "";
  const mint: string | null = r.token_mint || pick(/([1-9A-HJ-NP-Za-km-z]{32,44}pump)/, raw);
  const ticker = r.token_symbol || pick(/Token:\s*\$?([A-Za-z0-9_]+)/, raw);
  const milestone = pick(/MILESTONE:?\s*([\d.]+\s*X)/i, raw);
  return {
    id: r.id,
    message_id: r.message_id,
    timestamp: r.message_timestamp || r.created_at,
    token_mint: mint,
    ticker,
    mcap: pick(/Market Cap:\s*(\$?[\d.,]+\s*[kKmMbB]?)/, raw),
    age: pick(/Age:\s*([^\n]+)/, raw),
    top10: pick(/Top 10 Holders:\s*([^\n]+)/, raw),
    mintable: pick(/Mintable:\s*([^\n]+)/, raw),
    lp_burned: pick(/LP Burned:\s*([^\n]+)/, raw),
    milestone,
    entry_mc: pick(/Entry MC:\s*(\$?[\d.,]+\s*[kKmMbB]?)/i, raw),
    current_mc: pick(/Current MC:\s*(\$?[\d.,]+\s*[kKmMbB]?)/i, raw),
    dex_screener: mint ? `https://dexscreener.com/solana/${mint}` : "",
    dex_tools: mint ? `https://www.dextools.io/app/en/solana/pair-explorer/${mint}` : "",
    raw,
  };
}

export default function Wtf() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("telegram_channel_calls")
        .select("id, message_id, token_mint, token_symbol, raw_message, message_timestamp, created_at")
        .ilike("channel_name", "insiders")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        setErr(error.message);
      } else {
        setRows((data || []).map(parseRow));
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <h1 className="text-2xl font-bold mb-4">WTF — Last 100 Insiders Messages</h1>
      {loading && <div>Loading…</div>}
      {err && <div className="text-destructive">Error: {err}</div>}
      {!loading && !err && (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground sticky top-0">
              <tr>
                <th className="p-2 text-left">Timestamp</th>
                <th className="p-2 text-left">CA</th>
                <th className="p-2 text-left">$Ticker</th>
                <th className="p-2 text-left">MCAP</th>
                <th className="p-2 text-left">Age</th>
                <th className="p-2 text-left">Top 10</th>
                <th className="p-2 text-left">Mintable</th>
                <th className="p-2 text-left">LP Burned</th>
                <th className="p-2 text-left">Milestone</th>
                <th className="p-2 text-left">Entry MC</th>
                <th className="p-2 text-left">Current MC</th>
                <th className="p-2 text-left">DexScreener</th>
                <th className="p-2 text-left">DexTools</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                  <td className="p-2 whitespace-nowrap">{new Date(r.timestamp).toLocaleString()}</td>
                  <td className="p-2 font-mono">
                    {r.token_mint ? (
                      <span title={r.token_mint}>{r.token_mint.slice(0, 4)}…{r.token_mint.slice(-4)}</span>
                    ) : "—"}
                  </td>
                  <td className="p-2 font-semibold">{r.ticker ? `$${r.ticker}` : "—"}</td>
                  <td className="p-2">{r.mcap || "—"}</td>
                  <td className="p-2">{r.age || "—"}</td>
                  <td className="p-2">{r.top10 || "—"}</td>
                  <td className="p-2">{r.mintable || "—"}</td>
                  <td className="p-2">{r.lp_burned || "—"}</td>
                  <td className="p-2 text-primary font-bold">{r.milestone || "—"}</td>
                  <td className="p-2">{r.entry_mc || "—"}</td>
                  <td className="p-2">{r.current_mc || "—"}</td>
                  <td className="p-2">
                    {r.dex_screener ? (
                      <a className="text-primary underline" href={r.dex_screener} target="_blank" rel="noreferrer">open</a>
                    ) : "—"}
                  </td>
                  <td className="p-2">
                    {r.dex_tools ? (
                      <a className="text-primary underline" href={r.dex_tools} target="_blank" rel="noreferrer">open</a>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}