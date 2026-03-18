import React, { useState, useEffect, useRef } from 'react';

interface TerminalLine {
  text: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'highlight';
  timestamp: number;
}

interface HackerTerminalProps {
  lines: TerminalLine[];
  visible: boolean;
  title?: string;
}

const typeColors: Record<string, string> = {
  info: 'text-green-400',
  success: 'text-emerald-300',
  warning: 'text-amber-400',
  error: 'text-red-400',
  highlight: 'text-cyan-300 font-bold',
};

const HackerTerminal = ({ lines, visible, title = 'ORACLE TRACE' }: HackerTerminalProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  if (!visible || lines.length === 0) return null;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex items-end justify-center p-4">
      <div className="pointer-events-auto w-full max-w-2xl rounded-lg border border-green-500/30 bg-black/90 backdrop-blur-sm shadow-[0_0_30px_rgba(34,197,94,0.15)] overflow-hidden">
        {/* Terminal header */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/20 border-b border-green-500/20">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500/60" />
            <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
            <div className="w-2 h-2 rounded-full bg-green-500/60" />
          </div>
          <span className="text-[10px] font-mono text-green-500/70 tracking-widest uppercase">{title}</span>
        </div>
        {/* Terminal body */}
        <div ref={scrollRef} className="p-3 max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-0.5 scrollbar-thin">
          {lines.map((line, i) => (
            <div key={i} className={`${typeColors[line.type] || 'text-green-400'} whitespace-pre-wrap`}>
              <span className="text-green-700 mr-2">{'>'}</span>
              {line.text}
            </div>
          ))}
          <div className="text-green-400">
            <span className="text-green-700 mr-2">{'>'}</span>
            {cursorVisible ? '█' : ' '}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HackerTerminal;
export type { TerminalLine };
