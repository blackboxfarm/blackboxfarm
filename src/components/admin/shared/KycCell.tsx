import { useState } from "react";
import { ExternalLink, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runFindKyc, type KycResult } from "./findDevKyc";

type Props = {
  devWallet?: string | null;
  kycVerified?: boolean | null;
  kycRootWallet?: string | null;
  kycRootLabel?: string | null;
  /** Legacy fallback when richer fields aren't on the row. e.g. "cex_chain:Binance". */
  kycSource?: string | null;
  onResolved?: (kyc: KycResult) => void;
};

const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function parseLegacyLabel(src?: string | null): string | null {
  if (!src) return null;
  const idx = src.indexOf(":");
  return idx >= 0 ? src.slice(idx + 1).trim() || null : null;
}

export function KycCell({
  devWallet,
  kycVerified,
  kycRootWallet,
  kycRootLabel,
  kycSource,
  onResolved,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [localKyc, setLocalKyc] = useState<KycResult | null>(null);

  const effectiveRoot = localKyc?.kycRoot ?? kycRootWallet ?? null;
  const effectiveLabel =
    localKyc?.kycRootLabel ?? kycRootLabel ?? parseLegacyLabel(kycSource);
  const verified = !!kycVerified || !!localKyc?.kycRoot;

  // Already-known KYC: render label + truncated root address (if any)
  if (verified) {
    const rootValid = effectiveRoot && SOLANA_ADDR.test(effectiveRoot);
    return (
      <div className="flex flex-col leading-tight">
        <span className="text-[11px] font-semibold text-emerald-300">
          {effectiveLabel || "Verified"}
        </span>
        {rootValid ? (
          <a
            href={`https://solscan.io/account/${effectiveRoot}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
          >
            {effectiveRoot.slice(0, 6)}…{effectiveRoot.slice(-4)}
            <ExternalLink className="h-2 w-2 shrink-0" />
          </a>
        ) : (
          <span className="text-[9px] text-muted-foreground">root unknown</span>
        )}
      </div>
    );
  }

  // Dev wallet known but no KYC yet → Find KYC button
  if (devWallet && SOLANA_ADDR.test(devWallet)) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        className="h-6 px-2 text-[10px] gap-1 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-200"
        onClick={async (e) => {
          e.stopPropagation();
          setBusy(true);
          try {
            const kyc = await runFindKyc({
              devWallet,
              onKycResolved: (k) => {
                setLocalKyc(k);
                onResolved?.(k);
              },
            });
            if (kyc) onResolved?.(kyc);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
        {busy ? "Tracing…" : "Find KYC"}
      </Button>
    );
  }

  return <span className="text-muted-foreground text-xs">—</span>;
}