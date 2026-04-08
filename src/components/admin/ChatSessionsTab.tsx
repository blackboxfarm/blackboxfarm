import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, User, Clock, Monitor, Smartphone, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatSession {
  id: string;
  session_id: string;
  visitor_fingerprint: string | null;
  user_id: string | null;
  tier: string;
  page_path: string | null;
  messages: ChatMessage[];
  message_count: number;
  first_message_at: string;
  last_message_at: string;
  device_type: string | null;
  browser: string | null;
}

export function ChatSessionsTab() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const fetchSessions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('web_chat_sessions')
      .select('*')
      .order('last_message_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (!error && data) {
      setSessions(data.map(d => ({
        ...d,
        messages: (Array.isArray(d.messages) ? d.messages : []) as unknown as ChatMessage[],
      })));
    }
    setLoading(false);
  };

  useEffect(() => { fetchSessions(); }, [page]);

  const tierColor = (tier: string) => {
    if (tier === 'paid') return 'bg-yellow-500/20 text-yellow-400';
    if (tier === 'free') return 'bg-blue-500/20 text-blue-400';
    return 'bg-muted text-muted-foreground';
  };

  const userMessages = (msgs: ChatMessage[]) => msgs.filter(m => m.role === 'user');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> Chat Sessions
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={fetchSessions} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading && sessions.length === 0 ? (
          <div className="text-muted-foreground text-sm text-center py-8">Loading chats...</div>
        ) : sessions.length === 0 ? (
          <div className="text-muted-foreground text-sm text-center py-8">No chat sessions yet. They'll appear as visitors use The Signal.</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-center">Msgs</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map(session => {
                  const isExpanded = expandedId === session.id;
                  const uMsgs = userMessages(session.messages);
                  const firstUserMsg = uMsgs[0]?.content || '—';
                  
                  return (
                    <React.Fragment key={session.id}>
                      <TableRow 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedId(isExpanded ? null : session.id)}
                      >
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(session.last_message_at), 'MMM d, HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${tierColor(session.tier)}`}>
                            {session.tier}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {session.device_type === 'mobile' 
                            ? <Smartphone className="w-3 h-3 text-muted-foreground" />
                            : <Monitor className="w-3 h-3 text-muted-foreground" />
                          }
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                          {session.page_path || '/'}
                        </TableCell>
                        <TableCell className="text-center text-xs">{session.message_count}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">
                          {firstUserMsg.slice(0, 60)}{firstUserMsg.length > 60 ? '...' : ''}
                        </TableCell>
                        <TableCell>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={7} className="p-0">
                            <div className="bg-muted/30 p-4 space-y-2 max-h-[400px] overflow-y-auto border-t border-b border-border">
                              <div className="flex gap-2 text-[10px] text-muted-foreground mb-3">
                                <span>Session: {session.session_id?.slice(0, 16)}...</span>
                                {session.visitor_fingerprint && <span>FP: {session.visitor_fingerprint}</span>}
                                {session.user_id && <span>User: {session.user_id.slice(0, 8)}...</span>}
                                {session.browser && <span>{session.browser}</span>}
                              </div>
                              {session.messages
                                .filter(m => m.role !== 'system')
                                .map((msg, i) => (
                                <div 
                                  key={i} 
                                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                                    msg.role === 'user' 
                                      ? 'bg-primary/20 text-primary-foreground' 
                                      : 'bg-card text-card-foreground border border-border'
                                  }`}>
                                    <div className="text-[10px] font-medium mb-1 opacity-60">
                                      {msg.role === 'user' ? '👤 Visitor' : '🤖 Signal'}
                                    </div>
                                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                                  </div>
                                </div>
                              ))}
                              {session.messages.filter(m => m.role !== 'system').length === 0 && (
                                <div className="text-muted-foreground text-xs text-center">No messages</div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between mt-4">
              <Button 
                variant="outline" size="sm" 
                onClick={() => setPage(p => Math.max(0, p - 1))} 
                disabled={page === 0}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page + 1}</span>
              <Button 
                variant="outline" size="sm" 
                onClick={() => setPage(p => p + 1)} 
                disabled={sessions.length < PAGE_SIZE}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
