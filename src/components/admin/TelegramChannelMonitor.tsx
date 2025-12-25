import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  MessageCircle, 
  RefreshCw, 
  Settings, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  Bot,
  Loader2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ChannelConfig {
  id: string;
  channel_id: string;
  channel_name: string | null;
  is_active: boolean;
  ape_keyword_enabled: boolean;
  min_price_threshold: number;
  max_price_threshold: number;
  large_buy_amount_usd: number;
  standard_buy_amount_usd: number;
  large_sell_multiplier: number;
  standard_sell_multiplier: number;
  max_mint_age_minutes: number;
  flipit_wallet_id: string | null;
  email_notifications: boolean;
  notification_email: string | null;
  total_calls_detected: number;
  total_buys_executed: number;
  last_check_at: string | null;
  last_message_id: number | null;
}

interface ChannelCall {
  id: string;
  channel_id: string;
  channel_name: string | null;
  message_id: number;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  raw_message: string | null;
  contains_ape: boolean;
  price_at_call: number | null;
  mint_age_minutes: number | null;
  buy_tier: string | null;
  buy_amount_usd: number | null;
  sell_multiplier: number | null;
  status: string;
  skip_reason: string | null;
  email_sent: boolean;
  buy_tx_signature: string | null;
  created_at: string;
}

interface SessionStatus {
  hasSession: boolean;
  session: {
    id: string;
    phoneNumber: string;
    isActive: boolean;
    lastUsedAt: string | null;
    createdAt: string;
  } | null;
  hasBotToken: boolean;
  hasApiCredentials: boolean;
  phoneNumber: string | null;
}

interface FlipItWallet {
  id: string;
  nickname: string | null;
  pubkey: string;
  sol_balance: number | null;
}

export default function TelegramChannelMonitor() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [configs, setConfigs] = useState<ChannelConfig[]>([]);
  const [calls, setCalls] = useState<ChannelCall[]>([]);
  const [flipitWallets, setFlipitWallets] = useState<FlipItWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isTestingBot, setIsTestingBot] = useState(false);
  const [activeTab, setActiveTab] = useState('calls');

  // New config form state
  const [newChannelId, setNewChannelId] = useState('-1002078711289');
  const [newChannelName, setNewChannelName] = useState('Blind Ape Alpha 🦍');
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [isAddingConfig, setIsAddingConfig] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Check session status
      const { data: sessionData } = await supabase.functions.invoke('telegram-session-generator', {
        body: { action: 'check_status' }
      });
      if (sessionData) {
        setSessionStatus(sessionData);
      }

      // Load configs
      const { data: configData } = await supabase
        .from('telegram_channel_config')
        .select('*')
        .order('created_at', { ascending: false });
      if (configData) {
        setConfigs(configData as ChannelConfig[]);
      }

      // Load recent calls
      const { data: callData } = await supabase
        .from('telegram_channel_calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (callData) {
        setCalls(callData as ChannelCall[]);
      }

      // Load FlipIt wallets - use flipit_wallets table
      const { data: walletData } = await supabase
        .from('flipit_wallets')
        .select('id, nickname, pubkey, sol_balance')
        .eq('is_active', true);
      if (walletData) {
        setFlipitWallets(walletData as FlipItWallet[]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const testBot = async () => {
    setIsTestingBot(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-session-generator', {
        body: { action: 'test_bot' }
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Bot connected: @${data.bot.username}`);
      } else {
        toast.error(data?.error || 'Bot test failed');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to test bot');
    } finally {
      setIsTestingBot(false);
    }
  };

  const testChannel = async (channelId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('telegram-session-generator', {
        body: { action: 'test_channel', channelId }
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Channel accessible: ${data.channel.title}`);
      } else {
        toast.error(data?.error || 'Cannot access channel');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to test channel');
    }
  };

  const runScan = async () => {
    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-channel-monitor', {
        body: { action: 'scan' }
      });
      if (error) throw error;
      toast.success(`Scan complete: ${data.processed} tokens processed, ${data.buysExecuted} buys executed`);
      loadData(); // Refresh data
    } catch (error: any) {
      toast.error(error.message || 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const addChannelConfig = async () => {
    if (!newChannelId || !selectedWalletId) {
      toast.error('Channel ID and wallet are required');
      return;
    }
    setIsAddingConfig(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('telegram_channel_config').insert({
        user_id: user.id,
        channel_id: newChannelId,
        channel_name: newChannelName || null,
        flipit_wallet_id: selectedWalletId,
        notification_email: notificationEmail || null,
        email_notifications: !!notificationEmail,
        is_active: true
      });

      if (error) throw error;
      toast.success('Channel configuration added');
      loadData();
      setNewChannelId('');
      setNewChannelName('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to add configuration');
    } finally {
      setIsAddingConfig(false);
    }
  };

  const toggleConfig = async (configId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ is_active: !isActive })
        .eq('id', configId);
      if (error) throw error;
      toast.success(isActive ? 'Channel monitoring paused' : 'Channel monitoring resumed');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update configuration');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'bought':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Bought</Badge>;
      case 'detected':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Detected</Badge>;
      case 'skipped':
        return <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" /> Skipped</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="w-6 h-6" />
            Telegram Channel Monitor
          </h2>
          <p className="text-muted-foreground">
            Monitor Telegram channels for token calls and auto-ape
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={testBot} disabled={isTestingBot}>
            {isTestingBot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            Test Bot
          </Button>
          <Button onClick={runScan} disabled={isScanning}>
            {isScanning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Scan Now
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Bot Status</p>
                <p className="text-2xl font-bold">
                  {sessionStatus?.hasBotToken ? 'Connected' : 'Not Connected'}
                </p>
              </div>
              <Bot className={`w-8 h-8 ${sessionStatus?.hasBotToken ? 'text-green-500' : 'text-muted-foreground'}`} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Channels</p>
                <p className="text-2xl font-bold">{configs.filter(c => c.is_active).length}</p>
              </div>
              <MessageCircle className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Calls Detected</p>
                <p className="text-2xl font-bold">{configs.reduce((sum, c) => sum + (c.total_calls_detected || 0), 0)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Buys Executed</p>
                <p className="text-2xl font-bold">{configs.reduce((sum, c) => sum + (c.total_buys_executed || 0), 0)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="calls">Recent Calls</TabsTrigger>
          <TabsTrigger value="channels">Channel Config</TabsTrigger>
          <TabsTrigger value="settings">Trading Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="calls" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Token Calls</CardTitle>
              <CardDescription>Tokens detected from monitored channels</CardDescription>
            </CardHeader>
            <CardContent>
              {calls.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No calls detected yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Ape?</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calls.map((call) => (
                      <TableRow key={call.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <a 
                              href={`https://dexscreener.com/solana/${call.token_mint}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-primary hover:underline"
                            >
                              {call.token_symbol || 'UNKNOWN'}
                            </a>
                            <span className="text-xs text-muted-foreground font-mono">
                              {call.token_mint.slice(0, 8)}...
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          ${call.price_at_call?.toFixed(8) || 'N/A'}
                        </TableCell>
                        <TableCell>
                          {call.mint_age_minutes ? `${call.mint_age_minutes}m` : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {call.contains_ape ? (
                            <Badge className="bg-orange-500">🦍 YES</Badge>
                          ) : (
                            <Badge variant="outline">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {call.buy_tier ? (
                            <div className="flex flex-col">
                              <span className="capitalize">{call.buy_tier}</span>
                              <span className="text-xs text-muted-foreground">
                                ${call.buy_amount_usd} → {call.sell_multiplier}x
                              </span>
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(call.status)}
                          {call.skip_reason && (
                            <p className="text-xs text-muted-foreground mt-1">{call.skip_reason}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className="space-y-4">
          {/* Add New Channel */}
          <Card>
            <CardHeader>
              <CardTitle>Add Channel</CardTitle>
              <CardDescription>Configure a new Telegram channel to monitor</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Channel ID</Label>
                  <Input
                    placeholder="-1002078711289"
                    value={newChannelId}
                    onChange={(e) => setNewChannelId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Channel Name (optional)</Label>
                  <Input
                    placeholder="Blind Ape Alpha 🦍"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>FlipIt Wallet</Label>
                  <select
                    className="w-full p-2 border rounded-md bg-background"
                    value={selectedWalletId}
                    onChange={(e) => setSelectedWalletId(e.target.value)}
                  >
                    <option value="">Select wallet...</option>
                    {flipitWallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.nickname || w.pubkey.slice(0, 8)} ({w.sol_balance?.toFixed(4) || 0} SOL)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Notification Email</Label>
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={addChannelConfig} disabled={isAddingConfig}>
                {isAddingConfig && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Add Channel
              </Button>
            </CardContent>
          </Card>

          {/* Existing Channels */}
          <Card>
            <CardHeader>
              <CardTitle>Monitored Channels</CardTitle>
            </CardHeader>
            <CardContent>
              {configs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No channels configured</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead>Wallet</TableHead>
                      <TableHead>Calls</TableHead>
                      <TableHead>Buys</TableHead>
                      <TableHead>Last Check</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {configs.map((config) => (
                      <TableRow key={config.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{config.channel_name || 'Unnamed'}</span>
                            <span className="text-xs text-muted-foreground font-mono">{config.channel_id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {config.flipit_wallet_id?.slice(0, 8) || 'Not set'}
                        </TableCell>
                        <TableCell>{config.total_calls_detected || 0}</TableCell>
                        <TableCell>{config.total_buys_executed || 0}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {config.last_check_at 
                            ? formatDistanceToNow(new Date(config.last_check_at), { addSuffix: true })
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={config.is_active}
                            onCheckedChange={() => toggleConfig(config.id, config.is_active)}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testChannel(config.channel_id)}
                          >
                            Test
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Trading Rules
              </CardTitle>
              <CardDescription>
                Configure automatic buy rules based on token signals
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-muted rounded-lg space-y-4">
                <h4 className="font-semibold">Large Buy Tier (🦍 APE)</h4>
                <p className="text-sm text-muted-foreground">
                  Triggers when: "ape" keyword detected AND price &lt; $0.00002
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Buy Amount</Label>
                    <p className="text-2xl font-bold text-green-500">$100</p>
                  </div>
                  <div>
                    <Label>Sell Target</Label>
                    <p className="text-2xl font-bold text-primary">10x</p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg space-y-4">
                <h4 className="font-semibold">Standard Buy Tier</h4>
                <p className="text-sm text-muted-foreground">
                  Triggers when: price &gt; $0.00004 (regardless of ape keyword)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Buy Amount</Label>
                    <p className="text-2xl font-bold text-green-500">$50</p>
                  </div>
                  <div>
                    <Label>Sell Target</Label>
                    <p className="text-2xl font-bold text-primary">5x</p>
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-lg space-y-2">
                <h4 className="font-semibold">Additional Filters</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Max token age: 60 minutes</li>
                  <li>• Must be valid Solana address</li>
                  <li>• Skip duplicates (same token won't trigger twice)</li>
                  <li>• Email notification before every buy</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
