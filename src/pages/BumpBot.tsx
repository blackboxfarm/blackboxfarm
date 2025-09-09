import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VolumeSimulator from "@/components/VolumeSimulator";
import SecretsModal from "@/components/SecretsModal";
import WalletPoolManager from "@/components/WalletPoolManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { useUserSecrets } from "@/hooks/useUserSecrets";
import { useWalletPool } from "@/hooks/useWalletPool";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

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
  const { secrets } = useUserSecrets();
  const [conn, setConn] = useState<Connection | null>(null);
  useEffect(() => {
    if (secrets?.rpcUrl) setConn(new Connection(secrets.rpcUrl, { commitment: "confirmed" }));
  }, [secrets?.rpcUrl]);

  // Use trading private key from secrets as primary, fall back to pool wallets
  const { wallets: poolWallets, importCustomSecrets } = useWalletPool();
  
  // Display pubkey: prioritize secrets trading key, fall back to first pool wallet
  const displayPubkey = useMemo(() => {
    if (secrets?.tradingPrivateKey) {
      try {
        // Derive pubkey from the trading private key in secrets
        let keyData;
        if (secrets.tradingPrivateKey.startsWith('[')) {
          keyData = new Uint8Array(JSON.parse(secrets.tradingPrivateKey));
        } else {
          keyData = bs58.decode(secrets.tradingPrivateKey);
        }
        const keypair = Keypair.fromSecretKey(keyData);
        return keypair.publicKey.toBase58();
      } catch {
        // Fall back to pool if secrets key is invalid
      }
    }
    return poolWallets[0]?.pubkey ?? "";
  }, [secrets?.tradingPrivateKey, poolWallets]);

  // Auto-import trading private key from secrets into wallet pool if it exists and isn't already imported
  useEffect(() => {
    if (secrets?.tradingPrivateKey && poolWallets.length === 0) {
      importCustomSecrets([secrets.tradingPrivateKey]);
    }
  }, [secrets?.tradingPrivateKey, poolWallets.length, importCustomSecrets]);

  // Live balances state
  const [tokenMint, setTokenMint] = useState<string>(secrets?.tokenMint ?? "");
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sol, setSol] = useState<number | null>(null);
  const [tokenUi, setTokenUi] = useState<number | null>(null);
  const [solUsd, setSolUsd] = useState<number | null>(null);
  const [tokenUsd, setTokenUsd] = useState<number | null>(null);
  const [usdToBuy, setUsdToBuy] = useState<string>("25");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [swapping, setSwapping] = useState(false);
  const ownerSecret = useMemo(() => secrets?.tradingPrivateKey || poolWallets[0]?.secretBase58 || "", [secrets?.tradingPrivateKey, poolWallets]);
  const [autoTrading, setAutoTrading] = useState(false);
  const autoTimer = useRef<number | null>(null);
  const autoActive = useRef(false);

  // Update tokenMint when secrets change
  useEffect(() => {
    if (secrets?.tokenMint && !tokenMint) {
      setTokenMint(secrets.tokenMint);
    }
  }, [secrets?.tokenMint, tokenMint]);

  // New BumpBot state
  const [bumpBotActive, setBumpBotActive] = useState(false);
  const [bumpBotDelaySec, setBumpBotDelaySec] = useState(3);
  const [bumpBotBuyCount, setBumpBotBuyCount] = useState(60);
  const [bumpBotCurrentCount, setBumpBotCurrentCount] = useState(0);
  const [bumpBotTransactions, setBumpBotTransactions] = useState<Array<{
    id: string;
    type: 'buy' | 'sell';
    amount: string;
    signature: string;
    timestamp: Date;
  }>>([]);
  const bumpBotTimer = useRef<number | null>(null);
  const bumpBotRunning = useRef(false);

  const refresh = useCallback(async () => {
    if (!conn || !displayPubkey) {
      console.log("Refresh blocked - Missing:", { conn: !!conn, displayPubkey: !!displayPubkey });
      return;
    }
    setLoading(true);
    try {
      const ownerPk = new PublicKey(displayPubkey);
      console.log("Refreshing balance for:", displayPubkey);
      const [lam, solPrice] = await Promise.all([
        conn.getBalance(ownerPk),
        JUP_PRICE("SOL"),
      ]);
      console.log("Balance fetched:", { lam, solPrice });
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
    } catch (e) {
      console.error("Refresh error:", e);
    }
    finally {
      setLoading(false);
    }
  }, [conn, displayPubkey, tokenMint]);

  // Auto-refresh when wallet and connection are ready
  useEffect(() => {
    if (conn && displayPubkey && secrets?.rpcUrl) {
      refresh();
    }
  }, [conn, displayPubkey, secrets?.rpcUrl, refresh]);

  // Swap actions
  const invokeSwap = useCallback(async (body: any) => {
    if (!ownerSecret) {
      toast.error("No wallet secret found. Add a wallet in Wallet Pool.");
      return { error: "no-owner" } as const;
    }
    if (!secrets?.functionToken) {
      toast.error("Function token missing. Please configure in Secrets.");
      return { error: "no-function-token" } as const;
    }
    console.log("Invoking swap with:", { 
      body: { ...body, ownerSecret: ownerSecret.slice(0, 8) + "..." }, 
      hasFunctionToken: !!secrets?.functionToken 
    });
    try {
      const headers: Record<string, string> = {};
      if (secrets?.functionToken) headers["x-function-token"] = secrets.functionToken;
      const { data, error } = await supabase.functions.invoke("raydium-swap", {
        body: { confirmPolicy: "processed", slippageBps, ownerSecret, ...body },
        headers,
      });
      if (error) {
        console.error("Swap error:", error);
        toast.error(error.message || "Swap failed");
        return { error } as const;
      }
      console.log("Swap success:", data);
      return { data } as const;
    } catch (e: any) {
      console.error("Swap exception:", e);
      toast.error(String(e?.message || e) || "Swap error");
      return { error: e } as const;
    }
  }, [ownerSecret, secrets?.functionToken, slippageBps]);

  const onBuy = useCallback(async () => {
    const mint = tokenMint.trim();
    if (!mint) return toast.error("Enter a token mint first");
    // Random USD between $0.50 and $3.00 (2 decimals)
    const usd = Math.round((0.5 + Math.random() * 2.5) * 100) / 100;
    setUsdToBuy(String(usd));
    setSwapping(true);
    const result = await invokeSwap({ side: "buy", tokenMint: mint, usdcAmount: usd, buyWithSol: true });
    setSwapping(false);
    if ((result as any).data?.signatures?.length) {
      const sig = (result as any).data.signatures[0];
      toast.success(`Buy ~$${usd.toFixed(2)} sent: ${sig.slice(0, 8)}…`);
      void refresh();
    }
  }, [tokenMint, invokeSwap, refresh]);

  const onSellAll = useCallback(async () => {
    const mint = tokenMint.trim();
    if (!mint) return toast.error("Enter a token mint first");
    setSwapping(true);
    const result = await invokeSwap({ side: "sell", tokenMint: mint, sellAll: true });
    setSwapping(false);
    if ((result as any).data?.signatures?.length) {
      const sig = (result as any).data.signatures[0];
      toast.success(`Sell sent: ${sig.slice(0, 8)}…`);
      void refresh();
    }
  }, [tokenMint, invokeSwap, refresh]);

  // BumpBot logic - buys fixed amount at regular intervals, sells after N buys
  const startBumpBot = useCallback(async () => {
    if (!tokenMint.trim()) return toast.error("Enter a token mint first");
    if (!ownerSecret) return toast.error("No wallet secret found");
    if (bumpBotRunning.current) return;
    
    bumpBotRunning.current = true;
    setBumpBotActive(true);
    setBumpBotCurrentCount(0);
    
    const addTransaction = (type: 'buy' | 'sell', amount: string, signature: string) => {
      setBumpBotTransactions(prev => {
        const newTransaction = {
          id: Math.random().toString(36).substr(2, 9),
          type,
          amount,
          signature,
          timestamp: new Date()
        };
        const updated = [newTransaction, ...prev];
        return updated.slice(0, 100); // Keep only last 100 transactions
      });
    };
    
    const doBuy = async () => {
      if (!bumpBotRunning.current) return;
      
      const usdAmount = parseFloat(usdToBuy) || 0.01;
      setSwapping(true);
      const result = await invokeSwap({ side: "buy", tokenMint: tokenMint.trim(), usdcAmount: usdAmount, buyWithSol: true });
      setSwapping(false);
      
      if ((result as any).data?.signatures?.length) {
        const sig = (result as any).data.signatures[0];
        addTransaction('buy', `$${usdAmount.toFixed(2)}`, sig);
        
        setBumpBotCurrentCount(prev => {
          const newCount = prev + 1;
          toast.success(`BumpBot Buy ${newCount}/${bumpBotBuyCount} - $${usdAmount.toFixed(2)} - ${sig.slice(0, 8)}…`);
          
          // Check if we need to sell after this buy
          if (newCount >= bumpBotBuyCount) {
            setTimeout(async () => {
              if (!bumpBotRunning.current) return;
              
              setSwapping(true);
              const sellResult = await invokeSwap({ side: "sell", tokenMint: tokenMint.trim(), sellAll: true });
              setSwapping(false);
              
              if ((sellResult as any).data?.signatures?.length) {
                const sellSig = (sellResult as any).data.signatures[0];
                addTransaction('sell', 'ALL', sellSig);
                toast.success(`BumpBot Sell All - Cycle complete - ${sellSig.slice(0, 8)}…`);
                setBumpBotCurrentCount(0); // Reset counter for next cycle
              }
              
              void refresh();
            }, 1000); // Small delay before selling
          }
          
          return newCount;
        });
        void refresh();
      }
    };
    
    // Start the buying loop
    const buyLoop = () => {
      if (!bumpBotRunning.current) return;
      
      doBuy();
      
      bumpBotTimer.current = window.setTimeout(buyLoop, bumpBotDelaySec * 1000);
    };
    
    buyLoop(); // Start immediately
    if (!running) setRunning(true);
  }, [tokenMint, ownerSecret, usdToBuy, bumpBotDelaySec, bumpBotBuyCount, invokeSwap, refresh, running]);

  const stopBumpBot = useCallback(() => {
    bumpBotRunning.current = false;
    setBumpBotActive(false);
    setBumpBotCurrentCount(0);
    if (bumpBotTimer.current) { 
      clearTimeout(bumpBotTimer.current); 
      bumpBotTimer.current = null; 
    }
  }, []);

  // Auto-trade loop (buy random $0.50–$3, sell after 3 minutes)
  const startAuto = useCallback(async () => {
    if (!tokenMint.trim()) return toast.error("Enter a token mint first");
    if (!ownerSecret) return toast.error("No wallet secret found");
    if (autoActive.current) return;
    autoActive.current = true;
    setAutoTrading(true);
    await onBuy();
    if (!autoActive.current) return;
    if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; }
    autoTimer.current = window.setTimeout(async () => {
      if (!autoActive.current) return;
      await onSellAll();
      if (!autoActive.current) return;
      await onBuy();
      if (!autoActive.current) return;
      const next = 180000;
      if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; }
      autoTimer.current = window.setTimeout(async function loop() {
        if (!autoActive.current) return;
        await onSellAll();
        if (!autoActive.current) return;
        await onBuy();
        if (!autoActive.current) return;
        const delay = 180000;
        if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; }
        autoTimer.current = window.setTimeout(loop, delay);
      }, next);
    }, 180000);
    if (!running) setRunning(true);
  }, [tokenMint, ownerSecret, onBuy, onSellAll, running]);

  const stopAuto = useCallback(() => {
    autoActive.current = false;
    setAutoTrading(false);
    if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; }
  }, []);

  useEffect(() => () => { 
    if (autoTimer.current) clearTimeout(autoTimer.current); 
    if (bumpBotTimer.current) clearTimeout(bumpBotTimer.current);
    autoActive.current = false; 
    bumpBotRunning.current = false;
  }, []);

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
    <div className="min-h-screen bg-tech-gradient relative overflow-hidden">
      {/* Tech background elements */}
      <div className="absolute inset-0 opacity-15">
        <div className="absolute top-16 left-16 code-text">boost::asio::streambuf buffer</div>
        <div className="absolute top-40 right-10 code-text">neural_network.train(epochs=1000)</div>
        <div className="absolute bottom-60 left-8 code-text">volume_simulator.run()</div>
        <div className="absolute bottom-32 right-20 code-text">swap.execute(amount, slippage)</div>
        <div className="absolute top-1/2 left-1/4 code-text opacity-50">solana.connection.getBalance()</div>
      </div>
      
      <header className="container mx-auto px-4 py-8 relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight bg-accent-gradient bg-clip-text text-transparent">
              Bump Bot
            </h1>
            <p className="text-xl text-accent mt-2">Volume Simulator & Strategy Optimizer</p>
            <p className="text-muted-foreground mt-4 max-w-2xl">
              Advanced simulation engine for DeFi volume strategies. Analyze risk parameters, 
              optimize execution timing, and validate trading algorithms before deployment.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" aria-label="Open Live Runner">
              <Button className="tech-button">
                Launch Live Runner
              </Button>
            </Link>
            <SecretsModal />
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 pb-12 relative z-10">
        {/* Live controls */}
        <section className="mb-10">
          <div className="max-w-4xl mx-auto tech-border glow-soft">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-semibold text-accent">Live Controls — Token & Wallet Balances</h2>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Token address (mint)</Label>
                  <Input 
                    placeholder="Token mint address" 
                    value={tokenMint} 
                    onChange={(e) => setTokenMint(e.target.value.trim())}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button 
                    onClick={() => {
                      console.log("Load Live Data clicked", { conn: !!conn, displayPubkey, secrets: !!secrets });
                      if (!secrets) {
                        toast.error("Please configure secrets first");
                        return;
                      }
                      if (!conn) {
                        toast.error("RPC connection not available. Check your RPC URL in secrets.");
                        return;
                      }
                      if (!displayPubkey) {
                        toast.error("No wallet available. Import a wallet first.");
                        return;
                      }
                      setRunning(true);
                      refresh();
                    }} 
                    disabled={running || !conn || !displayPubkey}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Load Live Data
                  </Button>
                  <Button 
                    variant="secondary" 
                    onClick={() => setRunning(false)} 
                    disabled={!running}
                  >
                    Stop
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-accent font-medium">Active Wallet</div>
                <div className="text-sm break-all text-muted-foreground font-mono">
                  {displayPubkey || "No wallet — use Wallet Pool to generate one"}
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                <div className="tech-border p-4 bg-card/50">
                  <div className="font-medium text-accent">SOL Balance</div>
                  <div className="text-muted-foreground">
                    {sol !== null ? sol.toFixed(6) : "…"} SOL
                    {solUsd && sol !== null ? <span className="text-accent"> • ~${(sol * solUsd).toFixed(2)}</span> : ""}
                  </div>
                </div>
                <div className="tech-border p-4 bg-card/50">
                  <div className="font-medium text-accent">Token Balance</div>
                  <div className="text-muted-foreground">
                    {tokenMint ? (tokenUi !== null ? tokenUi.toFixed(6) : "…") : "—"}
                    {tokenMint && tokenUsd && tokenUi !== null ? <span className="text-accent"> • ~${(tokenUi * tokenUsd).toFixed(2)}</span> : ""}
                  </div>
                </div>
                <div className="tech-border p-4 bg-card/50">
                  <div className="font-medium text-accent">Total Value (USD)</div>
                  <div className="text-muted-foreground">
                    {Number.isFinite(totalUsd) && totalUsd > 0 ? <span className="text-accent font-bold">${totalUsd.toFixed(2)}</span> : "…"}
                  </div>
                </div>
              </div>

              {running && <div className="text-xs text-muted-foreground">Auto-refreshing every 5s{loading ? "…" : ""}</div>}
            </div>
          </div>
        </section>

        <section className="mb-10">
          <div className="max-w-4xl mx-auto tech-border glow-soft">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-semibold text-accent">Trade Actions — Buy/Sell</h2>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2 sm:col-span-1">
                  <Label className="text-foreground">USD to buy</Label>
                  <Input 
                    type="number" 
                    min="0.5" 
                    step="0.01" 
                    value={usdToBuy} 
                    onChange={(e) => setUsdToBuy(e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-1">
                  <Label className="text-foreground">Slippage (bps)</Label>
                  <Input 
                    type="number" 
                    min="10" 
                    step="10" 
                    value={slippageBps} 
                    onChange={(e) => setSlippageBps(Math.max(1, Number(e.target.value || 0)))}
                  />
                </div>
                <div className="flex items-end gap-2 sm:col-span-1">
                  <Button 
                    onClick={onBuy} 
                    disabled={swapping || !tokenMint || !ownerSecret}
                    className="tech-button"
                  >
                    Buy
                  </Button>
                  <Button 
                    variant="secondary" 
                    onClick={onSellAll} 
                    disabled={swapping || !tokenMint || !ownerSecret}
                    className="bg-destructive hover:bg-destructive/80 text-destructive-foreground"
                  >
                    Sell All
                  </Button>
                </div>
              </div>

              {/* BumpBot Controls */}
              <div className="border-t border-border pt-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Left Column - Controls */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-accent">BumpBot Configuration</h3>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-foreground">Delay between buys (seconds)</Label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="1"
                            max="60"
                            step="1"
                            value={bumpBotDelaySec}
                            onChange={(e) => setBumpBotDelaySec(Number(e.target.value))}
                            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-muted"
                          />
                          <span className="text-sm text-muted-foreground w-12 text-right">{bumpBotDelaySec}s</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-foreground">Number of buys before selling</Label>
                        <Input 
                          type="number" 
                          min="1" 
                          step="1" 
                          value={bumpBotBuyCount} 
                          onChange={(e) => setBumpBotBuyCount(Math.max(1, Number(e.target.value || 1)))}
                        />
                      </div>
                    </div>

                    {bumpBotActive && (
                      <div className="text-sm text-accent">
                        BumpBot Active: {bumpBotCurrentCount}/{bumpBotBuyCount} buys completed
                      </div>
                    )}
                    
                    <div className="flex items-end gap-2">
                      <Button 
                        variant="default" 
                        onClick={startBumpBot} 
                        disabled={bumpBotActive || swapping || !tokenMint || !ownerSecret}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        Start BumpBot
                      </Button>
                      <Button 
                        variant="ghost" 
                        onClick={stopBumpBot} 
                        disabled={!bumpBotActive}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Stop BumpBot
                      </Button>
                    </div>
                    
                    <div className="text-xs text-muted-foreground bg-muted/20 p-3 rounded">
                      <strong>Config:</strong> Buy ${parseFloat(usdToBuy) || 0.01} every {bumpBotDelaySec}s, sell all after {bumpBotBuyCount} buys, then repeat cycle
                    </div>
                  </div>

                  {/* Right Column - Transaction History */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-accent">Transactions</h3>
                    
                    <div className="border border-border rounded-lg p-4 bg-card/20">
                      <div className="max-h-80 overflow-y-auto space-y-2">
                        {bumpBotTransactions.length === 0 ? (
                          <div className="text-center text-muted-foreground py-8">
                            No transactions yet. Start BumpBot to see history.
                          </div>
                        ) : (
                          bumpBotTransactions.slice(0, 25).map((tx) => (
                            <div key={tx.id} className="flex items-center justify-between py-2 px-3 rounded bg-muted/10 border border-muted/20">
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${tx.type === 'buy' ? 'bg-green-500' : 'bg-red-500'}`} />
                                <div className="text-sm">
                                  <span className={`font-medium ${tx.type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                                    {tx.type.toUpperCase()}
                                  </span>
                                  <span className="text-muted-foreground ml-2">{tx.amount}</span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end text-xs">
                                <span className="text-muted-foreground font-mono">
                                  {tx.signature.slice(0, 6)}...{tx.signature.slice(-4)}
                                </span>
                                <span className="text-muted-foreground">
                                  {tx.timestamp.toLocaleTimeString()}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      
                      {bumpBotTransactions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                          Showing {Math.min(bumpBotTransactions.length, 25)} of {bumpBotTransactions.length} transactions
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Auto Trading Controls */}
              <div className="border-t border-border pt-6">
                <h3 className="text-lg font-medium text-accent mb-4">Auto Trading (Random Amounts)</h3>
                <div className="flex items-end gap-2">
                  <Button 
                    variant="outline" 
                    onClick={startAuto} 
                    disabled={autoTrading || swapping || !tokenMint || !ownerSecret}
                    className="border-accent text-accent hover:bg-accent hover:text-accent-foreground"
                  >
                    Start Auto
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={stopAuto} 
                    disabled={!autoTrading}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Stop Auto
                  </Button>
                  <span className="text-xs text-muted-foreground">Random $0.50–$3 buys, sell every 3 minutes</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Uses your first Wallet Pool wallet {displayPubkey ? `(${displayPubkey.slice(0,4)}…${displayPubkey.slice(-4)})` : "(none)"}.
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <div className="tech-border glow-soft">
            <WalletPoolManager />
          </div>
        </section>
        
        <section className="mb-10">
          <div className="tech-border glow-soft">
            <VolumeSimulator />
          </div>
        </section>
      </main>
    </div>
  );
};

export default BumpBot;
