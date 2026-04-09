import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bot, Globe, Cpu, DollarSign, Clock, MessageSquare } from "lucide-react";
import { format } from "date-fns";

interface AIComputeSectionProps {
  reportPeriodStart: string;
  reportPeriodEnd: string;
}

interface ComputeRow {
  id: string;
  platform: string;
  user_id: string | null;
  session_id: string | null;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  response_time_ms: number | null;
  cost_estimate_usd: number | null;
  created_at: string;
}

export function AIComputeSection({ reportPeriodStart, reportPeriodEnd }: AIComputeSectionProps) {
  const [modalUserId, setModalUserId] = useState<string | null>(null);
  const [modalPlatform, setModalPlatform] = useState<'telegram' | 'web'>('web');

  const { data: logs } = useQuery({
    queryKey: ['morning-ai-compute', reportPeriodStart, reportPeriodEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_compute_log')
        .select('*')
        .gte('created_at', reportPeriodStart)
        .lte('created_at', reportPeriodEnd)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ComputeRow[];
    },
    enabled: !!reportPeriodStart && !!reportPeriodEnd,
  });

  if (!logs || logs.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">No AI compute activity during this report period.</div>
    );
  }

  const tgLogs = logs.filter(r => r.platform === 'telegram');
  const webLogs = logs.filter(r => r.platform === 'web');
  const totalCost = logs.reduce((s, r) => s + (r.cost_estimate_usd || 0), 0);
  const totalTokens = logs.reduce((s, r) => s + (r.total_tokens || 0), 0);
  const avgMs = Math.round(logs.reduce((s, r) => s + (r.response_time_ms || 0), 0) / logs.length);

  // Per-account
  const accountMap: Record<string, { uid: string; tg: number; web: number; cost: number; tokens: number }> = {};
  logs.forEach(r => {
    const uid = r.user_id || r.session_id || 'anon';
    if (!accountMap[uid]) accountMap[uid] = { uid, tg: 0, web: 0, cost: 0, tokens: 0 };
    accountMap[uid][r.platform === 'telegram' ? 'tg' : 'web']++;
    accountMap[uid].cost += r.cost_estimate_usd || 0;
    accountMap[uid].tokens += r.total_tokens || 0;
  });
  const topAccounts = Object.values(accountMap).sort((a, b) => b.cost - a.cost).slice(0, 5);

  return (
    <div className="space-y-3">
      {/* Summary metrics */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <div className="text-xs">
          <span className="text-muted-foreground">Total Calls:</span>{' '}
          <span className="font-medium">{logs.length}</span>
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">TG:</span>{' '}
          <span className="font-medium text-blue-400">{tgLogs.length}</span>
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">Web:</span>{' '}
          <span className="font-medium text-emerald-400">{webLogs.length}</span>
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">Cost:</span>{' '}
          <span className="font-medium text-green-400">${totalCost.toFixed(4)}</span>
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">Tokens:</span>{' '}
          <span className="font-medium">{(totalTokens / 1000).toFixed(1)}k</span>
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">Avg Response:</span>{' '}
          <span className="font-medium">{avgMs}ms</span>
        </div>
      </div>

      {/* Top accounts */}
      {topAccounts.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1">Top Accounts by Cost</div>
          <div className="space-y-1">
            {topAccounts.map(a => (
              <div key={a.uid} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground w-24 truncate" title={a.uid}>{a.uid.slice(0, 12)}…</span>
                {a.tg > 0 && <Badge variant="outline" className="text-[10px] text-blue-400 cursor-pointer" onClick={() => { setModalUserId(a.uid); setModalPlatform('telegram'); }}>TG: {a.tg}</Badge>}
                {a.web > 0 && <Badge variant="outline" className="text-[10px] text-emerald-400 cursor-pointer" onClick={() => { setModalUserId(a.uid); setModalPlatform('web'); }}>Web: {a.web}</Badge>}
                <span className="text-green-400">${a.cost.toFixed(4)}</span>
                <span className="text-muted-foreground">{(a.tokens / 1000).toFixed(1)}k tokens</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Modal */}
      <OvernightChatModal userId={modalUserId} platform={modalPlatform} onClose={() => setModalUserId(null)} periodStart={reportPeriodStart} periodEnd={reportPeriodEnd} />
    </div>
  );
}

function OvernightChatModal({ userId, platform, onClose, periodStart, periodEnd }: {
  userId: string | null; platform: 'telegram' | 'web'; onClose: () => void;
  periodStart: string; periodEnd: string;
}) {
  const { data: webChats } = useQuery({
    queryKey: ['overnight-web-chats', userId, periodStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('web_chat_sessions')
        .select('*')
        .eq('user_id', userId!)
        .gte('last_message_at', periodStart)
        .lte('last_message_at', periodEnd)
        .order('last_message_at', { ascending: false });
      return data || [];
    },
    enabled: !!userId && platform === 'web',
  });

  const { data: tgChats } = useQuery({
    queryKey: ['overnight-tg-chats', userId, periodStart],
    queryFn: async () => {
      const { data: memory } = await supabase
        .from('ai_user_memory')
        .select('telegram_user_id')
        .eq('user_id', userId!)
        .maybeSingle();
      if (!memory?.telegram_user_id) return [];
      const { data } = await supabase
        .from('telegram_group_messages')
        .select('*')
        .eq('telegram_user_id', memory.telegram_user_id)
        .eq('chat_type', 'private')
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!userId && platform === 'telegram',
  });

  const messages = platform === 'web' ? webChats : tgChats;

  return (
    <Dialog open={!!userId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            {platform === 'telegram' ? <Bot className="w-4 h-4 text-blue-400" /> : <Globe className="w-4 h-4 text-emerald-400" />}
            Overnight {platform === 'telegram' ? 'Telegram' : 'Web'} Chats
            <span className="text-xs text-muted-foreground font-mono ml-2">{userId?.slice(0, 12)}…</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {platform === 'web' && webChats?.map((session: any) => (
            <div key={session.id} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{format(new Date(session.last_message_at), 'HH:mm')}</span>
                <Badge variant="outline" className="text-[10px]">{session.message_count} msgs</Badge>
              </div>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {(Array.isArray(session.messages) ? session.messages : [])
                  .filter((m: any) => m.role !== 'system')
                  .map((msg: any, i: number) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${msg.role === 'user' ? 'bg-primary/20' : 'bg-muted'}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
          {platform === 'telegram' && tgChats?.map((msg: any) => (
            <div key={msg.id} className={`flex ${msg.is_bot_reply ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${msg.is_bot_reply ? 'bg-muted' : 'bg-primary/20'}`}>
                <div className="text-[10px] text-muted-foreground mb-0.5">
                  {msg.is_bot_reply ? '🤖' : `👤 ${msg.username || 'User'}`} · {format(new Date(msg.created_at), 'HH:mm')}
                </div>
                {msg.message_text}
              </div>
            </div>
          ))}
          {(!messages || messages.length === 0) && (
            <p className="text-center text-muted-foreground text-sm py-4">No chats found for this period.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
