import React from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { Bot, User, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ChatMessage as ChatMessageType } from './useChatStream';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const navigate = useNavigate();

  const handleLinkClick = (href: string) => {
    // Internal links: navigate with from_oracle param
    if (href.startsWith('/') || href.includes('blackbox.farm/')) {
      let path = href;
      if (href.includes('blackbox.farm/')) {
        path = '/' + href.split('blackbox.farm/')[1];
      }
      const separator = path.includes('?') ? '&' : '?';
      navigate(`${path}${separator}from_oracle=1`);
      return;
    }
    window.open(href, '_blank', 'noopener');
  };

  return (
    <div className={cn("flex gap-2 px-3 py-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
        isUser ? "bg-primary/20 text-primary" : "bg-accent text-accent-foreground"
      )}>
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
        isUser
          ? "bg-primary text-primary-foreground rounded-br-sm"
          : "bg-muted text-foreground rounded-bl-sm"
      )}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none [&_p]:mb-1 [&_p:last-child]:mb-0">
            <ReactMarkdown
              components={{
                a: ({ href, children }) => (
                  <button
                    onClick={() => href && handleLinkClick(href)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors text-xs font-medium no-underline cursor-pointer border border-primary/30"
                  >
                    {children}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </button>
                ),
              }}
            >{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
