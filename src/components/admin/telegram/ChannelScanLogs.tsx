import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  RefreshCw, 
  Trash2, 
  Loader2, 
  MessageSquare, 
  Coins,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface MessageInterpretation {
  id: string;
  channel_id: string;
  message_id: number;
  raw_message: string;
  ai_summary: string | null;
  decision: string | null;
  decision_reasoning: string | null;
  extracted_tokens: string[];
  token_mint: string | null;
  price_at_detection: number | null;
  caller_username: string | null;
  caller_display_name: string | null;
  created_at: string;
}

interface ChannelCall {
  id: string;
  channel_id: string;
  token_mint: string;
  token_symbol: string | null;
  status: string;
  skip_reason: string | null;
  price_at_call: number | null;
  mint_age_minutes: number | null;
  caller_username: string | null;
  contains_ape: boolean;
  created_at: string;
}

interface Props {
  channelId: string;
  channelUsername: string;
  configId: string;
}

export function ChannelScanLogs({ channelId, channelUsername, configId }: Props) {
  const [messages, setMessages] = useState<MessageInterpretation[]>([]);
  const [calls, setCalls] = useState<ChannelCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [deepScanning, setDeepScanning] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    loadData();
  }, [channelId, configId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [msgsResult, callsResult] = await Promise.all([
        supabase
          .from('telegram_message_interpretations')
          .select('*')
          .eq('channel_id', channelId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('telegram_channel_calls')
          .select('*')
          .eq('channel_id', channelId)
          .order('created_at', { ascending: false })
          .limit(50)
      ]);

      if (msgsResult.error) throw msgsResult.error;
      if (callsResult.error) throw callsResult.error;

      setMessages(msgsResult.data || []);
      setCalls(callsResult.data || []);
    } catch (err) {
      console.error('Error loading scan logs:', err);
      toast.error('Failed to load scan logs');
    } finally {
      setLoading(false);
    }
  };

  const resetLogs = async () => {
    if (!confirm(`Delete all logs for @${channelUsername}? This cannot be undone.`)) return;
    
    setResetting(true);
    try {
      // Delete interpretations and calls for this channel
      await Promise.all([
        supabase.from('telegram_message_interpretations').delete().eq('channel_config_id', configId),
        supabase.from('telegram_channel_calls').delete().eq('channel_config_id', configId)
      ]);
      
      // Reset last_message_id in config
      await supabase
        .from('telegram_channel_config')
        .update({ last_message_id: null, total_calls_detected: 0, total_buys_executed: 0 })
        .eq('id', configId);
      
      toast.success('Logs reset successfully');
      setMessages([]);
      setCalls([]);
    } catch (err) {
      console.error('Error resetting logs:', err);
      toast.error('Failed to reset logs');
    } finally {
      setResetting(false);
    }
  };

  const deepScan = async () => {
    setDeepScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-channel-monitor', {
        body: { 
          action: 'scan',
          singleChannel: true,
          channelId: channelId,
          deepScan: true,
          resetMessageId: true
        }
      });
      
      if (error) throw error;
      
      const processed = data?.processed || 0;
      const buys = data?.fantasyBuysExecuted || data?.buysExecuted || 0;
      const rawMessages = data?.rawMessagesRetrieved || 0;
      
      toast.success(`Deep scan complete: ${rawMessages} messages fetched, ${processed} tokens, ${buys} buys`);
      loadData();
    } catch (error: any) {
      console.error('Error deep scanning:', error);
      toast.error(`Deep scan failed: ${error.message}`);
    } finally {
      setDeepScanning(false);
    }
  };

  const getDecisionBadge = (decision: string | null) => {
    switch (decision) {
      case 'buy':
      case 'fantasy_buy':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">BUY</Badge>;
      case 'skip':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">SKIP</Badge>;
      case 'no_action':
        return <Badge className="bg-muted text-muted-foreground">NO ACTION</Badge>;
      default:
        return <Badge variant="outline">?</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'executed':
      case 'fantasy_executed':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Executed</Badge>;
      case 'skipped':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><XCircle className="h-3 w-3 mr-1" />Skipped</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={deepScan}
          disabled={deepScanning}
          className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
        >
          {deepScanning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Deep Scan (All Messages)
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={resetLogs}
          disabled={resetting}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10"
        >
          {resetting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 mr-2" />
          )}
          Reset Logs
        </Button>
        <Button size="sm" variant="ghost" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="messages" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="messages" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Raw Messages ({messages.length})
          </TabsTrigger>
          <TabsTrigger value="tokens" className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Extracted Tokens ({calls.length})
          </TabsTrigger>
        </TabsList>

        {/* Raw Messages Tab */}
        <TabsContent value="messages">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Raw Messages Retrieved</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                {messages.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No messages retrieved yet. Run a scan first.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {messages.map((msg) => (
                      <div key={msg.id} className="p-3 hover:bg-muted/30">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">#{msg.message_id}</span>
                            {msg.caller_username && (
                              <Badge variant="outline" className="text-xs">@{msg.caller_username}</Badge>
                            )}
                            {getDecisionBadge(msg.decision)}
                          </div>
                          <span className="text-xs text-muted-foreground flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-3 font-mono bg-muted/30 p-2 rounded">
                          {msg.raw_message || '(empty)'}
                        </p>
                        
                        {msg.extracted_tokens && msg.extracted_tokens.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap mb-1">
                            <span className="text-xs text-muted-foreground">Tokens:</span>
                            {msg.extracted_tokens.map((t, i) => (
                              <code key={i} className="text-xs bg-primary/10 text-primary px-1 rounded">
                                {truncateAddress(t)}
                              </code>
                            ))}
                          </div>
                        )}
                        
                        {msg.decision_reasoning && (
                          <p className="text-xs text-muted-foreground italic">
                            → {msg.decision_reasoning}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Extracted Tokens Tab */}
        <TabsContent value="tokens">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Extracted Solana Tokens</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                {calls.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No tokens extracted yet. Run a scan first.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {calls.map((call) => (
                      <div key={call.id} className="p-3 hover:bg-muted/30">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                              {truncateAddress(call.token_mint)}
                            </code>
                            {call.token_symbol && (
                              <Badge variant="outline">${call.token_symbol}</Badge>
                            )}
                            {getStatusBadge(call.status)}
                            {call.contains_ape && (
                              <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">🦍 APE</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                          <div>
                            <span className="text-muted-foreground">Price:</span>{' '}
                            <span className="font-mono">${call.price_at_call?.toFixed(8) || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Age:</span>{' '}
                            <span className={call.mint_age_minutes && call.mint_age_minutes > 60 ? 'text-yellow-400' : ''}>
                              {call.mint_age_minutes ? `${call.mint_age_minutes}min` : 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Caller:</span>{' '}
                            <span>@{call.caller_username || 'unknown'}</span>
                          </div>
                        </div>
                        
                        {call.skip_reason && (
                          <p className="text-xs text-yellow-400 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {call.skip_reason}
                          </p>
                        )}
                        
                        <div className="mt-2">
                          <a 
                            href={`https://dexscreener.com/solana/${call.token_mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:underline"
                          >
                            View on DexScreener →
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
