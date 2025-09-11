import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Clock, ExternalLink, X, List } from "lucide-react";

interface TxRow {
  id: string;
  transaction_type: string; // 'buy' | 'sell'
  amount_sol: number;
  status: string | null; // 'confirmed' | 'pending' | 'failed' | null
  executed_at: string | null;
  signature?: string | null;
  gas_fee?: number | null;
  service_fee?: number | null;
}

function formatTs(ts?: string | null) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  } catch {
    return ts ?? "—";
  }
}

function truncate(str?: string | null, head = 8, tail = 6) {
  if (!str) return "—";
  if (str.length <= head + tail) return str;
  return `${str.slice(0, head)}…${str.slice(-tail)}`;
}

function statusBadgeVariant(status?: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch ((status || "").toLowerCase()) {
    case "confirmed":
    case "success":
      return "default"; // uses semantic primary/bg tokens
    case "pending":
      return "secondary";
    case "failed":
    case "error":
      return "destructive";
    default:
      return "outline";
  }
}

export default function TransactionHistoryWindow() {
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);

  const visibleCount = 50; // keep last 50

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("blackbox_transactions")
        .select("id, transaction_type, amount_sol, status, executed_at, signature, gas_fee, service_fee")
        .order("executed_at", { ascending: false })
        .limit(visibleCount);
      if (!mounted) return;
      if (error) {
        console.error("Failed to load transactions:", error);
      } else {
        setItems(data || []);
      }
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel("tx-history-window")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "blackbox_transactions" },
        payload => {
          const tx = payload.new as TxRow;
          setItems(prev => [tx, ...prev].slice(0, visibleCount));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const content = useMemo(() => (
    <ScrollArea className="max-h-80">{/* shows ~10-20 rows depending on viewport */}
      <ul className="divide-y">
        {items.map((tx) => (
          <li key={tx.id} className="py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant={tx.transaction_type === "sell" ? "secondary" : "default"}>
                    {tx.transaction_type.toUpperCase()}
                  </Badge>
                  <Badge variant={statusBadgeVariant(tx.status || undefined)}>
                    {tx.status ?? "unknown"}
                  </Badge>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {tx.amount_sol} SOL • gas {tx.gas_fee ?? 0} • fee {tx.service_fee ?? 0}
                </div>
                <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{formatTs(tx.executed_at)}</span>
                </div>
                {tx.signature && (
                  <div className="mt-1 text-xs">
                    <a
                      className="underline hover:no-underline"
                      href={`https://solscan.io/tx/${tx.signature}`}
                      target="_blank"
                      rel="noreferrer"
                      title={tx.signature}
                    >
                      {truncate(tx.signature)} <ExternalLink className="inline h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
        {(!loading && items.length === 0) && (
          <li className="py-6 text-sm text-muted-foreground text-center">No transactions yet</li>
        )}
      </ul>
    </ScrollArea>
  ), [items, loading]);

  return (
    <div className="fixed right-4 bottom-4 z-50 w-[92vw] max-w-md">
      <Card className="shadow-lg">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <List className="h-4 w-4" /> Transaction History (last 50)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">live</Badge>
              <Button size="sm" variant="ghost" onClick={() => setOpen(o => !o)} aria-label={open ? "Collapse" : "Expand"}>
                {open ? <X className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        {open && (
          <CardContent className="pt-0">
            {loading ? (
              <div className="py-6 text-sm text-muted-foreground">Loading…</div>
            ) : (
              content
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
