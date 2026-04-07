import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { useChatStream } from './useChatStream';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';
import oracleAvatar from '@/assets/oracle-avatar.png';

// Pages where the widget should NOT appear
const HIDDEN_PAGES = ['/checkout', '/payment', '/super-admin'];
// Pages where it should always be available (feature pages)
const PRIORITY_PAGES = ['/holders', '/oracle', '/bubblemaps', '/intel', '/feed'];

const DISMISS_KEY = 'bb_chat_dismissed_at';
const VISITS_KEY = 'bb_chat_visits';
const FAB_SHOWN_KEY = 'bb_chat_fab_shown';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const [fabVisible, setFabVisible] = useState(false);
  const [fabPulsing, setFabPulsing] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const { messages, isStreaming, error, sendMessage, clearChat, tier } = useChatStream();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();

  // Smart appearance logic
  useEffect(() => {
    const currentPath = location.pathname;

    // Never show on hidden pages
    if (HIDDEN_PAGES.some(p => currentPath.startsWith(p))) {
      setFabVisible(false);
      return;
    }

    // Check if user dismissed within last 24 hours
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - Number(dismissedAt) < 86400_000) {
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
    // Remember dismissal for 24 hours
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setFabVisible(false);
    // Re-show after 24h or on next priority page visit
    setTimeout(() => {
      localStorage.removeItem(DISMISS_KEY);
    }, 86400_000);
  };

  const tierLabel = tier === 'paid' ? 'Pro' : tier === 'free' ? 'Free' : 'Guest';
  const tierColor = tier === 'paid' ? 'bg-primary/20 text-primary' : tier === 'free' ? 'bg-accent/20 text-accent-foreground' : 'bg-muted text-muted-foreground';

  // Don't render anything if not visible and not open
  if (!fabVisible && !isOpen) return null;

  return (
    <>
      {/* FAB Button */}
      {!isOpen && fabVisible && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "fixed bottom-5 right-5 z-50 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center overflow-hidden",
            isScrolling ? "w-10 h-10 opacity-60" : "w-14 h-14",
            fabPulsing && "animate-pulse"
          )}
          aria-label="Open chat"
        >
          <img src={oracleAvatar} alt="Chat" className="w-full h-full object-cover" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full animate-pulse border-2 border-background" />
          )}
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-5 right-5 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-6rem)] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img src={oracleAvatar} alt="Oracle" className="w-full h-full object-cover" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">BlackBox Assistant</h3>
                <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", tierColor)}>
                  {tierLabel}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearChat} title="Clear chat">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1" ref={scrollRef as any}>
            <div className="py-3 space-y-1">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground text-sm px-6 py-8">
                  <img src={oracleAvatar} alt="Oracle" className="h-12 w-12 mx-auto mb-3 rounded-full opacity-70" />
                  <p className="font-medium">Welcome to BlackBox Farm! 👋</p>
                  <p className="mt-1 text-xs">Ask me anything about holders analysis, token scanning, or our features.</p>
                </div>
              )}
              {messages.map(msg => (
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
                3 free messages • <a href="/subscriptions" className="text-primary underline">Sign up</a> for unlimited
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
