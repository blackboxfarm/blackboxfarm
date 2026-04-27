import React, { useState } from 'react';
import { ScrollText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * "HoldersIntel Dev Team Foreward"
 * Floating icon mounted at the right edge of the nav bar. Click to open an
 * old-school terminal-styled modal with the platform thesis written by the
 * dev team.
 *
 * Pure client UI — no DB, no network.
 */
export function DevTeamForewardButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="HoldersIntel Dev Team Foreward"
              className={cn(
                'inline-flex items-center justify-center h-8 w-8 rounded-md',
                'border border-gold/40 bg-background/60 text-gold',
                'hover:bg-gold/10 hover:border-gold/70 hover:text-gold',
                'transition-colors shadow-sm',
                'focus:outline-none focus:ring-2 focus:ring-gold/50',
                className,
              )}
            >
              <ScrollText className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            HoldersIntel Dev Team Foreward
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl border-gold/40 bg-[#0a0a0a] p-0 overflow-hidden">
          {/* Hidden semantic title/description for a11y */}
          <DialogTitle className="sr-only">
            HoldersIntel Dev Team Foreward
          </DialogTitle>
          <DialogDescription className="sr-only">
            A short note from the HoldersIntel development team explaining
            what the platform is and how it works.
          </DialogDescription>

          {/* Terminal chrome */}
          <div className="font-mono text-[hsl(140_60%_75%)]">
            {/* Title bar */}
            <div className="flex items-center justify-between border-b border-gold/30 bg-[#111] px-4 py-2 text-xs text-gold/80">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500/70" />
                <span className="ml-3 tracking-widest uppercase">
                  holdersintel://foreward
                </span>
              </div>
              <span className="hidden sm:inline text-[10px] opacity-60">
                read-only · v1.0
              </span>
            </div>

            {/* Body */}
            <div className="px-5 py-5 text-[13px] leading-relaxed">
              <div className="text-gold/80 mb-2">
                {'> cat /var/holdersintel/foreward.txt'}
              </div>
              <div className="text-gold/40 mb-3 select-none">
                ============================================================
              </div>

              <pre className="whitespace-pre-wrap font-mono text-[hsl(140_60%_78%)]">
{`HoldersIntel is a Reputation Engine.

Primary entities: Creator Profiles ↔ Token Projects
(many-to-many, cross-linked on many signals)

The lifecycle outcome of a Token Project
(success/failure, intentional/accidental)
is evidence that updates the Creator's reputation.

Data is collected from many sources
(on-chain, X, Telegram, web scrapes, KYC traces,
behavioral analysis).

Data is displayed across many surfaces
(web reports, Bubble Map, Telegram bot DMs/groups,
Intel Briefings, Live Feed).

Monetization: monthly subscription unlocks the
full pipeline.`}
              </pre>

              <div className="text-gold/40 mt-4 select-none">
                ============================================================
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-gold/50">[ESC] to close</span>
                <span className="text-gold/80">
                  &mdash; HoldersIntel Dev Team
                </span>
              </div>
              <div className="mt-3 flex items-center text-gold/70">
                <span>{'>'}</span>
                <span className="ml-1 inline-block h-3.5 w-2 bg-gold/70 animate-pulse" />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DevTeamForewardButton;