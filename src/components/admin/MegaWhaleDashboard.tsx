import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Crown, Plus, Trash2, Search, Activity, Bell, 
  RefreshCw, ExternalLink, GitBranch, Coins, 
  TrendingUp, TrendingDown, Radio, WifiOff, Eye,
  Zap, Settings, Mail, Send, Bot, DollarSign
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';

interface MegaWhale {
  id: string;
  wallet_address: string;
  nickname: string | null;
  source_cex: string | null;
  notes: string | null;
  is_active: boolean;
  helius_webhook_id: string | null;
  total_offspring_wallets: number;
  total_tokens_minted: number;
  total_tokens_bought: number;
  created_at: string;
  last_activity_at: string | null;
}

interface Offspring {
  id: string;
  mega_whale_id: string;
  wallet_address: string;
  depth_level: number;
  first_funded_at: string | null;
  total_sol_received: number;
  is_pump_fun_dev: boolean;
  is_active_trader: boolean;
  tokens_minted: unknown;
  tokens_bought: unknown;
  tokens_sold: unknown;
}

interface TokenAlert {
  id: string;
  mega_whale_id: string;
  offspring_id: string | null;
  alert_type: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  token_image: string | null;
  amount_sol: number | null;
  funding_chain: unknown;
  detected_at: string;
  is_read: boolean;
  metadata: any;
}

interface PatternAlert {
  id: string;
  user_id: string;
  mega_whale_id: string | null;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  metadata: any;
  is_read: boolean;
  created_at: string;
  expires_at: string | null;
}

interface AlertConfig {
  id: string;
  user_id: string;
  funding_burst_count: number;
  funding_burst_window_minutes: number;
  coordinated_buy_count: number;
  coordinated_buy_window_minutes: number;
  profit_taking_threshold_percent: number;
  notify_email: boolean;
  notify_telegram: boolean;
  notify_browser: boolean;
  email_address: string | null;
  telegram_chat_id: string | null;
  auto_buy_on_mint: boolean;
  auto_buy_amount_sol: number;
  auto_buy_wait_for_buys: number;
  auto_buy_max_wait_minutes: number;
}

const CEX_OPTIONS = [
  { value: 'robinhood', label: 'Robinhood' },
  { value: 'coinbase', label: 'Coinbase' },
  { value: 'kraken', label: 'Kraken' },
  { value: 'binance', label: 'Binance' },
  { value: 'ftx', label: 'FTX' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'other', label: 'Other' },
  { value: 'unknown', label: 'Unknown' },
];

export function MegaWhaleDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('whales');
  const [loading, setLoading] = useState(true);
  const [megaWhales, setMegaWhales] = useState<MegaWhale[]>([]);
  const [offspring, setOffspring] = useState<Offspring[]>([]);
  const [alerts, setAlerts] = useState<TokenAlert[]>([]);
  const [patternAlerts, setPatternAlerts] = useState<PatternAlert[]>([]);
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
  const [selectedWhale, setSelectedWhale] = useState<string | null>(null);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  
  // Add whale form
  const [newWallet, setNewWallet] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [newSourceCex, setNewSourceCex] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      // Load mega whales
      const { data: whalesData } = await supabase
        .from('mega_whales')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      setMegaWhales(whalesData || []);
      setMonitoringActive(whalesData?.some(w => w.helius_webhook_id) || false);

      // Load alert config
      const { data: configData } = await supabase
        .from('mega_whale_alert_config')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      setAlertConfig(configData as AlertConfig || null);

      // Load pattern alerts
      const { data: patternData } = await supabase
        .from('mega_whale_pattern_alerts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      setPatternAlerts((patternData as PatternAlert[]) || []);

      if (whalesData?.length) {
        const { data: offspringData } = await supabase
          .from('mega_whale_offspring')
          .select('*')
          .in('mega_whale_id', whalesData.map(w => w.id))
          .order('depth_level', { ascending: true });

        setOffspring(offspringData || []);

        const { data: alertsData } = await supabase
          .from('mega_whale_token_alerts')
          .select('*')
          .eq('user_id', user.id)
          .order('detected_at', { ascending: false })
          .limit(100);

        setAlerts(alertsData || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const addMegaWhale = async () => {
    if (!user?.id || !newWallet.trim()) return;
    setAdding(true);

    try {
      const { data, error } = await supabase.functions.invoke('mega-whale-manager', {
        body: {
          action: 'add',
          user_id: user.id,
          wallet_address: newWallet.trim(),
          nickname: newNickname.trim() || null,
          source_cex: newSourceCex || null,
          notes: newNotes.trim() || null
        }
      });

      if (error) throw error;

      toast.success(`Added mega whale: ${newNickname || newWallet.slice(0, 8)}...`, {
        description: `Found ${data.initial_scan?.offspring_found || 0} offspring wallets`
      });

      setNewWallet('');
      setNewNickname('');
      setNewSourceCex('');
      setNewNotes('');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add mega whale');
    } finally {
      setAdding(false);
    }
  };

  const removeMegaWhale = async (id: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase.functions.invoke('mega-whale-manager', {
        body: { action: 'remove', user_id: user.id, mega_whale_id: id }
      });

      if (error) throw error;
      toast.success('Mega whale removed');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove');
    }
  };

  const rescanWhale = async (id: string) => {
    if (!user?.id) return;
    setScanning(id);

    try {
      const { data, error } = await supabase.functions.invoke('mega-whale-manager', {
        body: { action: 'scan', user_id: user.id, mega_whale_id: id }
      });

      if (error) throw error;
      const scanResult = data.scan_result || {};
      const message = scanResult.new_offspring > 0 
        ? `Found ${scanResult.new_offspring} new offspring (${scanResult.total_scanned} scanned)`
        : `No new offspring found (${scanResult.total_scanned} wallets scanned)`;
      toast.success('Scan complete', { description: message });
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to scan');
    } finally {
      setScanning(null);
    }
  };

  const toggleMonitoring = async () => {
    if (!user?.id) return;

    try {
      const action = monitoringActive ? 'stop_monitoring' : 'start_monitoring';
      const { error } = await supabase.functions.invoke('mega-whale-manager', {
        body: { action, user_id: user.id }
      });

      if (error) throw error;
      
      toast.success(monitoringActive ? 'Monitoring stopped' : 'Monitoring started');
      setMonitoringActive(!monitoringActive);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to toggle monitoring');
    }
  };

  const markAlertRead = async (alertId: string) => {
    await supabase
      .from('mega_whale_token_alerts')
      .update({ is_read: true })
      .eq('id', alertId);

    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_read: true } : a));
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'token_mint': return <Coins className="h-4 w-4 text-yellow-500" />;
      case 'token_buy': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'token_sell': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const filteredOffspring = selectedWhale 
    ? offspring.filter(o => o.mega_whale_id === selectedWhale)
    : offspring;

  const filteredAlerts = selectedWhale
    ? alerts.filter(a => a.mega_whale_id === selectedWhale)
    : alerts;

  const unreadCount = alerts.filter(a => !a.is_read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Crown className="h-6 w-6 text-yellow-500" />
            MEGA WHALE Genealogy Tracker
          </h2>
          <p className="text-muted-foreground">
            Track source wallets and their offspring network for token mints & trades
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
            {monitoringActive ? (
              <>
                <Radio className="h-4 w-4 text-green-500 animate-pulse" />
                <span className="text-sm font-medium text-green-600">Live Monitoring</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Offline</span>
              </>
            )}
            <Button 
              size="sm" 
              variant={monitoringActive ? "destructive" : "default"}
              onClick={toggleMonitoring}
              disabled={megaWhales.length === 0}
            >
              {monitoringActive ? 'Stop' : 'Start'}
            </Button>
          </div>
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{megaWhales.length}</div>
            <p className="text-xs text-muted-foreground">Mega Whales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{offspring.length}</div>
            <p className="text-xs text-muted-foreground">Offspring Wallets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{alerts.filter(a => a.alert_type === 'token_mint').length}</div>
            <p className="text-xs text-muted-foreground">Tokens Minted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold flex items-center gap-2">
              {unreadCount}
              {unreadCount > 0 && <Bell className="h-4 w-4 text-orange-500 animate-pulse" />}
            </div>
            <p className="text-xs text-muted-foreground">Unread Alerts</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="whales" className="flex items-center gap-2">
            <Crown className="h-4 w-4" /> Mega Whales
          </TabsTrigger>
          <TabsTrigger value="offspring" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Offspring ({offspring.length})
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-2">
            <Bell className="h-4 w-4" /> Alerts
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="whales" className="space-y-4">
          {/* Add Mega Whale Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5" /> Add Mega Whale
              </CardTitle>
              <CardDescription>
                Add a source wallet (e.g., from Robinhood) to track its offspring network
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Wallet Address *</Label>
                  <Input
                    placeholder="Enter Solana wallet address..."
                    value={newWallet}
                    onChange={(e) => setNewWallet(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nickname</Label>
                  <Input
                    placeholder="e.g., Main Robinhood"
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source CEX</Label>
                  <Select value={newSourceCex} onValueChange={setNewSourceCex}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CEX_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    placeholder="Optional notes..."
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={addMegaWhale} disabled={adding || !newWallet.trim()}>
                {adding ? 'Adding & Scanning...' : 'Add & Scan History'}
              </Button>
            </CardContent>
          </Card>

          {/* Mega Whales List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Mega Whales</CardTitle>
            </CardHeader>
            <CardContent>
              {megaWhales.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No mega whales added yet. Add one above to start tracking.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Wallet</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Offspring</TableHead>
                      <TableHead>Tokens Minted</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {megaWhales.map((whale) => (
                      <TableRow key={whale.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{whale.nickname || 'Unnamed'}</span>
                            <a
                              href={`https://solscan.io/account/${whale.wallet_address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                            >
                              {whale.wallet_address.slice(0, 8)}...{whale.wallet_address.slice(-6)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {whale.source_cex || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {offspring.filter(o => o.mega_whale_id === whale.id).length}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{whale.total_tokens_minted}</span>
                        </TableCell>
                        <TableCell>
                          {whale.last_activity_at ? (
                            <span className="text-xs">
                              {format(new Date(whale.last_activity_at), 'MMM d, HH:mm')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Never</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rescanWhale(whale.id)}
                              disabled={scanning === whale.id}
                            >
                              {scanning === whale.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Search className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedWhale(selectedWhale === whale.id ? null : whale.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => removeMegaWhale(whale.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offspring" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Offspring Wallet Network</CardTitle>
                  <CardDescription>
                    Wallets funded by mega whales (up to 4 levels deep)
                  </CardDescription>
                </div>
                {megaWhales.length > 0 && (
                  <Select value={selectedWhale || 'all'} onValueChange={(v) => setSelectedWhale(v === 'all' ? null : v)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filter by whale..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Whales</SelectItem>
                      {megaWhales.map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.nickname || w.wallet_address.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Depth</TableHead>
                      <TableHead>Wallet</TableHead>
                      <TableHead>SOL Received</TableHead>
                      <TableHead>Pump.fun Dev?</TableHead>
                      <TableHead>Active Trader?</TableHead>
                      <TableHead>First Funded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOffspring.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>
                          <Badge variant={o.depth_level === 1 ? 'default' : 'secondary'}>
                            Level {o.depth_level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <a
                            href={`https://solscan.io/account/${o.wallet_address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm hover:text-primary flex items-center gap-1 font-mono"
                          >
                            {o.wallet_address.slice(0, 8)}...{o.wallet_address.slice(-6)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{o.total_sol_received?.toFixed(4)} SOL</span>
                        </TableCell>
                        <TableCell>
                          {o.is_pump_fun_dev ? (
                            <Badge variant="destructive">Yes</Badge>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {o.is_active_trader ? (
                            <Badge variant="default">Yes</Badge>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {o.first_funded_at ? (
                            <span className="text-xs">
                              {format(new Date(o.first_funded_at), 'MMM d, yyyy')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Token Alerts</CardTitle>
                  <CardDescription>
                    Token mints, buys, and sells from offspring network
                  </CardDescription>
                </div>
                {megaWhales.length > 0 && (
                  <Select value={selectedWhale || 'all'} onValueChange={(v) => setSelectedWhale(v === 'all' ? null : v)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filter by whale..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Whales</SelectItem>
                      {megaWhales.map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.nickname || w.wallet_address.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {filteredAlerts.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      No alerts yet. Alerts will appear when offspring wallets mint or trade tokens.
                    </p>
                  ) : (
                    filteredAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-4 rounded-lg border ${!alert.is_read ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}
                        onClick={() => !alert.is_read && markAlertRead(alert.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            {getAlertIcon(alert.alert_type)}
                            <div>
                              <div className="flex items-center gap-2">
                                {alert.token_image && (
                                  <img 
                                    src={alert.token_image} 
                                    alt="" 
                                    className="h-6 w-6 rounded-full"
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                  />
                                )}
                                <a
                                  href={`https://trade.padre.gg/${alert.token_mint}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium hover:text-primary flex items-center gap-1"
                                >
                                  {alert.token_symbol || alert.token_mint.slice(0, 8)}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                                <Badge variant={
                                  alert.alert_type === 'token_mint' ? 'default' :
                                  alert.alert_type === 'token_buy' ? 'secondary' : 'destructive'
                                }>
                                  {alert.alert_type.replace('_', ' ').toUpperCase()}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {alert.token_name || 'Unknown Token'}
                                {alert.amount_sol && ` • ${alert.amount_sol.toFixed(4)} SOL`}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(alert.detected_at), 'MMM d, HH:mm')}
                          </span>
                        </div>
                        
                        {/* Funding Chain Visualization */}
                        {alert.funding_chain && Array.isArray(alert.funding_chain) && alert.funding_chain.length > 0 && (
                          <div className="mt-3 flex items-center gap-1 text-xs overflow-x-auto">
                            {(alert.funding_chain as any[]).map((step: any, i: number) => (
                              <React.Fragment key={i}>
                                <span className={`px-2 py-1 rounded ${step.is_source ? 'bg-yellow-500/20 text-yellow-600' : 'bg-muted'}`}>
                                  {step.nickname || `${step.wallet.slice(0, 4)}...${step.wallet.slice(-4)}`}
                                </span>
                                {i < (alert.funding_chain as any[]).length - 1 && (
                                  <span className="text-muted-foreground">→</span>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}