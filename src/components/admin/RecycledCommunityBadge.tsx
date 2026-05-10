import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Lock, ShieldAlert } from "lucide-react";
import { useUserTier } from "@/hooks/useUserTier";

export interface RecycledCommunityScore {
  score: number | null;
  band: "clean" | "suspicious" | "likely" | "confirmed" | null;
  signals?: Array<{ key: string; label: string; fired: boolean; detail: string; points: number }> | null;
  evaluated_at?: string | null;
}

const BAND_STYLE: Record<NonNullable<RecycledCommunityScore["band"]>, { emoji: string; cls: string; label: string }> = {
  clean:      { emoji: "🟢", cls: "bg-emerald-700/70 text-white",    label: "Clean" },
  suspicious: { emoji: "⚠",  cls: "bg-yellow-600/80 text-white",     label: "Suspicious" },
  likely:     { emoji: "🟠", cls: "bg-orange-600/80 text-white",     label: "Likely Recycled" },
  confirmed:  { emoji: "🔴", cls: "bg-red-700/80 text-white",        label: "Confirmed Recycle" },
};

export function RecycledCommunityBadge({ data }: { data: RecycledCommunityScore | null | undefined }) {
  const { tierInfo, isPro } = useUserTier();
  const isPaid = isPro || tierInfo.isXSubscriber;

  if (!data || data.band == null) {
    return (
      <span className="text-[9px] text-muted-foreground">no score</span>
    );
  }

  // Locked variant — non-paid users see only that a score exists, never the value
  if (!isPaid) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[10px] gap-0.5 border-amber-500/50 text-amber-400">
              <Lock className="h-2.5 w-2.5" />
              Recycle Score
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[260px]">
            <div className="font-semibold mb-1">Recycled-Community Score — Pro feature</div>
            <div className="text-muted-foreground">
              Detects bad-actor devs reusing one X Community across many launches. Upgrade to see the score and signal breakdown.
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const style = BAND_STYLE[data.band];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`text-[10px] gap-0.5 ${style.cls}`}>
            <ShieldAlert className="h-2.5 w-2.5" />
            {style.emoji} {data.score ?? "?"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[320px]">
          <div className="font-semibold mb-1">{style.label} ({data.score}/100)</div>
          {data.signals && data.signals.length > 0 ? (
            <ul className="space-y-0.5">
              {data.signals.map((s) => (
                <li
                  key={s.key}
                  className={s.fired ? "text-amber-300" : "text-muted-foreground"}
                >
                  {s.fired ? "▪" : "·"} {s.label}: {s.detail} {s.fired ? `(+${s.points})` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-muted-foreground">No signal breakdown available.</div>
          )}
          {data.evaluated_at && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Evaluated {new Date(data.evaluated_at).toLocaleString()}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}