import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Copy, ExternalLink, Eye, EyeOff, KeyRound } from "lucide-react";

export type WaterfallWallet = {
  id: string;
  column_index: number;
  row_index: number;
  nickname: string | null;
  pubkey: string;
  sol_balance: number;
  last_balance_at: string | null;
};

export type TokenHolding = { mint: string; amount: number; decimals: number };

export function WaterfallWalletDrawer({
  wallet, tokens, solUsd, onClose, onRename, onWithdrawComplete,
}: {
  wallet: WaterfallWallet | null;
  tokens: TokenHolding[];
  solUsd: number;
  onClose: () => void;
  onRename: (id: string, nickname: string) => void;
  onWithdrawComplete: () => void;
}) {
  return (
    <Sheet open={!!wallet} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {wallet && (
          <DrawerBody
            key={wallet.id}
            wallet={wallet}
            tokens={tokens}
            solUsd={solUsd}
            onRename={onRename}
            onWithdrawComplete={onWithdrawComplete}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  wallet, tokens, solUsd, onRename, onWithdrawComplete,
}: {
  wallet: WaterfallWallet;
  tokens: TokenHolding[];
  solUsd: number;
  onRename: (id: string, nickname: string) => void;
  onWithdrawComplete: () => void;
}) {
  const [selectedMint, setSelectedMint] = useState<string>("SOL");
  const [amount, setAmount] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [nickname, setNickname] = useState(wallet.nickname ?? "");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => () => { if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current); }, []);

  const hideKey = () => {
    setRevealedKey(null);
    if (hideTimerRef.current) { window.clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  };

  const revealKey = async () => {
    if (!confirm(`Reveal the PRIVATE KEY for Waterfall ${wallet.column_index + 1} · Wallet ${wallet.row_index + 1}?\n\nAnyone who sees your screen will be able to drain this wallet. Are you sure?`)) return;
    setRevealing(true);
    const { data, error } = await supabase.functions.invoke("export-wallet-key", {
      body: { wallet_id: wallet.id, source: "waterfall_wallets" },
    });
    setRevealing(false);
    if (error || !(data as any)?.secret_key) {
      return toast({ title: "Reveal failed", description: error?.message || "No key returned", variant: "destructive" });
    }
    setRevealedKey((data as any).secret_key as string);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setRevealedKey(null), 60_000);
  };

  const handleWithdraw = async () => {
    if (!destination || destination.length < 32 || destination.length > 44) {
      return toast({ title: "Invalid destination", variant: "destructive" });
    }
    const amt = amount === "MAX" ? -1 : Number(amount);
    if (amount !== "MAX" && !(amt > 0)) return toast({ title: "Enter amount", variant: "destructive" });
    if (!confirm(`Send ${amount === "MAX" ? "all available" : amount} ${selectedMint === "SOL" ? "SOL" : "tokens"} to ${destination}?`)) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("waterfall-withdraw", {
      body: { walletId: wallet.id, mint: selectedMint, amount: amt, destination },
    });
    setSubmitting(false);
    if (error) return toast({ title: "Withdraw failed", description: error.message, variant: "destructive" });
    toast({ title: "Sent!", description: `Tx: ${(data as any)?.signature?.slice(0, 16)}…` });
    setAmount("");
    setDestination("");
    onWithdrawComplete();
  };

  return (
    <>
      <SheetHeader>
              <SheetTitle>
                Waterfall {wallet.column_index + 1} · Wallet {wallet.row_index + 1}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs break-all">
                {wallet.pubkey}
                <button onClick={() => { navigator.clipboard.writeText(wallet.pubkey); toast({ title: "Copied" }); }} className="ml-2 inline-flex">
                  <Copy className="h-3 w-3" />
                </button>
                <a href={`https://solscan.io/account/${wallet.pubkey}`} target="_blank" rel="noreferrer" className="ml-1 inline-flex">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 mt-5">
              <div className="space-y-1">
                <Label className="text-xs">Nickname</Label>
                <div className="flex gap-2">
                  <Input value={nickname} onChange={(e) => setNickname(e.target.value)} className="h-8" />
                  <Button size="sm" variant="outline" onClick={() => onRename(wallet.id, nickname)}>Save</Button>
                </div>
              </div>

              <div className="rounded border p-3 space-y-2">
                <div className="text-xs text-muted-foreground">Holdings</div>
                <div className="flex justify-between text-sm">
                  <span>SOL</span>
                  <span className="font-mono">
                    {Number(wallet.sol_balance).toFixed(6)}
                    {solUsd > 0 && <span className="text-muted-foreground ml-2">${(Number(wallet.sol_balance) * solUsd).toFixed(2)}</span>}
                  </span>
                </div>
                {tokens.length === 0 && <div className="text-xs text-muted-foreground">No SPL tokens.</div>}
                {tokens.map((t) => (
                  <div key={t.mint} className="flex justify-between text-xs">
                    <a href={`https://solscan.io/token/${t.mint}`} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                      {t.mint.slice(0, 6)}…{t.mint.slice(-4)}
                    </a>
                    <span className="font-mono">{t.amount}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-3 rounded border p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Withdraw</div>
                <div className="space-y-1">
                  <Label className="text-xs">Token</Label>
                  <Select value={selectedMint} onValueChange={setSelectedMint}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SOL">SOL</SelectItem>
                      {tokens.map((t) => (
                        <SelectItem key={t.mint} value={t.mint}>
                          {t.mint.slice(0, 6)}…{t.mint.slice(-4)} ({t.amount})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount</Label>
                  <div className="flex gap-2">
                    <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-8" />
                    {selectedMint === "SOL" && (
                      <Button size="sm" variant="outline" onClick={() => setAmount("MAX")}>Max</Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Destination wallet</Label>
                  <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Solana address" className="h-8 font-mono text-xs" />
                </div>
                <Button onClick={handleWithdraw} disabled={submitting} className="w-full">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Send
                </Button>
              </div>

              <div className="space-y-2 rounded border border-destructive/40 p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <KeyRound className="h-3 w-3" /> Private Key
                </div>
                {!revealedKey ? (
                  <Button
                    onClick={revealKey}
                    disabled={revealing}
                    variant="outline"
                    size="sm"
                    className="w-full border-destructive/60 text-destructive hover:bg-destructive/10"
                  >
                    {revealing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                    Show Private Key
                  </Button>
                ) : (
                  <>
                    <Input readOnly value={revealedKey} className="h-8 font-mono text-[10px]" onFocus={(e) => e.currentTarget.select()} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => { navigator.clipboard.writeText(revealedKey); toast({ title: "Key copied" }); }}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={hideKey}>
                        <EyeOff className="h-3 w-3 mr-1" /> Hide
                      </Button>
                    </div>
                    <div className="text-[10px] text-muted-foreground">Auto-hides in 60 seconds.</div>
                  </>
                )}
              </div>
            </div>
    </>
  );
}