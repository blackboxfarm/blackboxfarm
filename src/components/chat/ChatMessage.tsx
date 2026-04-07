import React from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from './useChatStream';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

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
          <div className="prose prose-sm prose-invert max-w-none [&_p]:mb-1 [&_p:last-child]:mb-0 [&_a]:text-primary [&_a]:underline">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
