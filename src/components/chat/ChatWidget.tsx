import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { useChatStream } from './useChatStream';
import { cn } from '@/lib/utils';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const { messages, isStreaming, error, sendMessage, clearChat, tier } = useChatStream();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // Mark unread if widget is closed and assistant sends a message
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

  const tierLabel = tier === 'paid' ? 'Pro' : tier === 'free' ? 'Free' : 'Guest';
  const tierColor = tier === 'paid' ? 'bg-primary/20 text-primary' : tier === 'free' ? 'bg-accent/20 text-accent-foreground' : 'bg-muted text-muted-foreground';

  return (
    <>
      {/* FAB Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center"
          aria-label="Open chat"
        >
          <MessageCircle className="h-6 w-6" />
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
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-primary" />
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
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1" ref={scrollRef as any}>
            <div className="py-3 space-y-1">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground text-sm px-6 py-8">
                  <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
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
