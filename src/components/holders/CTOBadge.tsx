import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Signal { signal: string; detail: string; at?: string }
interface CTOStatus { is_cto: boolean; signals: Signal[]; admin_override: boolean; detected_at: string }

export function CTOBadge({ tokenMint }: { tokenMint: string }) {
  const [status, setStatus] = useState<CTOStatus | null>(null);

  useEffect(() => {
    if (!tokenMint) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("token_cto_status")
        .select("is_cto, signals, admin_override, detected_at")
        .eq("token_mint", tokenMint)
        .maybeSingle();
      if (!cancelled && data?.is_cto) setStatus(data as any);
    })();
    return () => { cancelled = true; };
  }, [tokenMint]);

  if (!status) return null;
  const signals = Array.isArray(status.signals) ? status.signals : [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-yellow-400/30 to-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-semibold hover:from-amber-500/30 hover:via-yellow-400/40 hover:to-amber-500/30 transition-all shadow-[0_0_18px_rgba(251,191,36,0.35)]">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          CTO — Community Takeover
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-2">
          <div className="font-semibold text-sm">Community Takeover Signals</div>
          {status.admin_override && (
            <div className="text-[11px] text-muted-foreground italic">Curated by HoldersIntel staff.</div>
          )}
          <ul className="space-y-1.5">
            {signals.length === 0 ? (
              <li className="text-xs text-muted-foreground">No detailed signals recorded.</li>
            ) : signals.map((s, i) => (
              <li key={i} className="text-xs">
                <span className="font-medium text-amber-400">• {s.signal}</span>
                {s.detail && <span className="text-muted-foreground"> — {s.detail}</span>}
                {s.at && <span className="text-[10px] text-muted-foreground/70 ml-1">({s.at})</span>}
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}