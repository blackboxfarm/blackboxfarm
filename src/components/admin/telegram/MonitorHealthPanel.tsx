import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Activity, Clock, MessageCircle, Target, AlertTriangle, CheckCircle2, XCircle, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

// Cast to any to avoid deep type inference issues with complex queries
const db = supabase as any;

interface ChannelHealthData {
  id: string;
  channel_id: string;
  channel_name: string | null;
  channel_username: string | null;
  is_active: boolean;
  last_check_at: string | null;
  last_message_id: number | null;
  // Computed from related tables
  last_call_at: string | null;
  last_interpretation_at: string | null;
  calls_last_hour: number;
  interpretations_last_hour: number;
  fantasy_positions_last_hour: number;
  // Latest run log
  latest_run: {
    started_at: string;
    status: string;
    fetched_count: number;
    new_messages_count: number;
    tokens_found_count: number;
    calls_inserted_count: number;
    fantasy_positions_inserted_count: number;
    error_message: string | null;
    skip_reasons: string[];
    previous_message_id: number | null;
    new_max_message_id: number | null;
  } | null;
}

type HealthStatus = 'healthy' | 'stale' | 'no_messages' | 'no_tokens' | 'error' | 'inactive';

function getHealthStatus(channel: ChannelHealthData): { status: HealthStatus; message: string } {
  if (!channel.is_active) {
    return { status: 'inactive', message: 'Monitor is disabled' };
  }

  if (!channel.last_check_at) {
    return { status: 'stale', message: 'Never checked' };
  }

  const lastCheck = new Date(channel.last_check_at);
  const now = new Date();
  const minutesSinceCheck = (now.getTime() - lastCheck.getTime()) / 60000;

  // Check if stale (no check in last 5 minutes)
  if (minutesSinceCheck > 5) {
    return { status: 'stale', message: `Last check ${Math.round(minutesSinceCheck)} min ago` };
  }

  // Check latest run for errors
  if (channel.latest_run?.status === 'error') {
    return { status: 'error', message: channel.latest_run.error_message || 'Unknown error' };
  }

  // Check if messages are being fetched but no new messages found
  if (channel.latest_run && channel.latest_run.new_messages_count === 0 && channel.latest_run.fetched_count > 0) {
    return { status: 'no_messages', message: 'Running, but no new messages in Telegram' };
  }

  // Check if messages found but no tokens extracted
  if (channel.latest_run && channel.latest_run.new_messages_count > 0 && channel.latest_run.tokens_found_count === 0) {
    return { status: 'no_tokens', message: 'Messages found, but no token addresses detected' };
  }

  // Otherwise healthy
  return { status: 'healthy', message: 'Running normally' };
}

function getStatusBadge(status: HealthStatus) {
  switch (status) {
    case 'healthy':
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Healthy</Badge>;
    case 'stale':
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Stale</Badge>;
    case 'no_messages':
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><MessageCircle className="w-3 h-3 mr-1" />No New Messages</Badge>;
    case 'no_tokens':
      return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30"><Target className="w-3 h-3 mr-1" />No Tokens</Badge>;
    case 'error':
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
    case 'inactive':
      return <Badge className="bg-muted text-muted-foreground"><AlertTriangle className="w-3 h-3 mr-1" />Inactive</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

export function MonitorHealthPanel() {
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<ChannelHealthData[]>([]);
  const [verifying, setVerifying] = useState<string | null>(null);

  const loadHealthData = async () => {
    setLoading(true);
    try {
      // Fetch active channel configs
      const configsResult = await db
        .from('telegram_channel_config')
        .select('id, channel_id, channel_name, channel_username, is_active, last_check_at, last_message_id')
        .order('is_active', { ascending: false });

      if (configsResult.error) throw configsResult.error;
      const configs = configsResult.data || [];

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Fetch health data for each channel
      const healthData: ChannelHealthData[] = await Promise.all(
        configs.map(async (config: any) => {
          // Get latest call for this channel
          const latestCallResult = await db
            .from('telegram_channel_calls')
            .select('created_at')
            .eq('channel_id', config.id)
            .order('created_at', { ascending: false })
            .limit(1);
          const latestCall = latestCallResult.data?.[0] || null;

          // Get latest interpretation for this channel
          const latestInterpretationResult = await db
            .from('telegram_message_interpretations')
            .select('created_at')
            .eq('config_id', config.id)
            .order('created_at', { ascending: false })
            .limit(1);
          const latestInterpretation = latestInterpretationResult.data?.[0] || null;

          // Count calls in last hour
          const callsResult = await db
            .from('telegram_channel_calls')
            .select('id', { count: 'exact', head: true })
            .eq('channel_id', config.id)
            .gte('created_at', oneHourAgo);
          const callsLastHour = callsResult.count || 0;

          // Count interpretations in last hour
          const interpretationsResult = await db
            .from('telegram_message_interpretations')
            .select('id', { count: 'exact', head: true })
            .eq('config_id', config.id)
            .gte('created_at', oneHourAgo);
          const interpretationsLastHour = interpretationsResult.count || 0;

          // Count fantasy positions in last hour for this channel
          const fantasyResult = await db
            .from('telegram_fantasy_positions')
            .select('id', { count: 'exact', head: true })
            .eq('channel_id', config.id)
            .gte('created_at', oneHourAgo);
          const fantasyLastHour = fantasyResult.count || 0;

          // Get latest run log
          const latestRunLogResult = await db
            .from('telegram_monitor_run_logs')
            .select('*')
            .eq('channel_config_id', config.id)
            .order('started_at', { ascending: false })
            .limit(1);
          const latestRunLog = latestRunLogResult.data?.[0] || null;

          return {
            ...config,
            last_call_at: latestCall?.created_at || null,
            last_interpretation_at: latestInterpretation?.created_at || null,
            calls_last_hour: callsLastHour || 0,
            interpretations_last_hour: interpretationsLastHour || 0,
            fantasy_positions_last_hour: fantasyLastHour || 0,
            latest_run: latestRunLog ? {
              started_at: latestRunLog.started_at,
              status: latestRunLog.status,
              fetched_count: latestRunLog.fetched_count,
              new_messages_count: latestRunLog.new_messages_count,
              tokens_found_count: latestRunLog.tokens_found_count,
              calls_inserted_count: latestRunLog.calls_inserted_count,
              fantasy_positions_inserted_count: latestRunLog.fantasy_positions_inserted_count,
              error_message: latestRunLog.error_message,
              skip_reasons: (latestRunLog.skip_reasons as string[]) || [],
              previous_message_id: latestRunLog.previous_message_id,
              new_max_message_id: latestRunLog.new_max_message_id,
            } : null
          };
        })
      );

      setChannels(healthData);
    } catch (err) {
      console.error('Error loading health data:', err);
      toast.error('Failed to load monitor health data');
    } finally {
      setLoading(false);
    }
  };

  const verifyNow = async (channelId: string, channelConfigId: string) => {
    setVerifying(channelConfigId);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-channel-monitor', {
        body: {
          action: 'scan',
          singleChannel: true,
          channelId: channelId,
          verifyMode: true
        }
      });

      if (error) throw error;

      toast.success(
        `Verification complete: ${data?.channels?.[0]?.messagesFound || 0} messages fetched`
      );
      
      // Reload health data
      await loadHealthData();
    } catch (err) {
      console.error('Error verifying channel:', err);
      toast.error('Failed to verify channel');
    } finally {
      setVerifying(null);
    }
  };

  useEffect(() => {
    loadHealthData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadHealthData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && channels.length === 0) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const activeChannels = channels.filter(c => c.is_active);
  const healthyCount = activeChannels.filter(c => getHealthStatus(c).status === 'healthy').length;
  const errorCount = activeChannels.filter(c => ['error', 'stale'].includes(getHealthStatus(c).status)).length;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Monitor Health</CardTitle>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="bg-green-500/10 text-green-400">
                {healthyCount} healthy
              </Badge>
              {errorCount > 0 && (
                <Badge variant="outline" className="bg-red-500/10 text-red-400">
                  {errorCount} issues
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadHealthData}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {channels.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">No channels configured</p>
        ) : (
          channels.map((channel) => {
            const health = getHealthStatus(channel);
            return (
              <div
                key={channel.id}
                className="p-3 rounded-lg bg-background/50 border border-border/50 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {channel.channel_name || channel.channel_username || channel.channel_id}
                    </span>
                    {getStatusBadge(health.status)}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => verifyNow(channel.channel_id, channel.id)}
                    disabled={verifying === channel.id || !channel.is_active}
                  >
                    {verifying === channel.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-1" />
                        Verify Now
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">{health.message}</p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Last Check</p>
                    <p className="font-mono">
                      {channel.last_check_at
                        ? formatDistanceToNow(new Date(channel.last_check_at), { addSuffix: true })
                        : 'Never'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Message ID</p>
                    <p className="font-mono">
                      {channel.latest_run
                        ? `${channel.latest_run.previous_message_id || '?'} → ${channel.latest_run.new_max_message_id || '?'}`
                        : channel.last_message_id || 'N/A'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Calls (1h)</p>
                    <p className="font-mono">{channel.calls_last_hour}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Fantasy (1h)</p>
                    <p className="font-mono">{channel.fantasy_positions_last_hour}</p>
                  </div>
                </div>

                {channel.latest_run && (
                  <div className="pt-1 border-t border-border/30">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Fetched: {channel.latest_run.fetched_count}</span>
                      <span>New: {channel.latest_run.new_messages_count}</span>
                      <span>Tokens: {channel.latest_run.tokens_found_count}</span>
                      <span>Inserted: {channel.latest_run.calls_inserted_count}</span>
                    </div>
                    {channel.latest_run.skip_reasons.length > 0 && (
                      <p className="text-xs text-yellow-400 mt-1">
                        Skipped: {channel.latest_run.skip_reasons.slice(0, 3).join(', ')}
                        {channel.latest_run.skip_reasons.length > 3 && ` +${channel.latest_run.skip_reasons.length - 3} more`}
                      </p>
                    )}
                  </div>
                )}

                {channel.last_call_at && (
                  <p className="text-xs text-muted-foreground">
                    Last token call: {formatDistanceToNow(new Date(channel.last_call_at), { addSuffix: true })}
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
