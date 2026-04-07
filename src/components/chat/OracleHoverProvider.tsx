import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

interface PeekState {
  visible: boolean;
  x: number;
  y: number;
  hint: string;
  zone: string;
}

interface OracleHoverContextType {
  peek: PeekState;
  dismissPeek: () => void;
  openChatWithContext: (hint: string) => void;
  chatContextHint: string | null;
  clearChatContext: () => void;
}

const OracleHoverContext = createContext<OracleHoverContextType | null>(null);

export const useOracleHover = () => useContext(OracleHoverContext);

const PEEK_LIMIT = 3;
const DWELL_MS = 2500;
const FADE_MS = 4000;
const SESSION_KEY = 'bb_oracle_peeks';
const DISMISS_KEY = 'bb_chat_dismissed_at';

export function OracleHoverProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [peek, setPeek] = useState<PeekState>({ visible: false, x: 0, y: 0, hint: '', zone: '' });
  const [chatContextHint, setChatContextHint] = useState<string | null>(null);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentZone = useRef<string | null>(null);
  const peekCount = useRef(0);

  const getShownZones = (): Set<string> => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'));
    } catch { return new Set(); }
  };

  const markZoneShown = (zone: string) => {
    const zones = getShownZones();
    zones.add(zone);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...zones]));
  };

  const isDismissed = () => {
    const d = localStorage.getItem(DISMISS_KEY);
    return d ? Date.now() - Number(d) < 14400_000 : false;
  };

  const dismissPeek = useCallback(() => {
    setPeek(p => ({ ...p, visible: false }));
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
  }, []);

  const openChatWithContext = useCallback((hint: string) => {
    setChatContextHint(hint);
    dismissPeek();
  }, [dismissPeek]);

  const clearChatContext = useCallback(() => setChatContextHint(null), []);

  useEffect(() => {
    if (isMobile) return;

    const handleMouseMove = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('[data-oracle-hint]') as HTMLElement | null;

      if (!target) {
        if (dwellTimer.current) {
          clearTimeout(dwellTimer.current);
          dwellTimer.current = null;
        }
        currentZone.current = null;
        return;
      }

      const hint = target.getAttribute('data-oracle-hint') || '';
      const zone = target.getAttribute('data-oracle-zone') || hint.slice(0, 30);

      if (zone === currentZone.current) return; // already tracking this zone
      currentZone.current = zone;

      if (dwellTimer.current) clearTimeout(dwellTimer.current);

      dwellTimer.current = setTimeout(() => {
        // Guards
        if (isDismissed()) return;
        if (peekCount.current >= PEEK_LIMIT) return;
        if (getShownZones().has(zone)) return;

        // Check if chat is open (look for the open panel)
        if (document.querySelector('[data-oracle-chat-open]')) return;

        const rect = target.getBoundingClientRect();
        const x = Math.min(rect.right + 8, window.innerWidth - 220);
        const y = Math.max(rect.top, 60);

        peekCount.current++;
        markZoneShown(zone);

        setPeek({ visible: true, x, y, hint, zone });

        fadeTimer.current = setTimeout(() => {
          setPeek(p => p.zone === zone ? { ...p, visible: false } : p);
        }, FADE_MS);
      }, DWELL_MS);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [isMobile]);

  return (
    <OracleHoverContext.Provider value={{ peek, dismissPeek, openChatWithContext, chatContextHint, clearChatContext }}>
      {children}
    </OracleHoverContext.Provider>
  );
}
