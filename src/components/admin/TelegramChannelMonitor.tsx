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
  Loader2,
  Brain,
  Sparkles,
  TrendingDown,
  Target,
  Wallet,
  Trash2,
  Trophy,
  Users,
  Send
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { FantasyPortfolioDashboard, CallerLeaderboard, ChannelManagement, TelegramTargetManager, TradingTiersManager } from './telegram';
import type { TelegramTarget } from './telegram';

interface ChannelConfig {
  id: string;
  channel_id: string;
  channel_name: string | null;
  channel_username: string | null;
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
  fantasy_mode: boolean;
  fantasy_buy_amount_usd: number;
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

interface MessageInterpretation {
  id: string;
  channel_id: string;
  message_id: number;
  raw_message: string | null;
  ai_summary: string;
  ai_interpretation: string;
  extracted_tokens: string[];
  decision: string;
  decision_reasoning: string;
  confidence_score: number;
  token_mint: string | null;
  token_symbol: string | null;
  price_at_detection: number | null;
  created_at: string;
}

interface FantasyPosition {
  id: string;
  channel_config_id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  entry_price_usd: number;
  entry_amount_usd: number;
  token_amount: number | null;
  current_price_usd: number | null;
  unrealized_pnl_usd: number | null;
  unrealized_pnl_percent: number | null;
  status: string;
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

interface MTProtoStatus {
  hasSession: boolean;
  phoneNumber?: string;
  lastUsed?: string;
}

interface FlipItWallet {
  id: string;
  label: string | null;
  pubkey: string;
}

export default function TelegramChannelMonitor() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [mtprotoStatus, setMtprotoStatus] = useState<MTProtoStatus | null>(null);
  const [configs, setConfigs] = useState<ChannelConfig[]>([]);
  const [calls, setCalls] = useState<ChannelCall[]>([]);
  const [interpretations, setInterpretations] = useState<MessageInterpretation[]>([]);
  const [fantasyPositions, setFantasyPositions] = useState<FantasyPosition[]>([]);
  const [flipitWallets, setFlipitWallets] = useState<FlipItWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isTestingBot, setIsTestingBot] = useState(false);
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [activeTab, setActiveTab] = useState('ai-log');

  // MTProto authentication state
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [twoFAPassword, setTwoFAPassword] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);

  // Send message state
  const [messageTargets, setMessageTargets] = useState<TelegramTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // New config form state
  const [newChannelId, setNewChannelId] = useState('-1002078711289');
  const [newChannelName, setNewChannelName] = useState('Blind Ape Alpha 🦍');
  const [newChannelUsername, setNewChannelUsername] = useState('blindapee');
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [isAddingConfig, setIsAddingConfig] = useState(false);
  const [isTestingChannel, setIsTestingChannel] = useState(false);
  
  // Edit config state
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editWalletId, setEditWalletId] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    loadData();
    loadMessageTargets();
  }, []);

  const loadMessageTargets = async () => {
    try {
      const { data } = await supabase
        .from('telegram_message_targets')
        .select('*')
        .order('last_used_at', { ascending: false, nullsFirst: false });
      if (data) {
        setMessageTargets(data as TelegramTarget[]);
      }
    } catch (error) {
      console.error('Error loading message targets:', error);
    }
  };

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

      // Check MTProto status
      const { data: mtprotoData } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { action: 'status' }
      });
      if (mtprotoData) {
        setMtprotoStatus(mtprotoData);
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

      // Load AI interpretations
      const { data: interpData } = await supabase
        .from('telegram_message_interpretations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (interpData) {
        setInterpretations(interpData as MessageInterpretation[]);
      }

      // Load fantasy positions
      const { data: fantasyData } = await supabase
        .from('telegram_fantasy_positions')
        .select('*')
        .order('created_at', { ascending: false });
      if (fantasyData) {
        setFantasyPositions(fantasyData as FantasyPosition[]);
      }

      // Load FlipIt wallets
      const { data: walletData } = await supabase
        .from('super_admin_wallets')
        .select('id, label, pubkey')
        .eq('wallet_type', 'flipit')
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

  // MTProto Authentication functions
  const sendMTProtoCode = async () => {
    setIsSendingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { action: 'send_code' }
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(data.message || 'Verification code sent to your phone');
        setShowCodeInput(true);
      } else {
        throw new Error(data?.error || 'Failed to send code');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to send verification code');
    } finally {
      setIsSendingCode(false);
    }
  };

  const verifyMTProtoCode = async () => {
    if (!verificationCode) {
      toast.error('Please enter the verification code');
      return;
    }
    setIsVerifyingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { 
          action: 'verify_code', 
          code: verificationCode,
          password: needs2FA ? twoFAPassword : undefined
        }
      });
      if (error) throw error;
      
      if (data?.requires2FA) {
        setNeeds2FA(true);
        toast.info('2FA password required');
      } else if (data?.success) {
        toast.success(data.message || 'Successfully authenticated!');
        setShowCodeInput(false);
        setVerificationCode('');
        setTwoFAPassword('');
        setNeeds2FA(false);
        loadData(); // Refresh to show new status
      } else {
        throw new Error(data?.error || 'Verification failed');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to verify code');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const testMTProtoSession = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { action: 'test' }
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Connected as: ${data.user?.firstName || data.user?.username}`);
      } else {
        throw new Error(data?.error || 'Test failed');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to test session');
    }
  };

  const sendTelegramMessage = async () => {
    const selectedTarget = messageTargets.find(t => t.id === selectedTargetId);
    if (!selectedTarget || !sendMessage) {
      toast.error('Select a target and enter a message');
      return;
    }
    setIsSendingMessage(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { 
          action: 'send_message',
          chatUsername: selectedTarget.target_type === 'public' ? selectedTarget.chat_username : undefined,
          chatId: selectedTarget.target_type === 'private' ? selectedTarget.chat_id : undefined,
          message: sendMessage
        }
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Message sent to ${selectedTarget.resolved_name || selectedTarget.label}`);
        setSendMessage(''); // Clear message after success
        // Update last_used_at
        await supabase
          .from('telegram_message_targets')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', selectedTargetId);
      } else {
        throw new Error(data?.error || 'Failed to send message');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to send message');
    } finally {
      setIsSendingMessage(false);
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

  const testChannelById = async (channelId: string, channelUsername?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('telegram-session-generator', {
        body: { action: 'test_channel', channelId, channelUsername }
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Channel accessible: ${data.channel?.title || data.channel?.username}`);
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
      toast.success(`Scan complete: ${data.processed} tokens, ${data.fantasyBuysExecuted || 0} fantasy buys`);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const updateFantasyPrices = async () => {
    setIsUpdatingPrices(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-fantasy-price-update', {
        body: {}
      });
      if (error) throw error;
      toast.success(`Updated ${data.updated} positions`);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update prices');
    } finally {
      setIsUpdatingPrices(false);
    }
  };

  const sellFantasyPosition = async (positionId: string) => {
    try {
      const position = fantasyPositions.find(p => p.id === positionId);
      if (!position) return;

      await supabase
        .from('telegram_fantasy_positions')
        .update({
          status: 'sold',
          sold_at: new Date().toISOString(),
          sold_price_usd: position.current_price_usd,
          realized_pnl_usd: position.unrealized_pnl_usd,
          realized_pnl_percent: position.unrealized_pnl_percent
        })
        .eq('id', positionId);

      toast.success(`Sold ${position.token_symbol} fantasy position`);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to sell position');
    }
  };

  const toggleFantasyMode = async (configId: string, currentMode: boolean) => {
    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ fantasy_mode: !currentMode })
        .eq('id', configId);

      if (error) throw error;

      toast.success(currentMode ? 'Switched to REAL trading mode' : 'Switched to Fantasy mode');
      loadData();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to toggle mode');
    }
  };

  const addChannelConfig = async () => {
    if (!selectedWalletId) {
      toast.error('Wallet is required');
      return;
    }
    if (!newChannelUsername && !newChannelId) {
      toast.error('Channel username or ID is required');
      return;
    }
    setIsAddingConfig(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const cleanUsername =
        newChannelUsername?.replace('@', '').replace('https://t.me/', '').replace('t.me/', '') || null;

      const { error } = await supabase.from('telegram_channel_config').insert({
        user_id: user.id,
        channel_id: newChannelId || `@${cleanUsername}`,
        channel_name: newChannelName || null,
        channel_username: cleanUsername,
        flipit_wallet_id: selectedWalletId,
        notification_email: notificationEmail || null,
        email_notifications: !!notificationEmail,
        is_active: true,
        fantasy_mode: true,
      });

      if (error) throw error;

      toast.success('Channel configuration added');
      loadData();
      setNewChannelId('');
      setNewChannelName('');
      setNewChannelUsername('');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add configuration');
    } finally {
      setIsAddingConfig(false);
    }
  };

  const testChannel = async () => {
    if (!newChannelUsername && !newChannelId) {
      toast.error('Enter a channel username or ID to test');
      return;
    }
    setIsTestingChannel(true);
    try {
      const cleanUsername = newChannelUsername?.replace('@', '').replace('https://t.me/', '').replace('t.me/', '') || null;
      
      const { data, error } = await supabase.functions.invoke('telegram-session-generator', {
        body: { 
          action: 'test_channel', 
          channelId: newChannelId,
          channelUsername: cleanUsername
        }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      toast.success(data.message || `Connected to ${data.channel?.title || 'channel'}`);
      
      // Auto-fill channel name if empty
      if (!newChannelName && data.channel?.title) {
        setNewChannelName(data.channel.title);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to test channel');
    } finally {
      setIsTestingChannel(false);
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
      toast.error(error?.message || 'Failed to update configuration');
    }
  };

  const deleteConfig = async (configId: string, channelName: string | null) => {
    if (!confirm(`Delete channel "${channelName || 'Unknown'}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .delete()
        .eq('id', configId);

      if (error) throw error;

      toast.success('Channel deleted');
      loadData();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete configuration');
    }
  };

  // Start editing a config
  const startEditConfig = (config: ChannelConfig) => {
    setEditingConfigId(config.id);
    setEditEmail(config.notification_email || '');
    setEditWalletId(config.flipit_wallet_id || '');
    setEditUsername(config.channel_username || '');
  };

  // Save edited config
  const saveEditConfig = async () => {
    if (!editingConfigId) return;
    setIsSavingEdit(true);
    try {
      const cleanUsername =
        editUsername?.replace('@', '').replace('https://t.me/', '').replace('t.me/', '') || null;

      const { error } = await supabase
        .from('telegram_channel_config')
        .update({
          notification_email: editEmail || null,
          email_notifications: !!editEmail,
          flipit_wallet_id: editWalletId || null,
          channel_username: cleanUsername,
        })
        .eq('id', editingConfigId);

      if (error) throw error;

      toast.success('Settings saved');
      setEditingConfigId(null);
      loadData();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save settings');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'bought':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Bought</Badge>;
      case 'fantasy_bought':
        return <Badge className="bg-purple-500"><Sparkles className="w-3 h-3 mr-1" /> Fantasy</Badge>;
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

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'buy':
        return <Badge className="bg-green-500"><DollarSign className="w-3 h-3 mr-1" /> Buy</Badge>;
      case 'fantasy_buy':
        return <Badge className="bg-purple-500"><Sparkles className="w-3 h-3 mr-1" /> Fantasy Buy</Badge>;
      case 'skip':
        return <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" /> Skip</Badge>;
      case 'no_action':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> No Action</Badge>;
      default:
        return <Badge>{decision}</Badge>;
    }
  };

  // Calculate fantasy portfolio stats
  const openPositions = fantasyPositions.filter(p => p.status === 'open');
  const totalPnl = openPositions.reduce((sum, p) => sum + (p.unrealized_pnl_usd || 0), 0);
  const totalInvested = openPositions.reduce((sum, p) => sum + p.entry_amount_usd, 0);
  const winningPositions = openPositions.filter(p => (p.unrealized_pnl_usd || 0) > 0).length;
  const winRate = openPositions.length > 0 ? (winningPositions / openPositions.length) * 100 : 0;

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
            Monitor Telegram channels for token calls with AI interpretation
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

      {/* MTProto Authentication Card */}
      <Card className={mtprotoStatus?.hasSession ? 'border-green-500/50' : 'border-orange-500/50'}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">MTProto Session</p>
              <p className="text-lg font-bold">
                {mtprotoStatus?.hasSession ? '✅ Authenticated' : '⚠️ Not Connected'}
              </p>
              {mtprotoStatus?.phoneNumber && (
                <p className="text-xs text-muted-foreground">{mtprotoStatus.phoneNumber}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {!mtprotoStatus?.hasSession && !showCodeInput && (
                <Button size="sm" onClick={sendMTProtoCode} disabled={isSendingCode}>
                  {isSendingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
                </Button>
              )}
              {mtprotoStatus?.hasSession && (
                <Button size="sm" variant="outline" onClick={testMTProtoSession}>Test</Button>
              )}
            </div>
          </div>
          {showCodeInput && (
            <div className="mt-4 space-y-2">
              <Input
                placeholder="Enter verification code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
              />
              {needs2FA && (
                <Input
                  type="password"
                  placeholder="Enter 2FA password"
                  value={twoFAPassword}
                  onChange={(e) => setTwoFAPassword(e.target.value)}
                />
              )}
              <Button size="sm" onClick={verifyMTProtoCode} disabled={isVerifyingCode}>
                {isVerifyingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send Message Card */}
      {mtprotoStatus?.hasSession && (
        <Card className="border-blue-500/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Send Telegram Message
            </CardTitle>
            <CardDescription>
              Send a message to saved public or private groups
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TelegramTargetManager
                targets={messageTargets}
                selectedTargetId={selectedTargetId}
                onSelectTarget={setSelectedTargetId}
                onTargetsChange={loadMessageTargets}
                disabled={isSendingMessage}
              />
              <div className="space-y-2">
                <Label>Message (e.g., token mint address)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter message or token mint address"
                    value={sendMessage}
                    onChange={(e) => setSendMessage(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={sendTelegramMessage} disabled={isSendingMessage || !selectedTargetId || !sendMessage}>
                    {isSendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                <p className="text-sm text-muted-foreground">Fantasy Positions</p>
                <p className="text-2xl font-bold">{openPositions.length}</p>
              </div>
              <Sparkles className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Fantasy P&L</p>
                <p className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  ${totalPnl.toFixed(2)}
                </p>
              </div>
              {totalPnl >= 0 ? (
                <TrendingUp className="w-8 h-8 text-green-500" />
              ) : (
                <TrendingDown className="w-8 h-8 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold">{winRate.toFixed(0)}%</p>
              </div>
              <Target className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="ai-log">🤖 AI Interpretation Log</TabsTrigger>
          <TabsTrigger value="fantasy">💫 Fantasy Portfolio</TabsTrigger>
          <TabsTrigger value="callers" className="flex items-center gap-1">
            <Trophy className="w-3 h-3" /> Caller Leaderboard
          </TabsTrigger>
          <TabsTrigger value="calls">Recent Calls</TabsTrigger>
          <TabsTrigger value="channels" className="flex items-center gap-1">
            <Users className="w-3 h-3" /> Channel Config
          </TabsTrigger>
          <TabsTrigger value="settings">Trading Rules</TabsTrigger>
        </TabsList>

        {/* AI Interpretation Log */}
        <TabsContent value="ai-log" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                AI Message Interpretations
              </CardTitle>
              <CardDescription>Real-time AI analysis of every channel message</CardDescription>
            </CardHeader>
            <CardContent>
              {interpretations.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No interpretations yet. Run a scan to populate.</p>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {interpretations.map((interp) => (
                    <div key={interp.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {getDecisionBadge(interp.decision)}
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(interp.created_at), { addSuffix: true })}
                          </span>
                          {interp.confidence_score && (
                            <Badge variant="outline" className="text-xs">
                              {(interp.confidence_score * 100).toFixed(0)}% confident
                            </Badge>
                          )}
                        </div>
                        {interp.token_symbol && (
                          <a 
                            href={`https://dexscreener.com/solana/${interp.token_mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-medium"
                          >
                            {interp.token_symbol}
                          </a>
                        )}
                      </div>

                      <div className="bg-muted/50 rounded p-3">
                        <p className="text-sm text-muted-foreground italic line-clamp-2">
                          "{interp.raw_message?.substring(0, 200)}..."
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">📝 AI Summary</p>
                          <p className="text-sm">{interp.ai_summary}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">🧠 Interpretation</p>
                          <p className="text-sm">{interp.ai_interpretation}</p>
                        </div>
                      </div>

                      <div className="bg-muted/30 rounded p-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1">💭 Decision Reasoning</p>
                        <p className="text-sm">{interp.decision_reasoning}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fantasy Portfolio - using new component */}
        <TabsContent value="fantasy" className="space-y-4">
          <FantasyPortfolioDashboard />
        </TabsContent>

        {/* Caller Leaderboard */}
        <TabsContent value="callers" className="space-y-4">
          <CallerLeaderboard />
        </TabsContent>

        {/* Recent Calls Tab */}
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

        {/* Channel Config Tab - using new component */}
        <TabsContent value="channels" className="space-y-4">
          <ChannelManagement />
        </TabsContent>

        {/* Trading Rules Tab */}
        <TabsContent value="settings" className="space-y-4">
          {/* Trading Tiers Manager */}
          <TradingTiersManager />
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                How Tiers Work
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  <h4 className="font-semibold text-purple-500">Fantasy Mode (Default)</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  In Fantasy Mode, the system simulates trades based on the tiers configured above.
                  This lets you test the strategy before risking capital.
                </p>
              </div>

              <div className="p-4 border rounded-lg space-y-4">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5" />
                  <h4 className="font-semibold">Real Trading Wallet</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  When Fantasy Mode is OFF, trades execute using the assigned FlipIt wallet.
                  The wallet must have sufficient SOL balance. Positions are created in the
                  `flip_positions` table and monitored by the price monitor for auto-sells.
                </p>
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
