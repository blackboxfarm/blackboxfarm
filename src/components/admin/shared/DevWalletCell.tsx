import { useState } from "react";
import { ExternalLink, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runFindDevAndKyc, type KycResult } from "./findDevKyc";

type Props = {
  tokenMint: string;
  symbol?: string | null;
  devWallet?: string | null;
  onResolved?: (devWallet: string, kyc: KycResult | null) => void;
};

const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function DevWalletCell({ tokenMint, symbol, devWallet, onResolved }: Props) {
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const wallet = local ?? (devWallet || null);
  const looksValid = typeof wallet === "string" && SOLANA_ADDR.test(wallet);

  if (looksValid && wallet) {
    return (
      <a
        href={`https://solscan.io/account/${wallet}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 font-mono text-xs text-blue-400 hover:text-blue-300"
      >
        {wallet.slice(0, 6)}…{wallet.slice(-4)}
        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
      </a>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      className="h-6 px-2 text-[10px] gap-1 border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          const res = await runFindDevAndKyc({
            tokenMint,
            symbol,
            onDevResolved: (dw) => setLocal(dw),
          });
          if (res.devWallet) onResolved?.(res.devWallet, res.kyc);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
      {busy ? "Hunting…" : "Find Dev & KYC"}
    </Button>
  );
}