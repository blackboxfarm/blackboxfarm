import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface AvatarThoughtBubbleProps {
  text: string;
  onDone: () => void;
}

export function AvatarThoughtBubble({ text, onDone }: AvatarThoughtBubbleProps) {
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('visible'), 50);
    const t2 = setTimeout(() => setPhase('exit'), 4800);
    const t3 = setTimeout(onDone, 5200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      className={cn(
        "absolute -top-14 -left-2 pointer-events-none transition-all duration-300 ease-out",
        phase === 'enter' && "opacity-0 translate-y-2 scale-90",
        phase === 'visible' && "opacity-100 translate-y-0 scale-100",
        phase === 'exit' && "opacity-0 -translate-y-1 scale-95"
      )}
    >
      {/* Thought bubble */}
      <div className="relative bg-background/95 backdrop-blur-sm border border-border/60 rounded-xl px-3 py-1.5 text-xs text-foreground/80 font-medium shadow-lg whitespace-nowrap">
        {text}
        {/* Tail dots */}
        <div className="absolute -bottom-2 left-4 w-2 h-2 rounded-full bg-background/95 border border-border/60" />
        <div className="absolute -bottom-4 left-3 w-1.5 h-1.5 rounded-full bg-background/90 border border-border/50" />
      </div>
    </div>
  );
}

// Quip pools by category
const QUIPS: Record<string, string[]> = {
  trace_start: ['tracing...', 'on it', 'digging...', 'scanning...'],
  discovery: ['interesting...', 'ooh', 'new data :)', 'found something'],
  success: ['got it', 'nice...', 'found one', 'bingo'],
  cold_trail: ['hmm...', 'cold trail', 'deeper...', 'dead end?'],
  general: ['yep, yep', 'watching...', 'noted', '👀'],
  community: ['social scan...', 'checking X...', 'who\'s talking?'],
};

export function pickQuip(category: keyof typeof QUIPS): string {
  const pool = QUIPS[category] || QUIPS.general;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Dispatch a thought bubble event. Call from anywhere. */
export function dispatchThought(category: string) {
  const text = pickQuip(category as any);
  window.dispatchEvent(new CustomEvent('signal-thought', { detail: { text } }));
}
