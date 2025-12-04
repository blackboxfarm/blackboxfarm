import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Flame, Plus, Trash2, Settings, Activity, History, 
  RefreshCw, Wallet, AlertTriangle, CheckCircle, XCircle, Upload,
  Monitor, Gamepad2, PlayCircle, Radio, WifiOff
} from 'lucide-react';
import { format } from 'date-fns';
import { FrenzyActivityFeed } from './whale-frenzy/FrenzyActivityFeed';
import { FantasyTradesPanel } from './whale-frenzy/FantasyTradesPanel';
import { FrenzyHistoryPlayback } from './whale-frenzy/FrenzyHistoryPlayback';

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
  twitter_handle: string | null;
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

interface ParsedWallet {
  address: string;
  nickname: string | null;
  twitter: string | null;
  valid: boolean;
  error?: string;
}

// Base58 character set for Solana addresses
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// KOLscan Top 50 Whale Wallets (Daily Leaderboard - Dec 2024)
const KOLSCAN_TOP_50 = [
  { address: 'J6TDXvarvpBdPXTaTU8eJbtso1PUCYKGkVtMKUUY8iEa', nickname: 'Pain', twitter: 'Pain_kills69' },
  { address: 'CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o', nickname: 'Cented', twitter: 'CentedSolana' },
  { address: '6mWEJG9LoRdto8TwTdZxmnJpkXpTsEerizcGiCNZvzXd', nickname: 'slingoor', twitter: 'slingdotfun' },
  { address: 'B3wagQZiZU2hKa5pUCj6rrdhWsX3Q6WfTTnki9PjwzMh', nickname: 'xander', twitter: 'xanderisnothere' },
  { address: 'DZAa55HwXgv5hStwaTEJGXZz1DhHejvpb7Yr762urXam', nickname: 'ozark', twitter: 'OzarkCalls' },
  { address: '87rRdssFiTJKY4MGARa4G5vQ31hmR7MxSmhzeaJ5AAxJ', nickname: 'Dior', twitter: 'DiorSOL' },
  { address: '3H9LVHarjBoZ2YPEsgFbVD1zuERCGwfp4AeyHoHsFSEC', nickname: 'JADAWGS', twitter: 'JasonXBT' },
  { address: '2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f', nickname: 'Cupsey', twitter: 'CupseySOL' },
  { address: 'DYmsQudNqJyyDvq86XmzAvrU9T7xwfQEwh6gPQw9TPNF', nickname: 'unprofitable', twitter: 'unprofitabIe' },
  { address: '4nvNc7dDEqKKLM4Sr9Kgk3t1of6f8G66kT64VoC95LYh', nickname: 'MAMBA', twitter: 'maboroshisol' },
  { address: '78N177fzNJpp8pG49xDv1efYcTMSzo9tPTKEA9mAVkh2', nickname: 'Sheep', twitter: 'sheepsolana' },
  { address: '4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk', nickname: 'Jijo', twitter: 'jijocrypto' },
  { address: '5B79fMkcFeRTiwm7ehsZsFiKsC7m7n1Bgv9yLxPp9q2X', nickname: 'bandit', twitter: 'banditsol' },
  { address: 'B32QbbdDAyhvUQzjcaM5j6ZVKwjCxAwGH5Xgvb9SJqnC', nickname: 'Kadenox', twitter: 'Kadenox_' },
  { address: 'Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt', nickname: 'theo', twitter: 'Theoodorus' },
  { address: 'Ez2jp3rwXUbaTx7XwiHGaWVgTPFdzJoSg8TopqbxfaJN', nickname: 'Keano', twitter: 'KeanoBets' },
  { address: '71PCu3E4JP5RDBoY6wJteqzxkKNXLyE1byg5BTAL9UtQ', nickname: 'Ramset', twitter: 'Ramsettrades' },
  { address: '4cXnf2z85UiZ5cyKsPMEULq1yufAtpkatmX4j4DBZqj2', nickname: 'WaiterG', twitter: 'WaiterGSol' },
  { address: 'xyzfhxfy8NhfeNG3Um3WaUvFXzNuHkrhrZMD8dsStB6', nickname: 'Gasp', twitter: 'GaspSOL' },
  { address: 'DjM7Tu7whh6P3pGVBfDzwXAx2zaw51GJWrJE3PwtuN7s', nickname: 'LUKEY', twitter: 'LukeySOL' },
  { address: '5T229oePmJGE5Cefys8jE9Jq8C7qfGNNWy3RVA7SmwEP', nickname: 'Tuults', twitter: 'Tuults' },
  { address: 'BtMBMPkoNbnLF9Xn552guQq528KKXcsNBNNBre3oaQtr', nickname: 'Letterbomb', twitter: 'LetterbombSOL' },
  { address: '39q2g5tTQn9n7KnuapzwS2smSx3NGYqBoea11tBjsGEt', nickname: 'Walta', twitter: 'WaltaSol' },
  { address: '5sNnKuWKUtZkdC1eFNyqz3XHpNoCRQ1D1DfHcNHMV7gn', nickname: 'cryptovillain26', twitter: 'cryptovillain26' },
  { address: '8AtQ4ka3dgtrH1z4Uq3Tm4YdMN3cK5RRj1eKuGNnvenm', nickname: 'peacefuldestroy', twitter: 'peacefuldestroy' },
  { address: '4AHgEkTsGqY77qtde4UJn9yZCrbGcM7UM3vjT3qM4G5H', nickname: 'BagCalls', twitter: 'BagCalls' },
  { address: '4uCT4g7YHH4xxfmfNfKUDenwGrRNGoZ9Ay1XFxfUGhQG', nickname: 'chingchongslayer', twitter: null },
  { address: 'uS74rigLoPmKdi169RPUB4VSF6T9PqChTpG5jWzVhVp', nickname: 'para', twitter: 'paraSOL_' },
  { address: '215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP', nickname: 'OGAntD', twitter: 'OGAntD' },
  { address: '7tiRXPM4wwBMRMYzmywRAE6jveS3gDbNyxgRrEoU6RLA', nickname: 'Qtdegen', twitter: 'Qtdegen' },
  { address: '2W14ahXD3XBfWJchQ4K5NLXmguWWcTTUTuHDhEzeuvP3', nickname: 'Veloce', twitter: 'Veloce_SOL' },
  { address: 'PMJA8UQDyWTFw2Smhyp9jGA6aTaP7jKHR7BPudrgyYN', nickname: 'chester', twitter: 'chesterSOL' },
  { address: 'FsG3BaPmRTdSrPaivbgJsFNCCa8cPfkUtk8VLWXkHpHP', nickname: 'Reljoo', twitter: 'Reljoo_' },
  { address: 'DEdEW3SMPU2dCfXEcgj2YppmX9H3bnMDJaU4ctn2BQDQ', nickname: 'King Solomon', twitter: 'KingSolomonSOL' },
  { address: 'Dxudj2DQ5odnqgZvUocaeWc1eYC78Q8vfmVtPpvTrRNh', nickname: 'storm', twitter: 'stormsolana' },
  { address: 'FTg1gqW7vPm4kdU1LPM7JJnizbgPdRDy2PitKw6mY27j', nickname: '7', twitter: 'SevenSOL_' },
  { address: '5fHJszey2UdB2nETS1y6NS2wSG4ic9byKtbgJzaYzGeV', nickname: 'k4ye', twitter: 'k4ye_sol' },
  { address: 'DYAn4XpAkN5mhiXkRB7dGq4Jadnx6XYgu8L5b3WGhbrt', nickname: 'The Doc', twitter: 'TheDocSOL' },
  { address: '6S8GezkxYUfZy9JPtYnanbcZTMB87Wjt1qx3c6ELajKC', nickname: 'Nyhrox', twitter: 'Nyhrox' },
  { address: '4sAUSQFdvWRBxR8UoLBYbw8CcXuwXWxnN8pXa4mtm5nU', nickname: 'Scharo', twitter: 'ScharoTrading' },
  { address: 'G2mgnzpr59vYjKpwU9q5zVfS9yQ9HezMwjuqF7LACvR4', nickname: 'fz7', twitter: 'fz7_sol' },
  { address: 'AeLaMjzxErZt4drbWVWvcxpVyo8p94xu5vrg41eZPFe3', nickname: '1s1mple', twitter: '1s1mple_sol' },
  { address: '99xnE2zEFi8YhmKDaikc1EvH6ELTQJppnqUwMzmpLXrs', nickname: 'Coler', twitter: 'ColerSOL' },
  { address: 'ETU3GyrUsv6UztQJxHgsBX2UoJFmq79WJe3JyDpAqGMz', nickname: 'MACXBT', twitter: 'MACXBT' },
  { address: 'EA4MXkyF8C2NzY8fw2acJPuarmoU271KRCCAYpLzMBJr', nickname: 'Grimace', twitter: 'GrimaceSOL' },
  { address: '2octNbV8QTtaFMJtbWhtkqMQt3deBe4D8mYcNworhv3t', nickname: 'Sugus', twitter: 'SugusSOL' },
  { address: '9f5ywdCDA4QhSktBomozpHmZfSLqS6J9VqCrRehYWh1p', nickname: 'matsu', twitter: 'matsu_sol' },
  { address: 'ADC1QV9raLnGGDbnWdnsxazeZ4Tsiho4vrWadYswA2ph', nickname: 'Ducky', twitter: 'DuckySOL' },
  { address: 'AGqjivJr1dSv73TVUvdtqAwogzmThzvYMVXjGWg2FYLm', nickname: 'noob mini', twitter: 'noobmini_sol' },
  { address: 'EP5mvfhGv6x1XR33Fd8eioiYjtRXAawafPmkz9xBpDvG', nickname: 'Zemrics', twitter: 'Zemrics' },
];

function parseWalletInput(input: string, existingAddresses: Set<string>): ParsedWallet[] {
  const lines = input.split('\n').map(line => line.trim()).filter(Boolean);
  const seen = new Set<string>();
  
  return lines.map(line => {
    const parts = line.split(',').map(s => s.trim());
    const [address, nickname, twitter] = parts;
    
    if (!address) {
      return { address: '', nickname: null, twitter: null, valid: false, error: 'Empty line' };
    }
    
    if (!BASE58_REGEX.test(address)) {
      return { address, nickname: nickname || null, twitter: twitter || null, valid: false, error: 'Invalid Solana address format' };
    }
    
    if (existingAddresses.has(address)) {
      return { address, nickname: nickname || null, twitter: twitter || null, valid: false, error: 'Already in your list' };
    }
    
    if (seen.has(address)) {
      return { address, nickname: nickname || null, twitter: twitter || null, valid: false, error: 'Duplicate in paste' };
    }
    
    seen.add(address);
    return { address, nickname: nickname || null, twitter: twitter || null, valid: true };
  });
}

export function WhaleFrenzyDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('config');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  
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
  const [bulkWalletInput, setBulkWalletInput] = useState('');
  const [monitoringStatus, setMonitoringStatus] = useState<{
    active: boolean;
    addressCount: number;
    webhookId: string | null;
  }>({ active: false, addressCount: 0, webhookId: null });
  const [togglingMonitoring, setTogglingMonitoring] = useState(false);

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

  const existingAddresses = useMemo(() => 
    new Set(whaleWallets.map(w => w.wallet_address)), 
    [whaleWallets]
  );

  const parsedWallets = useMemo(() => 
    bulkWalletInput ? parseWalletInput(bulkWalletInput, existingAddresses) : [],
    [bulkWalletInput, existingAddresses]
  );

  const validWallets = parsedWallets.filter(w => w.valid);
  const invalidWallets = parsedWallets.filter(w => !w.valid);

  const importWhaleWallets = async () => {
    if (!user?.id || validWallets.length === 0) return;
    setImporting(true);

    try {
      const walletsToInsert = validWallets.map(w => ({
        user_id: user.id,
        wallet_address: w.address,
        nickname: w.nickname,
        twitter_handle: w.twitter
      }));

      const { error } = await supabase
        .from('whale_wallets')
        .insert(walletsToInsert);

      if (error) throw error;
      
      toast.success(`Added ${validWallets.length} whale wallets`);
      setBulkWalletInput('');
      loadData();
    } catch (error: any) {
      console.error('Error importing wallets:', error);
      toast.error(error.message || 'Failed to import wallets');
    } finally {
      setImporting(false);
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

  const checkMonitoringStatus = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.functions.invoke('helius-webhook-manager', {
        body: { action: 'status', user_id: user.id }
      });
      if (!error && data) {
        setMonitoringStatus({
          active: data.active || false,
          addressCount: data.addressCount || 0,
          webhookId: data.webhookId || null
        });
      }
    } catch (e) {
      console.error('Error checking monitoring status:', e);
    }
  };

  const toggleMonitoring = async () => {
    if (!user?.id) return;
    setTogglingMonitoring(true);
    
    try {
      const action = monitoringStatus.active ? 'delete' : 'create';
      const { data, error } = await supabase.functions.invoke('helius-webhook-manager', {
        body: { action, user_id: user.id }
      });

      if (error) throw error;

      if (action === 'create') {
        toast.success(`Real-time monitoring enabled for ${data.addressCount} wallets`);
        setMonitoringStatus({
          active: true,
          addressCount: data.addressCount,
          webhookId: data.webhookId
        });
      } else {
        toast.success('Real-time monitoring disabled');
        setMonitoringStatus({ active: false, addressCount: 0, webhookId: null });
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to toggle monitoring');
    } finally {
      setTogglingMonitoring(false);
    }
  };

  // Check monitoring status on load
  useEffect(() => {
    if (user?.id) {
      checkMonitoringStatus();
    }
  }, [user?.id]);

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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
            {monitoringStatus.active ? (
              <>
                <Radio className="h-4 w-4 text-green-500 animate-pulse" />
                <span className="text-sm font-medium text-green-600">
                  Live ({monitoringStatus.addressCount} wallets)
                </span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Offline</span>
              </>
            )}
            <Button 
              size="sm" 
              variant={monitoringStatus.active ? "destructive" : "default"}
              onClick={toggleMonitoring}
              disabled={togglingMonitoring || whaleWallets.length === 0}
            >
              {togglingMonitoring ? 'Processing...' : monitoringStatus.active ? 'Stop' : 'Start Monitoring'}
            </Button>
          </div>
          <Button onClick={checkFrenzy} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Check Now
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="config">
            <Settings className="h-4 w-4 mr-2" />
            Config
          </TabsTrigger>
          <TabsTrigger value="wallets">
            <Wallet className="h-4 w-4 mr-2" />
            Wallets ({whaleWallets.length})
          </TabsTrigger>
          <TabsTrigger value="monitor">
            <Monitor className="h-4 w-4 mr-2" />
            Live Monitor
          </TabsTrigger>
          <TabsTrigger value="fantasy">
            <Gamepad2 className="h-4 w-4 mr-2" />
            Fantasy Mode
          </TabsTrigger>
          <TabsTrigger value="playback">
            <PlayCircle className="h-4 w-4 mr-2" />
            Playback
          </TabsTrigger>
          <TabsTrigger value="events">
            <History className="h-4 w-4 mr-2" />
            History
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
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Mass Import Whale Wallets
              </CardTitle>
              <CardDescription>
                Paste wallet addresses, one per line. Optionally add a nickname with comma: <code className="text-xs bg-muted px-1 rounded">address,nickname</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 mb-2">
                <Button
                  variant="default"
                  size="sm"
                  disabled={importing}
                  onClick={async () => {
                    if (!user?.id) return;
                    setImporting(true);
                    try {
                      // Filter out wallets that already exist
                      const newWallets = KOLSCAN_TOP_50.filter(
                        w => !existingAddresses.has(w.address)
                      );
                      
                      if (newWallets.length === 0) {
                        toast.info('All KOLscan Top 50 wallets are already in your list');
                        return;
                      }

                      const walletsToInsert = newWallets.map(w => ({
                        user_id: user.id,
                        wallet_address: w.address,
                        nickname: w.nickname,
                        twitter_handle: w.twitter
                      }));

                      const { error } = await supabase
                        .from('whale_wallets')
                        .insert(walletsToInsert);

                      if (error) throw error;
                      
                      toast.success(`Added ${newWallets.length} KOLscan whale wallets`);
                      loadData();
                    } catch (error: any) {
                      console.error('Error importing KOLscan wallets:', error);
                      toast.error(error.message || 'Failed to import wallets');
                    } finally {
                      setImporting(false);
                    }
                  }}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {importing ? 'Importing...' : 'Import KOLscan Top 50'}
                </Button>
              </div>
              <Textarea
                placeholder={`Paste wallet addresses here, one per line...\n\nFormat: address,nickname,twitter_handle\n\nExamples:\nAbc123xyz789...\nDef456abc123...,WhaleKing,@whaleking\nGhi789def456...,BigBuyer,bigbuyer_sol`}
                value={bulkWalletInput}
                onChange={(e) => setBulkWalletInput(e.target.value)}
                className="min-h-[150px] font-mono text-sm"
              />
              
              {parsedWallets.length > 0 && (
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-green-600">{validWallets.length} valid</span>
                  </div>
                  {invalidWallets.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="text-destructive">{invalidWallets.length} invalid/duplicate</span>
                    </div>
                  )}
                </div>
              )}

              {invalidWallets.length > 0 && (
                <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded max-h-20 overflow-auto">
                  {invalidWallets.slice(0, 5).map((w, i) => (
                    <div key={i} className="truncate">
                      <span className="text-destructive">{w.address.slice(0, 20)}...</span>
                      <span className="ml-2">({w.error})</span>
                    </div>
                  ))}
                  {invalidWallets.length > 5 && (
                    <div className="text-muted-foreground">...and {invalidWallets.length - 5} more</div>
                  )}
                </div>
              )}

              <Button 
                onClick={importWhaleWallets} 
                disabled={validWallets.length === 0 || importing}
                className="w-full"
              >
                {importing ? (
                  <>Importing...</>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Import {validWallets.length} Wallet{validWallets.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
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

        <TabsContent value="monitor" className="space-y-4">
          {user?.id && (
            <FrenzyActivityFeed 
              userId={user.id} 
              minWhalesForFrenzy={config.min_whales_for_frenzy}
            />
          )}
        </TabsContent>

        <TabsContent value="fantasy" className="space-y-4">
          {user?.id && <FantasyTradesPanel userId={user.id} />}
        </TabsContent>

        <TabsContent value="playback" className="space-y-4">
          {user?.id && <FrenzyHistoryPlayback userId={user.id} />}
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