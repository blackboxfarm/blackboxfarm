import React, { useCallback, useEffect, useMemo, useState } from "react";
import VolumeSimulator from "@/components/VolumeSimulator";
import SecretsModal from "@/components/SecretsModal";
import WalletPoolManager from "@/components/WalletPoolManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { useLocalSecrets } from "@/hooks/useLocalSecrets";
import { useWalletPool } from "@/hooks/useWalletPool";
import { Connection, PublicKey } from "@solana/web3.js";

const JUP_PRICE = async (id: string): Promise<number | null> => {
  try {
    const r = await fetch(`https://price.jup.ag/v6/price?ids=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const p = Number(j?.data?.[id]?.price ?? j?.data?.SOL?.price ?? j?.data?.wSOL?.price);
      return Number.isFinite(p) && p > 0 ? p : null;
    }
  } catch {}
  return null;
};

const BumpBot = () => {
  // SEO meta
  useEffect(() => {
    document.title = "Bump Bot | Solana Volume Simulator & Fee Planner";
    const desc =
      "Plan your Solana bump bot: estimate runtime, fees, and trade cycles with adjustable bankroll, trade size, interval, and fee presets.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", `${window.location.origin}/bb`);
  }, []);

  // RPC connection (from local Secrets)
  const { secrets } = useLocalSecrets();
  const [conn, setConn] = useState<Connection | null>(null);
  useEffect(() => {
    if (secrets?.rpcUrl) setConn(new Connection(secrets.rpcUrl, { commitment: "confirmed" }));
  }, [secrets?.rpcUrl]);

  // Use FIRST wallet from Wallet Pool (generated/custom) for balances
  const { wallets: poolWallets } = useWalletPool();
  const displayPubkey = useMemo(() => poolWallets[0]?.pubkey ?? "", [poolWallets]);

  // Live balances state
  const [tokenMint, setTokenMint] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sol, setSol] = useState<number | null>(null);
  const [tokenUi, setTokenUi] = useState<number | null>(null);
  const [solUsd, setSolUsd] = useState<number | null>(null);
  const [tokenUsd, setTokenUsd] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!conn || !displayPubkey) return;
    setLoading(true);
    try {
      const ownerPk = new PublicKey(displayPubkey);
      const [lam, solPrice] = await Promise.all([
        conn.getBalance(ownerPk),
        JUP_PRICE("SOL"),
      ]);
      setSol(lam / 1_000_000_000);
      setSolUsd(solPrice);

      // Token balance + price (if mint provided)
      let mintKey: PublicKey | null = null;
      try { if (tokenMint) mintKey = new PublicKey(tokenMint); } catch { mintKey = null; }

      if (mintKey) {
        const [parsed, tPrice] = await Promise.all([
          conn.getParsedTokenAccountsByOwner(ownerPk, { mint: mintKey }),
          JUP_PRICE(mintKey.toBase58()),
        ]);
        const totalUi = parsed.value.reduce((sum, acc: any) => {
          const ui = Number(acc?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0);
          return sum + (Number.isFinite(ui) ? ui : 0);
        }, 0);
        setTokenUi(totalUi);
        setTokenUsd(tPrice);
      } else {
        setTokenUi(null);
        setTokenUsd(null);
      }
    } catch {}
    finally {
      setLoading(false);
    }
  }, [conn, displayPubkey, tokenMint]);

  // 5s polling when running
  useEffect(() => {
    if (!running) return;
    void refresh();
    const id = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(id);
  }, [running, refresh]);

  const totalUsd = useMemo(() => {
    const solPart = sol && solUsd ? sol * solUsd : 0;
    const tokPart = tokenUi && tokenUsd ? tokenUi * tokenUsd : 0;
    return solPart + tokPart;
  }, [sol, solUsd, tokenUi, tokenUsd]);

  return (
    <div className="min-h-screen bg-background">
      <header className="container mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bump Bot — Solana Volume Simulator</h1>
            <p className="text-muted-foreground mt-2">Find a balanced period, price, and frequency before running anything on-chain.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" aria-label="Open Live Runner">
              <Button>Open Live Runner</Button>
            </Link>
            <SecretsModal />
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 pb-12">
        {/* Live controls — minimal and separate */}
        <section className="mb-10">
          <Card className="max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle>Live Controls — Token & Wallet Balances</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Token address (mint)</Label>
                  <Input placeholder="Token mint address" value={tokenMint} onChange={(e) => setTokenMint(e.target.value.trim())} />
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={() => setRunning(true)} disabled={running || !conn || !displayPubkey}>Start</Button>
                  <Button variant="secondary" onClick={() => setRunning(false)} disabled={!running}>Stop</Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Wallet</div>
                <div className="text-sm break-all">{displayPubkey || "No wallet — use Wallet Pool to generate one"}</div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                <div className="rounded-md border p-3">
                  <div className="font-medium">SOL balance</div>
                  <div className="text-muted-foreground">{sol !== null ? sol.toFixed(6) : "…"} SOL{solUsd && sol !== null ? ` • ~$${(sol * solUsd).toFixed(2)}` : ""}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="font-medium">Token balance</div>
                  <div className="text-muted-foreground">
                    {tokenMint ? (tokenUi !== null ? tokenUi.toFixed(6) : "…") : "—"}
                    {tokenMint && tokenUsd && tokenUi !== null ? ` • ~$${(tokenUi * tokenUsd).toFixed(2)}` : ""}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="font-medium">Total (USD est.)</div>
                  <div className="text-muted-foreground">{Number.isFinite(totalUsd) && totalUsd > 0 ? `$${totalUsd.toFixed(2)}` : "…"}</div>
                </div>
              </div>

              {running && <div className="text-xs text-muted-foreground">Auto-refreshing every 5s{loading ? "…" : ""}</div>}
            </CardContent>
          </Card>
        </section>

        <section className="mb-10">
          <WalletPoolManager />
        </section>
        <section className="mb-10">
          <VolumeSimulator />
        </section>
      </main>
    </div>
  );
};

export default BumpBot;
