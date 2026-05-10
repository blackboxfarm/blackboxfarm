import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const short = (a?: string | null) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "—");

type Row = {
  id: string;
  dev_wallet: string;
  kyc_wallet: string;
  kyc_label: string | null;
  chain: Array<{ wallet: string; funderName?: string | null; depth: number }>;
  chain_depth: number;
  tokens: string[];
  token_count: number;
  discovered_at: string;
  discovered_via: string | null;
};

const KycDiscoveryLogPanel = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["kyc-discovery-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kyc_discovery_log" as any)
        .select("*")
        .order("discovered_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    refetchInterval: 15_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔗 KYC Discovery Log</CardTitle>
        <CardDescription>
          Every newly resolved Dev Wallet → KYC root, with the full hop chain and the dev's tokens. Auto-refreshes every 15s.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !data?.length ? (
          <div className="text-sm text-muted-foreground">No discoveries yet.</div>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead compact>When</TableHead>
                  <TableHead compact>KYC</TableHead>
                  <TableHead compact>Dev Wallet</TableHead>
                  <TableHead compact>Chain (Dev → KYC)</TableHead>
                  <TableHead compact>Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => {
                  const hops = (r.chain ?? []).map((c) => c.wallet);
                  const fullChain = [r.dev_wallet, ...hops.filter((w) => w !== r.dev_wallet && w !== r.kyc_wallet), r.kyc_wallet];
                  return (
                    <TableRow key={r.id}>
                      <TableCell compact className="whitespace-nowrap text-muted-foreground">
                        {new Date(r.discovered_at).toLocaleString()}
                      </TableCell>
                      <TableCell compact>
                        <Badge variant="default">{r.kyc_label || "KYC"}</Badge>
                        <div className="font-mono text-[10px] text-muted-foreground mt-1">{short(r.kyc_wallet)}</div>
                      </TableCell>
                      <TableCell compact>
                        <a
                          className="font-mono text-xs underline"
                          href={`https://solscan.io/account/${r.dev_wallet}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {short(r.dev_wallet)}
                        </a>
                      </TableCell>
                      <TableCell compact>
                        <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
                          {fullChain.map((w, i) => (
                            <React.Fragment key={`${w}-${i}`}>
                              <a
                                className="underline hover:text-primary"
                                href={`https://solscan.io/account/${w}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {short(w)}
                              </a>
                              {i < fullChain.length - 1 && <span className="text-muted-foreground">→</span>}
                            </React.Fragment>
                          ))}
                          <span className="ml-2 text-muted-foreground">({r.chain_depth} hops)</span>
                        </div>
                      </TableCell>
                      <TableCell compact>
                        <div className="flex flex-wrap gap-1 max-w-[260px]">
                          {(r.tokens ?? []).slice(0, 5).map((t) => (
                            <a
                              key={t}
                              className="font-mono text-[10px] underline text-muted-foreground hover:text-primary"
                              href={`/holders?token=${t}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {short(t)}
                            </a>
                          ))}
                          {r.token_count > 5 && (
                            <span className="text-[10px] text-muted-foreground">+{r.token_count - 5}</span>
                          )}
                          {r.token_count === 0 && <span className="text-[10px] text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default KycDiscoveryLogPanel;
