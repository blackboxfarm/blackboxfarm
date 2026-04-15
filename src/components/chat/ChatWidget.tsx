import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Trash2, Loader2, AlertCircle, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { useChatStream } from './useChatStream';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';
import oracleAvatar from '@/assets/oracle-avatar.png';
import { useOracleHover } from './OracleHoverProvider';
import { useIsMobile } from '@/hooks/use-mobile';
import { AvatarThoughtBubble } from './AvatarThoughtBubble';
import { usePageNudgeOrchestrator } from '@/hooks/usePageNudgeOrchestrator';

// Pages where the widget should NOT appear
const HIDDEN_PAGES = ['/checkout', '/payment'];
// Pages where it should always be available (feature pages)
const PRIORITY_PAGES = ['/holders', '/oracle', '/bubblemap', '/intel', '/feed'];

const DISMISS_KEY = 'bb_chat_dismissed_at';
const VISITS_KEY = 'bb_chat_visits';
const FAB_SHOWN_KEY = 'bb_chat_fab_shown';

const FAB_POS_KEY = 'bb_chat_fab_pos';

function loadFabPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(FAB_POS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const [fabVisible, setFabVisible] = useState(false);
  const [fabPulsing, setFabPulsing] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(loadFabPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const { messages, isStreaming, error, sendMessage, clearChat, tier } = useChatStream();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const oracleCtx = useOracleHover();
  const isMobile = useIsMobile();
  const [thoughtText, setThoughtText] = useState<string | null>(null);
  const [nudgesEnabled, setNudgesEnabled] = useState(true);
  const [navFabStyle, setNavFabStyle] = useState<React.CSSProperties | undefined>(undefined);

  // Measure nav bar position for desktop FAB default placement
  useEffect(() => {
    if (isMobile || fabPos) return;
    const measure = () => {
      const nav = document.querySelector('nav.flex.items-center');
      if (!nav) return;
      const rect = nav.getBoundingClientRect();
      // Position FAB vertically centered with nav, horizontally right after last child
      const lastChild = nav.lastElementChild as HTMLElement | null;
      const left = lastChild ? lastChild.getBoundingClientRect().right + 12 : rect.right + 12;
      const top = rect.top + (rect.height - 56) / 2; // 56 = w-14 FAB size
      setNavFabStyle({ position: 'fixed', left, top, bottom: 'auto', right: 'auto' });
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [isMobile, fabPos]);

  // Sitewide page nudge orchestrator
  usePageNudgeOrchestrator({ nudgesEnabled, isOpen, fabVisible });

  // Listen for thought bubble events from BubbleMap etc. (only when nudges enabled)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.text && fabVisible && !isOpen && nudgesEnabled) {
        setThoughtText(detail.text);
      }
    };
    window.addEventListener('signal-thought', handler);
    return () => window.removeEventListener('signal-thought', handler);
  }, [fabVisible, isOpen, nudgesEnabled]);

  // Keyboard shortcuts: Ctrl+Space or "/" to toggle AI nudge bubbles
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Space toggle
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        setNudgesEnabled(prev => {
          const next = !prev;
          if (!next) setThoughtText(null);
          // Brief feedback via thought bubble (uses raw setState, not dispatch)
          setTimeout(() => setThoughtText(next ? '💬 nudges on' : '🔇 nudges off'), 50);
          setTimeout(() => setThoughtText(null), 2000);
          return next;
        });
        return;
      }
      // "/" toggle — only when not typing in an input/textarea
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setNudgesEnabled(prev => {
          const next = !prev;
          if (!next) setThoughtText(null);
          setTimeout(() => setThoughtText(next ? '💬 nudges on' : '🔇 nudges off'), 50);
          setTimeout(() => setThoughtText(null), 2000);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Mobile: Triple-tap bottom-right corner to summon Oracle
  useEffect(() => {
    if (!isMobile) return;
    const taps: number[] = [];
    const ZONE_SIZE = 80;
    const TAP_WINDOW = 800;

    const handleTouch = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const inZone = touch.clientX > window.innerWidth - ZONE_SIZE && touch.clientY > window.innerHeight - ZONE_SIZE;
      if (!inZone) { taps.length = 0; return; }
      const now = Date.now();
      taps.push(now);
      // Keep only taps within window
      while (taps.length > 0 && now - taps[0] > TAP_WINDOW) taps.shift();
      if (taps.length >= 3) {
        taps.length = 0;
        localStorage.removeItem(DISMISS_KEY);
        setFabVisible(true);
        setIsOpen(true);
      }
    };
    window.addEventListener('touchend', handleTouch, { passive: true });
    return () => window.removeEventListener('touchend', handleTouch);
  }, [isMobile]);

  // Mobile: Shake-to-summon Oracle
  useEffect(() => {
    if (!isMobile) return;
    const THRESHOLD = 15;
    const SHAKE_WINDOW = 1000;
    const REQUIRED_SPIKES = 3;
    const spikes: number[] = [];
    let lastX = 0, lastY = 0, lastZ = 0, initialized = false;

    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      if (!initialized) {
        lastX = acc.x; lastY = acc.y; lastZ = acc.z;
        initialized = true;
        return;
      }
      const deltaX = Math.abs(acc.x - lastX);
      const deltaY = Math.abs(acc.y - lastY);
      const deltaZ = Math.abs(acc.z - lastZ);
      lastX = acc.x; lastY = acc.y; lastZ = acc.z;

      if (deltaX > THRESHOLD || deltaY > THRESHOLD || deltaZ > THRESHOLD) {
        const now = Date.now();
        spikes.push(now);
        while (spikes.length > 0 && now - spikes[0] > SHAKE_WINDOW) spikes.shift();
        if (spikes.length >= REQUIRED_SPIKES) {
          spikes.length = 0;
          localStorage.removeItem(DISMISS_KEY);
          setFabVisible(true);
          setIsOpen(true);
        }
      }
    };
    window.addEventListener('devicemotion', handleMotion, { passive: true });
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [isMobile]);

  // Keyboard shortcut: Ctrl+Shift+O (Cmd+Shift+O on Mac) to summon Oracle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
        e.preventDefault();
        localStorage.removeItem(DISMISS_KEY);
        setFabVisible(true);
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Footer / external summon event listener
  useEffect(() => {
    const handler = () => {
      localStorage.removeItem(DISMISS_KEY);
      setFabVisible(true);
      setIsOpen(true);
    };
    window.addEventListener('oracle-summon', handler);
    return () => window.removeEventListener('oracle-summon', handler);
  }, []);

  // URL param reset: ?reset_chat=1 or ?from_oracle=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset_chat') === '1') {
      localStorage.removeItem(DISMISS_KEY);
      setFabVisible(true);
    }
    if (params.get('from_oracle') === '1') {
      localStorage.removeItem(DISMISS_KEY);
      setFabVisible(true);
      setTimeout(() => {
        setIsOpen(true);
        sendMessage(`[The user just navigated to ${location.pathname} via an Oracle link. Briefly greet them and point out they can scroll through the results. Keep it to 1-2 sentences, be unobtrusive.]`);
      }, 1500);
    }
  }, []);

  // Open chat when Oracle hover context hint is set
  useEffect(() => {
    if (oracleCtx?.chatContextHint && !isOpen) {
      setIsOpen(true);
      const hint = oracleCtx.chatContextHint;
      oracleCtx.clearChatContext();
      setTimeout(() => {
        sendMessage(`[The user was looking at: ${hint}] — help them with this.`);
      }, 300);
    }
  }, [oracleCtx?.chatContextHint]);

  // Smart appearance logic
  useEffect(() => {
    const currentPath = location.pathname;

    // Never show on hidden pages
    if (HIDDEN_PAGES.some(p => currentPath.startsWith(p))) {
      setFabVisible(false);
      return;
    }

    // Check if user dismissed within last 4 hours
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - Number(dismissedAt) < 14400_000) {
      setFabVisible(false);
      return;
    }

    // Priority pages: show immediately
    if (PRIORITY_PAGES.some(p => currentPath.startsWith(p))) {
      setFabVisible(true);
      return;
    }

    // Track page visits
    const visits = Number(sessionStorage.getItem(VISITS_KEY) || '0') + 1;
    sessionStorage.setItem(VISITS_KEY, String(visits));

    // Show after 2+ page visits
    if (visits >= 2) {
      setFabVisible(true);
      return;
    }

    // Show after 30 seconds on site
    const timer = setTimeout(() => setFabVisible(true), 30_000);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Gentle pulse on first appearance only
  useEffect(() => {
    if (fabVisible && !localStorage.getItem(FAB_SHOWN_KEY)) {
      setFabPulsing(true);
      localStorage.setItem(FAB_SHOWN_KEY, '1');
      const timer = setTimeout(() => setFabPulsing(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [fabVisible]);

  // Mobile scroll collapse
  useEffect(() => {
    if (isOpen) return; // only for FAB
    const handleScroll = () => {
      setIsScrolling(true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 1000);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [isOpen]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    if (!isOpen && messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      setHasUnread(true);
    }
  }, [messages, isOpen]);

  // Drag-to-reposition FAB
  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = Math.abs(e.clientX - dragRef.current.startX);
    const dy = Math.abs(e.clientY - dragRef.current.startY);
    if (dx > 5 || dy > 5) setIsDragging(true);
    if (isDragging || dx > 5 || dy > 5) {
      const newX = dragRef.current.origX + (e.clientX - dragRef.current.startX);
      const newY = dragRef.current.origY + (e.clientY - dragRef.current.startY);
      const clamped = {
        x: Math.max(8, Math.min(window.innerWidth - 64, newX)),
        y: Math.max(8, Math.min(window.innerHeight - 64, newY)),
      };
      setFabPos(clamped);
    }
  };

  const handlePointerUp = () => {
    if (isDragging && fabPos) {
      localStorage.setItem(FAB_POS_KEY, JSON.stringify(fabPos));
    }
    if (!isDragging) {
      setIsOpen(true);
    }
    setIsDragging(false);
    dragRef.current = null;
  };

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput('');
  };

  const handleClose = () => {
    setIsOpen(false);
    // Just close the panel — FAB stays visible for easy re-opening
  };

  const handleDismiss = () => {
    setIsOpen(false);
    // Remember dismissal for 4 hours (not 24)
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setFabVisible(false);
  };

  const tierLabel = tier === 'paid' ? 'Pro' : tier === 'free' ? 'Free' : 'Guest';
  const tierColor = tier === 'paid' ? 'bg-primary/20 text-primary' : tier === 'free' ? 'bg-accent/20 text-accent-foreground' : 'bg-muted text-muted-foreground';

  // Don't render anything if not visible and not open
  if (!fabVisible && !isOpen) return null;

  return (
    <>
      {/* FAB Button — draggable */}
      {!isOpen && fabVisible && (
        <div
          style={fabPos ? { position: 'fixed', left: fabPos.x, top: fabPos.y, bottom: 'auto', right: 'auto' } : (!isMobile && navFabStyle ? navFabStyle : undefined)}
          className={cn(
            "z-50 touch-none select-none",
            !fabPos && (isMobile ? "fixed bottom-5 right-5" : (!navFabStyle ? "fixed top-[95px] right-4" : "")),
          )}
        >
          {/* Thought bubble — rendered outside the overflow-hidden button */}
          {thoughtText && (
            <AvatarThoughtBubble text={thoughtText} onDone={() => setThoughtText(null)} />
          )}
          <button
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={cn(
              "rounded-full shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center overflow-hidden oracle-fab-float",
              isScrolling ? "w-10 h-10 opacity-60" : "w-14 h-14",
              fabPulsing && "animate-pulse",
              isDragging && "cursor-grabbing scale-110"
            )}
            aria-label="Open chat"
          >
            <div className="oracle-fab-glow absolute inset-0 rounded-full" />
            <img src={oracleAvatar} alt="Chat" className="w-full h-full object-cover rounded-full oracle-fab-spin relative z-10" />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full animate-pulse border-2 border-background z-20" />
            )}
          </button>
        </div>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div data-oracle-chat-open className="fixed bottom-5 right-5 z-50 w-[380px] max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-6rem)] bg-background border border-border rounded-xl flex flex-col overflow-hidden shadow-[0_8px_40px_-8px_hsl(var(--primary)/0.25),0_0_0_1px_hsl(var(--border))]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img src={oracleAvatar} alt="The Signal" className="w-full h-full object-cover" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">The Signal</h3>
                <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", tierColor)}>
                  {tierLabel}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearChat} title="Clear chat">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDismiss} title="Hide for 4 hours">
                <BellOff className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1" ref={scrollRef as any}>
            <div className="py-3 space-y-1">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground text-sm px-6 py-8">
                   <img src={oracleAvatar} alt="The Signal" className="h-12 w-12 mx-auto mb-3 rounded-full opacity-70" />
                   <p className="font-medium">Welcome! Take a peek inside the BlackBox of crypto with HoldersIntel 👋</p>
                   <p className="mt-1 text-xs">Your community toolchest — ask me anything about holders analysis, wallet tracing, developer reputation, or our features.</p>
                 </div>
              )}
              {messages.filter(msg => !(msg.role === 'user' && msg.content.startsWith('['))).map(msg => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex gap-2 px-3 py-2">
                  <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-foreground" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                    Thinking...
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-destructive/10 text-destructive text-xs flex items-center gap-2 border-t border-destructive/20">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-2">{error}</span>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-3">
            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex gap-2"
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask me anything..."
                className="flex-1 h-9 text-sm"
                disabled={isStreaming}
              />
              <Button
                type="submit"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={!input.trim() || isStreaming}
              >
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
            {tier === 'anon' && (
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                15 free chats/hour • <a href="/subscriptions" className="text-primary underline">Sign up</a> for more
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
