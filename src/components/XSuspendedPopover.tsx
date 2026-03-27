import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { XCircle } from "lucide-react";

interface XSuspendedPopoverProps {
  children: React.ReactNode;
}

export function XSuspendedPopover({ children }: XSuspendedPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          className="cursor-pointer inline-flex"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 overflow-hidden border-destructive/30 bg-card shadow-xl"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        sideOffset={8}
      >
        {/* Header bar */}
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2.5 flex items-center gap-2">
          <XCircle className="h-5 w-5 text-destructive shrink-0" />
          <span className="font-bold text-sm text-destructive">
            Uh Oh! Account Suspended 😱
          </span>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-2.5">
          <p className="text-sm text-foreground leading-relaxed">
            Our <span className="font-bold">@HoldersIntel</span> X account got suspended temporarily! 🚫🐦
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Apparently our <span className="text-foreground font-medium">AI-powered wallet bundling reports</span> and <span className="text-destructive font-semibold">Bad Dev exposés</span> pissed off the wrong people… and they reported us! 😤🤡
          </p>
          <div className="bg-muted/50 rounded-lg p-2.5 text-center space-y-1">
            <p className="text-lg">🔥🕵️ → 📊 → 😡 → 🚨 → 💀</p>
            <p className="text-[10px] text-muted-foreground italic">
              Intel so good, bad actors had to shut us down
            </p>
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5">
            <p>We're working on getting it restored.</p>
            <p>In the meantime, our <span className="text-foreground font-medium">analysis doesn't stop!</span></p>
            <div className="space-y-0.5 text-foreground font-medium">
              <p>Telegram Channel is LIVE and 24/7! 💪</p>
              <p>TelegramBot is Strong 💪</p>
              <p>Website Holders Analysis run hard 💪</p>
              <p>Website Bubblemaps is fire 🔥</p>
            </div>
            <p className="pt-1">— catch us on our Parent Twitter Account for updates!!! 🚀</p>
            <a href="https://x.com/blackbox_farm" target="_blank" rel="noopener noreferrer" className="text-primary font-bold hover:underline block">
              x.com/blackbox_farm 😎💎
            </a>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
