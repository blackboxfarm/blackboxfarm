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
    const t2 = setTimeout(() => setPhase('exit'), 6500);
    const t3 = setTimeout(onDone, 7000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      className={cn(
        "absolute pointer-events-none transition-all duration-300 ease-out",
        phase === 'enter' && "opacity-0 translate-y-2 scale-90",
        phase === 'visible' && "opacity-100 translate-y-0 scale-100",
        phase === 'exit' && "opacity-0 -translate-y-1 scale-95"
      )}
      style={{ bottom: 'calc(100% - 6px)', left: 'calc(100% - 10px)' }}
    >
      {/* Cloud-shaped thought bubble */}
      <div
        className="relative min-w-[150px] max-w-[520px] whitespace-normal bg-[#f5f5f0] border border-black rounded-[20px] px-4 py-2 text-black font-medium shadow-lg"
        style={{ fontFamily: "'Comic Sans MS', 'Comic Sans', cursive", fontSize: '11px' }}
      >
        {/* Cloud puffs — decorative circles on corners */}
        <div className="absolute -top-1.5 left-3 w-4 h-4 rounded-full bg-[#f5f5f0] border border-black" />
        <div className="absolute -top-1 right-5 w-3 h-3 rounded-full bg-[#f5f5f0] border border-black" />
        <div className="absolute -top-0.5 left-8 w-3.5 h-3.5 rounded-full bg-[#f5f5f0] border border-black" />
        <div className="absolute -bottom-1 right-3 w-3 h-3 rounded-full bg-[#f5f5f0] border border-black" />
        <div className="absolute -bottom-1.5 left-5 w-4 h-4 rounded-full bg-[#f5f5f0] border border-black" />
        {/* Inner fill to cover puff borders inside the bubble */}
        <div className="absolute inset-[1px] rounded-[19px] bg-[#f5f5f0] -z-0" />
        <span className="relative z-10">{text}</span>
        {/* Tail dots — bottom-left pointing toward FAB */}
        <div className="absolute -bottom-3 left-2 w-2.5 h-2.5 rounded-full bg-[#f5f5f0] border border-black" />
        <div className="absolute -bottom-5 left-0.5 w-1.5 h-1.5 rounded-full bg-[#f5f5f0] border border-black" />
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

/** Dispatch a thought bubble with custom arbitrary text. */
export function dispatchThoughtCustom(text: string) {
  window.dispatchEvent(new CustomEvent('signal-thought', { detail: { text } }));
}
