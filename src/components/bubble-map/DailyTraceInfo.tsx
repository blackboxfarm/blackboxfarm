import React, { useState } from 'react';
import { Info, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

function ExplainerBody({ onCta }: { onCta?: () => void }) {
  const navigate = useNavigate();
  const go = (path: string) => {
    onCta?.();
    navigate(path);
  };
  return (
    <div className="space-y-3 text-sm">
      <p className="text-foreground">
        One click of the <strong>Trace</strong> button on a token, wallet, or @handle =
        your daily counter ticks up by <strong>1</strong>. That's it.
      </p>
      <div>
        <p className="text-foreground font-semibold mb-1">After that initial Trace, on the same target you can freely:</p>
        <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
          <li>Click <strong>Find KYC Root</strong> (deep genealogy hop search)</li>
          <li>Click <strong>Map X Community</strong> (social discovery)</li>
          <li>Toggle <strong>Prune / Branches / Solar Min / Solar Cluster</strong></li>
          <li>Pan, zoom, click nodes, open the <strong>Hacker Terminal</strong></li>
        </ul>
      </div>
      <div className="rounded-md border border-border bg-muted/30 p-2.5">
        <p className="font-semibold text-foreground mb-1">Daily limits</p>
        <ul className="space-y-0.5 text-muted-foreground">
          <li>Anonymous: <strong className="text-foreground">1</strong> Trace / day</li>
          <li>Signed-in Free: <strong className="text-foreground">3</strong> Traces / day</li>
          <li>Subscriber: <strong className="text-gold">Unlimited</strong></li>
        </ul>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => go('/auth')}>
          Sign Up Free → 3/day
        </Button>
        <Button size="sm" className="flex-1 text-xs gap-1 bg-gold text-gold-foreground hover:bg-gold/90" onClick={() => go('/subscriptions')}>
          <Crown className="h-3 w-3" /> Unlimited
        </Button>
      </div>
    </div>
  );
}

interface Props {
  /** "icon" = compact info button; "text" = small text link */
  variant?: 'icon' | 'text';
  className?: string;
  label?: string;
}

/**
 * Hover-on-desktop, tap-to-open-modal explainer for the Bubble Map daily Trace quota.
 */
export function DailyTraceInfo({ variant = 'icon', className, label = 'What counts as "1 use"?' }: Props) {
  const [open, setOpen] = useState(false);

  const trigger = variant === 'icon' ? (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      className={`inline-flex items-center justify-center h-6 w-6 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-gold/60 transition-colors ${className ?? ''}`}
    >
      <Info className="h-3.5 w-3.5" />
    </button>
  ) : (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      className={`inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ${className ?? ''}`}
    >
      <Info className="h-3 w-3" /> {label}
    </button>
  );

  return (
    <>
      <HoverCard openDelay={150}>
        <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
        <HoverCardContent className="w-80" align="start">
          <p className="font-semibold text-foreground mb-2">{label}</p>
          <ExplainerBody />
        </HoverCardContent>
      </HoverCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>How the daily Bubble Map quota works.</DialogDescription>
          </DialogHeader>
          <ExplainerBody onCta={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DailyTraceInfo;
