import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Flame, Plus, Trash2, Settings, Activity, History, 
  RefreshCw, Wallet, AlertTriangle, CheckCircle, XCircle 
} from 'lucide-react';
import { format } from 'date-fns';

interface FrenzyConfig {
  id?: string;
  user_id: string;
  min_whales_for_frenzy: number;
  time_window_seconds: number;
  auto_buy_enabled: boolean;
  buy_amount_sol: number;
  max_slippage_bps: number;
  cooldown_seconds: number;
  is_active: boolean;
}

interface WhaleWallet {
  id: string;
  user_id: string;
  wallet_address: string;
  nickname: string | null;
  is_active: boolean;
  created_at: string;
}

interface FrenzyEvent {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  detected_at: string;
  whale_count: number;
  participating_wallets: unknown;
  auto_buy_executed: boolean;
  auto_buy_signature: string | null;
  auto_buy_amount_sol: number | null;
  auto_buy_error: string | null;
}

export function WhaleFrenzyDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('config');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [config, setConfig] = useState<FrenzyConfig>({
    user_id: '',
    min_whales_for_frenzy: 3,
    time_window_seconds: 120,
    auto_buy_enabled: false,
    buy_amount_sol: 0.1,
    max_slippage_bps: 500,
    cooldown_seconds: 300,
    is_active: true
  });
  
  const [whaleWallets, setWhaleWallets] = useState<WhaleWallet[]>([]);
  const [frenzyEvents, setFrenzyEvents] = useState<FrenzyEvent[]>([]);
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newWalletNickname, setNewWalletNickname] = useState('');

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    
    try {
      // Load config
      const { data: configData } = await supabase
        .from('whale_frenzy_config')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (configData) {
        setConfig(configData);
      } else {
        setConfig(prev => ({ ...prev, user_id: user.id }));
      }

      // Load whale wallets
      const { data: walletsData } = await supabase
        .from('whale_wallets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      setWhaleWallets(walletsData || []);

      // Load frenzy events
      const { data: eventsData } = await supabase
        .from('whale_frenzy_events')
        .select('*')
        .eq('user_id', user.id)
        .order('detected_at', { ascending: false })
        .limit(50);
      
      setFrenzyEvents(eventsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!user?.id) return;
    setSaving(true);

    try {
      const configToSave = { ...config, user_id: user.id };
      
      const { error } = await supabase
        .from('whale_frenzy_config')
        .upsert(configToSave, { onConflict: 'user_id' });

      if (error) throw error;
      toast.success('Configuration saved');
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast.error(error.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const addWhaleWallet = async () => {
    if (!user?.id || !newWalletAddress.trim()) return;

    try {
      const { error } = await supabase
        .from('whale_wallets')
        .insert({
          user_id: user.id,
          wallet_address: newWalletAddress.trim(),
          nickname: newWalletNickname.trim() || null
        });

      if (error) throw error;
      
      toast.success('Whale wallet added');
      setNewWalletAddress('');
      setNewWalletNickname('');
      loadData();
    } catch (error: any) {
      console.error('Error adding wallet:', error);
      toast.error(error.message || 'Failed to add wallet');
    }
  };

  const removeWhaleWallet = async (id: string) => {
    try {
      const { error } = await supabase
        .from('whale_wallets')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Wallet removed');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove wallet');
    }
  };

  const toggleWalletActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('whale_wallets')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update wallet');
    }
  };

  const checkFrenzy = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('whale-frenzy-detector', {
        body: { action: 'check_frenzy', user_id: user.id }
      });

      if (error) throw error;

      if (data.frenzies && data.frenzies.length > 0) {
        toast.success(`Found ${data.frenzies.length} active frenzy!`, {
          description: `${data.frenzies[0].whale_count} whales on token ${data.frenzies[0].token_mint.slice(0, 8)}...`
        });
      } else {
        toast.info('No active frenzies detected');
      }
      
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to check frenzy');
    }
  };

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
            <Flame className="h-6 w-6 text-orange-500" />
            Whale Feeding Frenzy Detector
          </h2>
          <p className="text-muted-foreground">
            Monitor whale wallets and detect coordinated buying activity
          </p>
        </div>
        <Button onClick={checkFrenzy} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Check Now
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="config">
            <Settings className="h-4 w-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="wallets">
            <Wallet className="h-4 w-4 mr-2" />
            Whale Wallets ({whaleWallets.length})
          </TabsTrigger>
          <TabsTrigger value="events">
            <History className="h-4 w-4 mr-2" />
            Frenzy History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Detection Settings</CardTitle>
              <CardDescription>
                Configure how frenzies are detected
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Minimum Whales for Frenzy</Label>
                  <Input
                    type="number"
                    min={2}
                    max={20}
                    value={config.min_whales_for_frenzy}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      min_whales_for_frenzy: parseInt(e.target.value) || 3 
                    }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    How many whales buying the same token triggers a frenzy
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Time Window (seconds)</Label>
                  <Input
                    type="number"
                    min={30}
                    max={600}
                    value={config.time_window_seconds}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      time_window_seconds: parseInt(e.target.value) || 120 
                    }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Buys must occur within this window to count
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Cooldown (seconds)</Label>
                  <Input
                    type="number"
                    min={60}
                    max={3600}
                    value={config.cooldown_seconds}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      cooldown_seconds: parseInt(e.target.value) || 300 
                    }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Don't trigger on same token within this period
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Auto-Buy Settings
              </CardTitle>
              <CardDescription>
                Automatically buy when a frenzy is detected (use with caution!)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Auto-Buy</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically execute buy when frenzy detected
                  </p>
                </div>
                <Switch
                  checked={config.auto_buy_enabled}
                  onCheckedChange={(checked) => setConfig(prev => ({ 
                    ...prev, 
                    auto_buy_enabled: checked 
                  }))}
                />
              </div>

              {config.auto_buy_enabled && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label>Buy Amount (SOL)</Label>
                    <Input
                      type="number"
                      min={0.01}
                      max={10}
                      step={0.01}
                      value={config.buy_amount_sol}
                      onChange={(e) => setConfig(prev => ({ 
                        ...prev, 
                        buy_amount_sol: parseFloat(e.target.value) || 0.1 
                      }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Max Slippage (bps)</Label>
                    <Input
                      type="number"
                      min={100}
                      max={2000}
                      value={config.max_slippage_bps}
                      onChange={(e) => setConfig(prev => ({ 
                        ...prev, 
                        max_slippage_bps: parseInt(e.target.value) || 500 
                      }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      500 bps = 5% slippage
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t">
                <div>
                  <Label>Detector Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable/disable the entire frenzy detector
                  </p>
                </div>
                <Switch
                  checked={config.is_active}
                  onCheckedChange={(checked) => setConfig(prev => ({ 
                    ...prev, 
                    is_active: checked 
                  }))}
                />
              </div>

              <Button onClick={saveConfig} disabled={saving} className="w-full">
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Whale Wallet</CardTitle>
              <CardDescription>
                Add wallets to monitor for coordinated buying
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Wallet address"
                  value={newWalletAddress}
                  onChange={(e) => setNewWalletAddress(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Nickname (optional)"
                  value={newWalletNickname}
                  onChange={(e) => setNewWalletNickname(e.target.value)}
                  className="w-40"
                />
                <Button onClick={addWhaleWallet} disabled={!newWalletAddress.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monitored Whale Wallets</CardTitle>
              <CardDescription>
                {whaleWallets.filter(w => w.is_active).length} active / {whaleWallets.length} total
              </CardDescription>
            </CardHeader>
            <CardContent>
              {whaleWallets.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No whale wallets added yet. Add some above!
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Wallet</TableHead>
                      <TableHead>Nickname</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {whaleWallets.map((wallet) => (
                      <TableRow key={wallet.id}>
                        <TableCell className="font-mono text-xs">
                          {wallet.wallet_address.slice(0, 8)}...{wallet.wallet_address.slice(-8)}
                        </TableCell>
                        <TableCell>{wallet.nickname || '-'}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(wallet.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={wallet.is_active}
                            onCheckedChange={(checked) => toggleWalletActive(wallet.id, checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeWhaleWallet(wallet.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
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

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Detected Frenzies
              </CardTitle>
              <CardDescription>
                History of detected whale feeding frenzies
              </CardDescription>
            </CardHeader>
            <CardContent>
              {frenzyEvents.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No frenzies detected yet. Add whale wallets and wait for coordinated buying!
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Token</TableHead>
                      <TableHead>Whales</TableHead>
                      <TableHead>Auto-Buy</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {frenzyEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="text-sm">
                          {format(new Date(event.detected_at), 'MMM d, HH:mm:ss')}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {event.token_symbol || event.token_mint.slice(0, 8) + '...'}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {event.token_mint.slice(0, 12)}...
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            <Flame className="h-3 w-3 mr-1 text-orange-500" />
                            {event.whale_count} whales
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {event.auto_buy_executed ? (
                            <span className="text-green-500 text-sm">
                              {event.auto_buy_amount_sol} SOL
                            </span>
                          ) : event.auto_buy_error ? (
                            <span className="text-red-500 text-xs">
                              {event.auto_buy_error.slice(0, 20)}...
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {event.auto_buy_executed ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : event.auto_buy_error ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <Badge variant="outline">Detected</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}