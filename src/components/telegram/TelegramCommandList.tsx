import React from "react";
import { Badge } from "@/components/ui/badge";

const COMMAND_GROUPS = [
  {
    label: "🔧 Setup",
    commands: [
      { cmd: "/start", desc: "Welcome & setup" },
      { cmd: "/signup", desc: "Create account via Telegram" },
      { cmd: "/register", desc: "Link your BlackBox Farm account" },
      { cmd: "/myname", desc: "Set your preferred name" },
      { cmd: "/status", desc: "Check your subscription tier" },
      { cmd: "/help", desc: "Show all commands" },
    ],
    tier: "All",
    tierClass: "text-muted-foreground border-muted-foreground/40",
  },
  {
    label: "📊 Analysis",
    commands: [
      { cmd: "/holders", alias: null, desc: "Holder distribution analysis" },
      { cmd: "/risk", alias: "/r", desc: "Composite risk & stability assessment" },
      { cmd: "/concentration", alias: "/con", desc: "Detailed holder % breakdown" },
      { cmd: "/dev", alias: "/d", desc: "Developer intel & social doxxing" },
      { cmd: "/ca", alias: null, desc: "Default holder analysis" },
      { cmd: "/quick", alias: "/q", desc: "Fast holder count & key stats" },
      { cmd: "/ai", alias: null, desc: "Descriptive AI analysis snapshot" },
    ],
    tier: "Auth+",
    tierClass: "text-green-400 border-green-400/40",
  },
  {
    label: "⚡ Advanced",
    commands: [
      { cmd: "/momentum", alias: "/m", desc: "Volume & price momentum scoring" },
      { cmd: "/insiders", alias: "/i", desc: "Insider cluster & bundling pre-check" },
      { cmd: "/compare", alias: "/cmp", desc: "Side-by-side token comparison" },
      { cmd: "/alerts", alias: null, desc: "Manage alert preferences" },
    ],
    tier: "X Sub+",
    tierClass: "text-blue-400 border-blue-400/40",
  },
  {
    label: "👑 Pro",
    commands: [
      { cmd: "/oracle", alias: "/o", desc: "Full developer reputation mesh" },
      { cmd: "/wallet", alias: "/w", desc: "Wallet behavior analysis" },
    ],
    tier: "Pro",
    tierClass: "text-yellow-400 border-yellow-400/40",
  },
];

interface TelegramCommandListProps {
  compact?: boolean;
}

export function TelegramCommandList({ compact = false }: TelegramCommandListProps) {
  return (
    <div className="rounded-xl border border-border bg-[hsl(var(--card))] overflow-hidden font-mono text-sm">
      {/* Header bar */}
      <div className="bg-blue-500/10 border-b border-border px-4 py-2.5 flex items-center gap-2">
        <span className="text-blue-400 text-base">🤖</span>
        <span className="font-semibold text-foreground text-xs tracking-wide uppercase">@holdersintel_bot — Command Reference</span>
      </div>

      <div className={compact ? "divide-y divide-border" : "divide-y divide-border"}>
        {COMMAND_GROUPS.map((group) => (
          <div key={group.label} className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{group.label}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 font-mono ${group.tierClass}`}>
                {group.tier}
              </Badge>
            </div>
            <div className="space-y-1">
              {group.commands.map((c) => (
                <div key={c.cmd} className="flex items-baseline gap-2 leading-snug">
                  <code className="text-primary font-bold shrink-0">{c.cmd}</code>
                  {"alias" in c && c.alias && (
                    <code className="text-primary/50 text-xs shrink-0">({c.alias})</code>
                  )}
                  <span className="text-muted-foreground text-xs">— {c.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2 bg-muted/30">
        <p className="text-[10px] text-muted-foreground/70 text-center">
          Higher tiers unlock deeper analysis, higher rate limits & full AI narratives
        </p>
      </div>
    </div>
  );
}
