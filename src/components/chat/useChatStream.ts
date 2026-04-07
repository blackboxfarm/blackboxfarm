import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserTier } from '@/hooks/useUserTier';
import { useLocation } from 'react-router-dom';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-chat`;

function getSessionId(): string {
  let sid = localStorage.getItem('bb_chat_session');
  if (!sid) {
    sid = 'ws-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('bb_chat_session', sid);
  }
  return sid;
}

export function useChatStream() {
  const { user } = useAuth();
  const { tierInfo } = useUserTier();
  const location = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const tier = !user ? 'anon' : (tierInfo.tierKey === 'pro' || tierInfo.tierKey === 'dev' || tierInfo.tierKey === 'enterprise') ? 'paid' : 'free';

  // Load messages from sessionStorage for continuity
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('bb_chat_msgs');
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem('bb_chat_msgs', JSON.stringify(messages.slice(-50)));
    }
  }, [messages]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return;
    setError(null);

    const userMsg: ChatMessage = {
      id: 'u-' + Date.now(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          user_context: {
            tier,
            pagePath: location.pathname,
            sessionId: getSessionId(),
            userId: user?.id || null,
            emailVerified: user?.email_confirmed_at ? true : false,
          },
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: 'Request failed' }));
        if (data.rate_limited && tier === 'anon') {
          setError(data.error);
          setIsStreaming(false);
          return;
        }
        setError(data.error || 'Something went wrong');
        setIsStreaming(false);
        return;
      }

      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let textBuffer = '';
      const assistantId = 'a-' + Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.id === assistantId) {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { id: assistantId, role: 'assistant', content: assistantContent, timestamp: new Date() }];
              });
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) {
              assistantContent += c;
              setMessages(prev =>
                prev.map((m, i) => i === prev.length - 1 && m.id === assistantId ? { ...m, content: assistantContent } : m)
              );
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError('Failed to connect. Please try again.');
        console.error('[chat] stream error:', e);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [messages, isStreaming, tier, location.pathname, user]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    sessionStorage.removeItem('bb_chat_msgs');
    // New session
    localStorage.removeItem('bb_chat_session');
  }, []);

  return { messages, isStreaming, error, sendMessage, clearChat, tier };
}
