import React from 'react';
import { createPortal } from 'react-dom';
import { useOracleHover } from './OracleHoverProvider';
import oracleAvatar from '@/assets/oracle-avatar.png';

export function OraclePeek() {
  const ctx = useOracleHover();
  if (!ctx || !ctx.peek.visible) return null;

  const { peek, openChatWithContext } = ctx;

  return createPortal(
    <button
      onClick={() => openChatWithContext(peek.hint)}
      className="fixed z-[60] flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300 cursor-pointer group"
      style={{ top: peek.y, left: peek.x }}
      aria-label="Ask The Signal"
    >
      <div className="w-10 h-10 rounded-full overflow-hidden shadow-lg ring-2 ring-primary/40 group-hover:ring-primary/70 transition-all group-hover:scale-110">
        <img src={oracleAvatar} alt="Oracle" className="w-full h-full object-cover" />
      </div>
      <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-xl max-w-[180px]">
        <p className="text-xs text-foreground leading-snug">{peek.hint}</p>
      </div>
    </button>,
    document.body
  );
}
