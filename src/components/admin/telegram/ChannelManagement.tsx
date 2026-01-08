import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Plus, 
  Trash2, 
  Edit,
  MessageCircle,
  Clock,
  Loader2,
  Play,
  Pause,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FileText,
  Settings2,
  Sparkles,
  MessageSquare,
  AlertTriangle,
  Target,
  Percent,
  FlaskConical,
  Wallet,
  Crown,
  Zap
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ChannelScanLogs } from './ChannelScanLogs';
import { TradingRulesManager } from './TradingRulesManager';
import { TradingKeywordsManager } from './TradingKeywordsManager';
import { useSolPrice } from '@/hooks/useSolPrice';

interface TelegramTarget {
  id: string;
  label: string;
  target_type: string;
  chat_username: string | null;
  chat_id: string | null;
}

interface ChannelConfig {
  id: string;
  channel_id: string;
  channel_name: string | null;
  channel_username: string | null;
  channel_type: string | null;
  is_active: boolean;
  fantasy_mode: boolean;
  fantasy_buy_amount_usd: number;
  ape_keyword_enabled: boolean;
  min_price_threshold: number;
  max_price_threshold: number;
  large_buy_amount_usd: number;
  standard_buy_amount_usd: number;
  max_mint_age_minutes: number;
  scan_window_minutes: number;
  total_calls_detected: number;
  total_buys_executed: number;
  last_check_at: string | null;
  trading_mode: 'simple' | 'advanced' | null;
  // FlipIt auto-buy settings
  flipit_enabled: boolean;
  flipit_buy_amount_usd: number;
  flipit_buy_amount_sol?: number | null;
  flipit_sell_multiplier: number;
  flipit_max_daily_positions: number;
  flipit_wallet_id: string | null;
  // FlipIt moonbag settings
  flipit_moonbag_enabled?: boolean;
  flipit_moonbag_sell_pct?: number;
  flipit_moonbag_keep_pct?: number;
  // Scalp Mode settings
  scalp_mode_enabled?: boolean;
  scalp_test_mode?: boolean;
  scalp_buy_amount_usd?: number;
  scalp_buy_amount_sol?: number | null;
  scalp_min_bonding_pct?: number;
  scalp_max_bonding_pct?: number;
  scalp_max_age_minutes?: number;
  scalp_min_callers?: number;
  scalp_caller_timeout_seconds?: number;
  scalp_take_profit_pct?: number;
  scalp_moon_bag_pct?: number;
  scalp_stop_loss_pct?: number;
  // Scalp slippage & priority fee settings
  scalp_buy_slippage_bps?: number;
  scalp_sell_slippage_bps?: number;
  scalp_buy_priority_fee?: string;
  scalp_sell_priority_fee?: string;
  // Analytics opt-in
  koth_enabled?: boolean;
  first_enabled?: boolean;
  // KingKong Caller Mode settings
  kingkong_mode_enabled?: boolean;
  kingkong_quick_amount_usd?: number;
  kingkong_quick_multiplier?: number;
  kingkong_diamond_amount_usd?: number;
  kingkong_diamond_trailing_stop_pct?: number;
  kingkong_diamond_min_peak_x?: number;
  kingkong_diamond_max_hold_hours?: number;
  // Polling settings
  polling_interval_seconds?: number | null;
}

interface FlipItWallet {
  id: string;
  label: string;
  pubkey: string;
  is_active: boolean;
}

const cleanTelegramHandle = (value: string) =>
  value
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/t\.me\//, '')
    .replace(/^t\.me\//, '')
    .toLowerCase();

const isNumericChatId = (value: string) => /^-?\d+$/.test(value);

const getChannelKey = (row: Pick<ChannelConfig, 'channel_id' | 'channel_username'>) => {
  const id = (row.channel_id ?? '').toString().trim();
  const uname = (row.channel_username ?? '').toString().trim();
  if (id && isNumericChatId(id)) return id;
  if (uname && isNumericChatId(uname)) return uname;
  if (uname) return cleanTelegramHandle(uname);
  if (id) return cleanTelegramHandle(id);
  return '';
};

const dedupeChannelConfigs = (rows: ChannelConfig[]) => {
  const sortKey = (r: any) => (r.updated_at ?? r.created_at ?? '').toString();
  const map = new Map<string, ChannelConfig>();
  for (const row of rows) {
    const key = getChannelKey(row) || (row as any).id;
    const existing = map.get(key);
    if (!existing || sortKey(row) > sortKey(existing)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values()).sort((a: any, b: any) => sortKey(b).localeCompare(sortKey(a)));
};

export function ChannelManagement() {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [telegramTargets, setTelegramTargets] = useState<TelegramTarget[]>([]);
  const [flipitWallets, setFlipitWallets] = useState<FlipItWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ChannelConfig | null>(null);
  const [groupTestResult, setGroupTestResult] = useState<{
    success: boolean;
    messageCount?: number;
    message: string;
  } | null>(null);
  const [testingAccess, setTestingAccess] = useState(false);
  const [sessionString, setSessionString] = useState('');
  const [savingSession, setSavingSession] = useState(false);
  const [formData, setFormData] = useState({
    channel_name: '',
    channel_username: '',
    channel_type: 'channel' as 'channel' | 'group',
    fantasy_mode: true,
    fantasy_buy_amount_usd: 100,
    ape_keyword_enabled: true,
    max_mint_age_minutes: 60,
    scan_window_minutes: 1440,
    selected_target_id: '' // For selecting from existing targets
  });
  
  // SOL price for USD conversion
  const { price: solPrice } = useSolPrice();
  
  // Per-channel scan/test state
  const [scanningChannelId, setScanningChannelId] = useState<string | null>(null);
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [expandedRules, setExpandedRules] = useState<string | null>(null);
  const [expandedKeywords, setExpandedKeywords] = useState<string | null>(null);
  const [channelTestResults, setChannelTestResults] = useState<Record<string, {
    success: boolean;
    message: string;
    messageCount?: number;
  }>>({})

  useEffect(() => {
    loadChannels();
    loadTelegramTargets();
    loadFlipitWallets();
  }, []);

  const loadFlipitWallets = async () => {
    try {
      const { data, error } = await supabase
        .from('super_admin_wallets')
        .select('id, label, pubkey, is_active')
        .eq('wallet_type', 'flipit')
        .eq('is_active', true)
        .order('label', { ascending: true });

      if (error) throw error;
      setFlipitWallets((data || []) as FlipItWallet[]);
    } catch (err) {
      console.error('Error loading FlipIt wallets:', err);
    }
  };

  const loadTelegramTargets = async () => {
    try {
      const { data, error } = await supabase
        .from('telegram_message_targets')
        .select('id, label, target_type, chat_username, chat_id')
        .order('label', { ascending: true });

      if (error) throw error;
      setTelegramTargets(data || []);
    } catch (err) {
      console.error('Error loading telegram targets:', err);
    }
  };

  const loadChannels = async () => {
    try {
      const { data, error } = await supabase
        .from('telegram_channel_config')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = (data || []) as ChannelConfig[];
      const deduped = dedupeChannelConfigs(rows);
      setChannels(deduped);
    } catch (err) {
      console.error('Error loading channels:', err);
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const addChannel = async () => {
    // Get the selected target if one was chosen
    const selectedTarget = formData.selected_target_id 
      ? telegramTargets.find(t => t.id === formData.selected_target_id)
      : null;
    
    // Use target's chat_username or chat_id, or the manual entry
    const channelIdentifier = selectedTarget?.chat_username || selectedTarget?.chat_id || formData.channel_username;
    const channelName = formData.channel_name || selectedTarget?.label || channelIdentifier;
    
    if (!channelIdentifier?.trim()) {
      toast.error('Please select a target or enter a channel username');
      return;
    }

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData?.user) {
        toast.error('You must be logged in to add a channel');
        return;
      }

      const { error } = await supabase
        .from('telegram_channel_config')
        .insert({
          user_id: userData.user.id,
          channel_id: (selectedTarget?.chat_id || channelIdentifier).toString().toLowerCase().replace('@', ''),
          channel_name: channelName,
          // For groups with only chat_id (no username), store the chat_id as channel_username for MTProto
          channel_username: (selectedTarget?.chat_username || formData.channel_username || selectedTarget?.chat_id?.toString() || channelIdentifier).toLowerCase().replace('@', ''),
          channel_type: formData.channel_type,
          is_active: true,
          fantasy_mode: formData.fantasy_mode,
          fantasy_buy_amount_usd: formData.fantasy_buy_amount_usd,
          ape_keyword_enabled: formData.ape_keyword_enabled,
          max_mint_age_minutes: formData.max_mint_age_minutes,
          scan_window_minutes: formData.scan_window_minutes,
        });

      if (error) throw error;

      toast.success('Channel added successfully');
      setShowAddDialog(false);
      resetForm();
      loadChannels();
    } catch (err: any) {
      console.error('Error adding channel:', err);
      toast.error(err?.message || 'Failed to add channel');
    }
  };

  const updateChannel = async () => {
    if (!editingChannel) return;

    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({
          channel_name: formData.channel_name,
          channel_username: formData.channel_username.toLowerCase().replace('@', ''),
          fantasy_mode: formData.fantasy_mode,
          fantasy_buy_amount_usd: formData.fantasy_buy_amount_usd,
          ape_keyword_enabled: formData.ape_keyword_enabled,
          max_mint_age_minutes: formData.max_mint_age_minutes,
          scan_window_minutes: formData.scan_window_minutes,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingChannel.id);

      if (error) throw error;

      toast.success('Channel updated');
      setEditingChannel(null);
      resetForm();
      loadChannels();
    } catch (err) {
      console.error('Error updating channel:', err);
      toast.error('Failed to update channel');
    }
  };

  const toggleChannel = async (channel: ChannelConfig) => {
    const newValue = !channel.is_active;
    
    // Optimistic update - update local state immediately
    setChannels(prev => prev.map(c => 
      c.id === channel.id ? { ...c, is_active: newValue } : c
    ));
    
    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ is_active: newValue })
        .eq('id', channel.id);

      if (error) {
        // Revert on error
        setChannels(prev => prev.map(c => 
          c.id === channel.id ? { ...c, is_active: !newValue } : c
        ));
        throw error;
      }

      toast.success(`Channel ${newValue ? 'activated' : 'paused'}`);
    } catch (err) {
      console.error('Error toggling channel:', err);
      toast.error('Failed to toggle channel');
    }
  };

  const toggleTradingMode = async (channel: ChannelConfig) => {
    const newMode = channel.trading_mode === 'advanced' ? 'simple' : 'advanced';
    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ trading_mode: newMode })
        .eq('id', channel.id);

      if (error) throw error;

      toast.success(`Switched to ${newMode} trading mode`);
      loadChannels();
    } catch (err) {
      console.error('Error toggling trading mode:', err);
      toast.error('Failed to toggle trading mode');
    }
  };

  const toggleFlipitEnabled = async (channel: ChannelConfig) => {
    try {
      const newValue = !channel.flipit_enabled;
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ flipit_enabled: newValue })
        .eq('id', channel.id);

      if (error) throw error;

      toast.success(`FlipIt auto-buy ${newValue ? 'enabled' : 'disabled'}`);
      loadChannels();
    } catch (err) {
      console.error('Error toggling FlipIt:', err);
      toast.error('Failed to toggle FlipIt');
    }
  };

  const updateFlipitSettings = async (channelId: string, field: string, value: number | string | boolean | null) => {
    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ [field]: value })
        .eq('id', channelId);

      if (error) throw error;
      loadChannels();
      if (field === 'flipit_wallet_id') {
        toast.success('Wallet assigned');
      }
    } catch (err) {
      console.error('Error updating FlipIt settings:', err);
      toast.error('Failed to update FlipIt settings');
    }
  };

  const toggleScalpMode = async (channel: ChannelConfig) => {
    try {
      const newValue = !channel.scalp_mode_enabled;
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ scalp_mode_enabled: newValue })
        .eq('id', channel.id);

      if (error) throw error;

      toast.success(`Scalp Mode ${newValue ? 'enabled' : 'disabled'}`);
      loadChannels();
    } catch (err) {
      console.error('Error toggling Scalp Mode:', err);
      toast.error('Failed to toggle Scalp Mode');
    }
  };

  const updateScalpSettings = async (channelId: string, field: string, value: number | string | boolean | null) => {
    // Optimistic update for boolean fields (toggles)
    if (typeof value === 'boolean') {
      setChannels(prev => prev.map(c => 
        c.id === channelId ? { ...c, [field]: value } : c
      ));
    }
    
    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ [field]: value })
        .eq('id', channelId);

      if (error) {
        // Revert on error for boolean fields
        if (typeof value === 'boolean') {
          setChannels(prev => prev.map(c => 
            c.id === channelId ? { ...c, [field]: !value } : c
          ));
        }
        throw error;
      }
      
      // Only reload for non-boolean fields
      if (typeof value !== 'boolean') {
        loadChannels();
      }
    } catch (err) {
      console.error('Error updating Scalp settings:', err);
      toast.error('Failed to update Scalp settings');
    }
  };

  const toggleKingKongMode = async (channel: ChannelConfig) => {
    const newValue = !channel.kingkong_mode_enabled;
    
    // Optimistic update
    setChannels(prev => prev.map(c => 
      c.id === channel.id ? { ...c, kingkong_mode_enabled: newValue } : c
    ));
    
    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ kingkong_mode_enabled: newValue })
        .eq('id', channel.id);

      if (error) {
        // Revert on error
        setChannels(prev => prev.map(c => 
          c.id === channel.id ? { ...c, kingkong_mode_enabled: !newValue } : c
        ));
        throw error;
      }

      toast.success(`KingKong Caller Mode ${newValue ? 'enabled' : 'disabled'}`);
    } catch (err) {
      console.error('Error toggling KingKong mode:', err);
      toast.error('Failed to toggle KingKong mode');
    }
  };

  const updateKingKongSettings = async (channelId: string, field: string, value: number | boolean) => {
    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ [field]: value })
        .eq('id', channelId);

      if (error) throw error;
      loadChannels();
    } catch (err) {
      console.error('Error updating KingKong settings:', err);
      toast.error('Failed to update KingKong settings');
    }
  };

  const deleteChannel = async (channelId: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) return;

    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .delete()
        .eq('id', channelId);

      if (error) throw error;

      toast.success('Channel deleted');
      loadChannels();
    } catch (err) {
      console.error('Error deleting channel:', err);
      toast.error('Failed to delete channel');
    }
  };

  const resetForm = () => {
    setFormData({
      channel_name: '',
      channel_username: '',
      channel_type: 'channel',
      fantasy_mode: true,
      fantasy_buy_amount_usd: 100,
      ape_keyword_enabled: true,
      max_mint_age_minutes: 60,
      scan_window_minutes: 1440,
      selected_target_id: ''
    });
    setGroupTestResult(null);
    setSessionString('');
  };

  const startEdit = (channel: ChannelConfig) => {
    // Find matching target by username
    const matchingTarget = telegramTargets.find(t => 
      t.chat_username?.toLowerCase() === channel.channel_username?.toLowerCase()
    );
    
    setFormData({
      channel_name: channel.channel_name || '',
      channel_username: channel.channel_username || '',
      channel_type: (channel.channel_type as 'channel' | 'group') || 'channel',
      fantasy_mode: channel.fantasy_mode,
      fantasy_buy_amount_usd: channel.fantasy_buy_amount_usd,
      ape_keyword_enabled: channel.ape_keyword_enabled,
      max_mint_age_minutes: channel.max_mint_age_minutes,
      scan_window_minutes: channel.scan_window_minutes || 1440,
      selected_target_id: matchingTarget?.id || ''
    });
    setEditingChannel(channel);
    setGroupTestResult(null);
  };

  const testGroupAccess = async (username: string) => {
    if (!username.trim()) {
      toast.error('Enter a username first');
      return;
    }
    
    setTestingAccess(true);
    setGroupTestResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { 
          action: 'test_group_access', 
          channelUsername: username.toLowerCase().replace('@', '') 
        }
      });

      if (error) throw error;
      
      // Use the correct response fields from edge function
      setGroupTestResult({
        success: data.success === true,
        messageCount: data.messageCount || 0,
        message: data.message || (data.success 
          ? `Web scraping works! Found ${data.messageCount} messages.`
          : 'This group is private or not accessible via web scraping.')
      });
    } catch (err) {
      console.error('Error testing group access:', err);
      setGroupTestResult({
        success: false,
        message: 'Failed to test access. Try again.'
      });
    } finally {
      setTestingAccess(false);
    }
  };

  const saveSessionString = async () => {
    if (!sessionString.trim()) {
      toast.error('Paste a session string first');
      return;
    }

    // Clean the session string (remove whitespace/newlines)
    const cleanedSession = sessionString.replace(/\s+/g, '');

    setSavingSession(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { action: 'save_session', code: cleanedSession }
      });

      if (error) throw error;
      
      if (data.success === false) {
        toast.error(data.error || 'Failed to save session');
        return;
      }
      
      toast.success('MTProto session saved and active!');
      setSessionString('');
      
      // Verify the session is active
      const { data: statusData } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { action: 'status' }
      });
      if (statusData?.hasSession) {
        toast.success('Verified: MTProto session is now active');
      }
    } catch (err: any) {
      console.error('Error saving session:', err);
      toast.error(err.message || 'Failed to save session');
    } finally {
      setSavingSession(false);
    }
  };

  // Scan a single channel
  const scanSingleChannel = async (channel: ChannelConfig) => {
    setScanningChannelId(channel.id);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-channel-monitor', {
        body: { 
          action: 'scan',
          singleChannel: true,
          channelId: channel.channel_id
        }
      });
      
      if (error) throw error;
      
      const processed = data?.processed || 0;
      const buys = data?.fantasyBuysExecuted || data?.buysExecuted || 0;
      
      toast.success(`Scanned @${channel.channel_username}: ${processed} tokens, ${buys} buys`);
      loadChannels();
    } catch (error: any) {
      console.error('Error scanning channel:', error);
      toast.error(`Scan failed: ${error.message}`);
    } finally {
      setScanningChannelId(null);
    }
  };

  // Test a single channel's accessibility
  const testSingleChannel = async (channel: ChannelConfig) => {
    setTestingChannelId(channel.id);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { 
          action: 'test_group_access', 
          channelUsername: channel.channel_username 
        }
      });
      
      if (error) throw error;
      
      setChannelTestResults(prev => ({
        ...prev,
        [channel.id]: {
          success: data.success,
          message: data.message || (data.success 
            ? `Accessible! Found ${data.messageCount || 0} messages` 
            : 'Not accessible via web scraping'),
          messageCount: data.messageCount
        }
      }));
      
      if (data.success) {
        toast.success(`✅ @${channel.channel_username}: ${data.messageCount || 0} messages found`);
      } else {
        toast.warning(`⚠️ @${channel.channel_username}: ${data.message}`);
      }
    } catch (error: any) {
      console.error('Error testing channel:', error);
      toast.error(`Test failed: ${error.message}`);
      setChannelTestResults(prev => ({
        ...prev,
        [channel.id]: {
          success: false,
          message: error.message
        }
      }));
    } finally {
      setTestingChannelId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderChannelForm = (isEdit: boolean) => (
    <div className="space-y-4">
      <div>
        <Label htmlFor={isEdit ? "edit_channel_name" : "channel_name"}>Display Name</Label>
        <Input
          id={isEdit ? "edit_channel_name" : "channel_name"}
          value={formData.channel_name}
          onChange={(e) => setFormData(prev => ({ ...prev, channel_name: e.target.value }))}
          placeholder="e.g., Alpha Calls"
        />
      </div>
      <div>
        <Label>Channel/Group *</Label>
        {telegramTargets.length > 0 ? (
          <>
            <Select
              value={formData.selected_target_id || 'manual'}
              onValueChange={(value) => {
                if (value === 'manual') {
                  setFormData(prev => ({ ...prev, selected_target_id: '', channel_username: '' }));
                } else {
                  const target = telegramTargets.find(t => t.id === value);
                  if (target) {
                    setFormData(prev => ({
                      ...prev,
                      selected_target_id: value,
                      channel_username: target.chat_username || '',
                      channel_name: prev.channel_name || target.label,
                      channel_type: target.target_type === 'channel' ? 'channel' : 'group'
                    }));
                  }
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select from saved targets..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    ✏️ Enter manually...
                  </span>
                </SelectItem>
                {telegramTargets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    <span className="flex items-center gap-2">
                      <MessageSquare className="h-3 w-3" />
                      {target.label}
                      <span className="text-muted-foreground text-xs">
                        (@{target.chat_username})
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Select from your saved messaging targets, or enter manually
            </p>
          </>
        ) : (
          <>
            <Input
              id={isEdit ? "edit_channel_username" : "channel_username"}
              value={formData.channel_username}
              onChange={(e) => setFormData(prev => ({ ...prev, channel_username: e.target.value }))}
              placeholder="e.g., alphacalls (without @)"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The username from t.me/username
            </p>
          </>
        )}
        
        {/* Show manual input if "manual" is selected or if a target is selected but user wants to override */}
        {formData.selected_target_id === '' && telegramTargets.length > 0 && (
          <div className="mt-2">
            <Input
              value={formData.channel_username}
              onChange={(e) => setFormData(prev => ({ ...prev, channel_username: e.target.value }))}
              placeholder="e.g., alphacalls (without @)"
            />
          </div>
        )}
      </div>
      <div>
        <Label>Type</Label>
        <div className="flex gap-2 mt-2">
          <Button
            type="button"
            size="sm"
            variant={formData.channel_type === 'channel' ? 'default' : 'outline'}
            onClick={() => setFormData(prev => ({ ...prev, channel_type: 'channel' }))}
          >
            📢 Channel
          </Button>
          <Button
            type="button"
            size="sm"
            variant={formData.channel_type === 'group' ? 'default' : 'outline'}
            onClick={() => setFormData(prev => ({ ...prev, channel_type: 'group' }))}
          >
            👥 Group
          </Button>
        </div>
      </div>

      {/* Group Access Panel */}
      {formData.channel_type === 'group' && (
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardContent className="p-3 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="text-sm font-medium text-orange-500">Group Access Required</p>
                <p className="text-xs text-muted-foreground">
                  Telegram groups don't have public feeds like channels. Let's check if we can access this one.
                </p>
              </div>
            </div>

            {/* Test Access Button */}
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => testGroupAccess(formData.channel_username)}
              disabled={!formData.channel_username.trim() || testingAccess}
              className="w-full"
            >
              {testingAccess ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Test Access to @{formData.channel_username || '...'}
            </Button>

            {/* Test Result */}
            {groupTestResult && (
              <div className={`flex items-start gap-2 p-2 rounded text-sm ${
                groupTestResult.success 
                  ? 'bg-green-500/10 text-green-500' 
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {groupTestResult.success ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                )}
                <span className="text-xs">{groupTestResult.message}</span>
              </div>
            )}

            {/* MTProto Instructions - only show if test failed */}
            {groupTestResult && !groupTestResult.success && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                  <ChevronDown className="h-3 w-3" />
                  Need MTProto session? Click for instructions
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  <div className="text-xs p-2 bg-muted rounded space-y-1">
                    <p className="font-medium">Generate session locally:</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Install Python + Telethon: <code className="bg-background px-1 rounded">pip install telethon</code></li>
                      <li>Get API credentials from <a href="https://my.telegram.org" target="_blank" rel="noopener" className="text-blue-400 underline">my.telegram.org</a></li>
                      <li>Run the script below, enter phone code</li>
                      <li>Copy the session string and paste below</li>
                    </ol>
                    <pre className="mt-2 p-2 bg-background rounded text-[10px] overflow-x-auto">
{`from telethon.sync import TelegramClient
from telethon.sessions import StringSession

api_id = YOUR_API_ID
api_hash = "YOUR_API_HASH"

with TelegramClient(StringSession(), api_id, api_hash) as client:
    print(client.session.save())`}
                    </pre>
                  </div>
                  <Input 
                    placeholder="Paste session string here..." 
                    value={sessionString}
                    onChange={(e) => setSessionString(e.target.value)}
                    className="text-xs"
                  />
                  <Button 
                    size="sm" 
                    onClick={saveSessionString}
                    disabled={!sessionString.trim() || savingSession}
                    className="w-full"
                  >
                    {savingSession ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Save Session
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      )}
      <div className="flex items-center justify-between">
        <div>
          <Label>Fantasy Mode</Label>
          <p className="text-xs text-muted-foreground">Paper trade without real money</p>
        </div>
        <Switch
          checked={formData.fantasy_mode}
          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, fantasy_mode: checked }))}
        />
      </div>
      <div>
        <Label htmlFor={isEdit ? "edit_fantasy_buy_amount" : "fantasy_buy_amount"}>Fantasy Buy Amount (USD)</Label>
        <Input
          id={isEdit ? "edit_fantasy_buy_amount" : "fantasy_buy_amount"}
          type="number"
          value={formData.fantasy_buy_amount_usd}
          onChange={(e) => setFormData(prev => ({ ...prev, fantasy_buy_amount_usd: Number(e.target.value) }))}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>APE Keyword Detection</Label>
          <p className="text-xs text-muted-foreground">Trigger on "ape" mentions</p>
        </div>
        <Switch
          checked={formData.ape_keyword_enabled}
          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, ape_keyword_enabled: checked }))}
        />
      </div>
      <div>
        <Label htmlFor={isEdit ? "edit_max_age" : "max_age"}>Max Token Age (minutes)</Label>
        <Input
          id={isEdit ? "edit_max_age" : "max_age"}
          type="number"
          value={formData.max_mint_age_minutes}
          onChange={(e) => setFormData(prev => ({ ...prev, max_mint_age_minutes: Number(e.target.value) }))}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Skip tokens minted more than this many minutes ago
        </p>
      </div>
      <div>
        <Label htmlFor={isEdit ? "edit_scan_window" : "scan_window"}>Message Scan Window (minutes)</Label>
        <Input
          id={isEdit ? "edit_scan_window" : "scan_window"}
          type="number"
          value={formData.scan_window_minutes}
          onChange={(e) => setFormData(prev => ({ ...prev, scan_window_minutes: Number(e.target.value) }))}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Process messages up to this many minutes old (1440 = 24 hours)
        </p>
      </div>
      <Button onClick={isEdit ? updateChannel : addChannel} className="w-full">
        {isEdit ? 'Save Changes' : 'Add Channel'}
      </Button>
    </div>
  );

  // Bulk enable all channels + KOTH + FIRST
  const enableAllChannels = async () => {
    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ 
          is_active: true, 
          koth_enabled: true, 
          first_enabled: true 
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (error) throw error;
      toast.success('All channels activated with KOTH + FIRST enabled!');
      loadChannels();
    } catch (err) {
      console.error('Error enabling all channels:', err);
      toast.error('Failed to enable all channels');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold">Channel Management</h2>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={enableAllChannels}
            className="border-green-500/30 text-green-400 hover:bg-green-500/10"
          >
            <Play className="h-4 w-4 mr-2" />
            Enable ALL + KOTH + FIRST
          </Button>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Channel
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Telegram Channel</DialogTitle>
              </DialogHeader>
              {renderChannelForm(false)}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Channel Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {channels.map((channel) => (
          <Card key={channel.id} className={!channel.is_active ? 'opacity-60' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-blue-500" />
                  <CardTitle className="text-lg">
                    {channel.channel_name || channel.channel_username}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {/* Channel Type Badge */}
                  <Badge variant="outline" className="text-xs">
                    {channel.channel_type === 'group' ? '👥 Group' : '📢 Channel'}
                  </Badge>
                  {channel.fantasy_mode ? (
                    <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/30">
                      Fantasy
                    </Badge>
                  ) : (
                    <Badge variant="default" className="bg-green-500">
                      Live
                    </Badge>
                  )}
                  <Badge variant={channel.is_active ? 'default' : 'secondary'}>
                    {channel.is_active ? 'Active' : 'Paused'}
                  </Badge>
                  {/* Delete button - small icon in header */}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteChannel(channel.id)}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  @{channel.channel_username}
                </p>
                
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-muted/50 rounded">
                    <p className="text-lg font-bold">{channel.total_calls_detected || 0}</p>
                    <p className="text-xs text-muted-foreground">Calls</p>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <p className="text-lg font-bold">{channel.total_buys_executed || 0}</p>
                    <p className="text-xs text-muted-foreground">Buys</p>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <p className="text-lg font-bold">${channel.fantasy_buy_amount_usd}</p>
                    <p className="text-xs text-muted-foreground">Buy Size</p>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <Select
                      value={channel.polling_interval_seconds?.toString() || 'default'}
                      onValueChange={(value) => {
                        const intervalValue = value === 'default' ? null : Number(value);
                        updateFlipitSettings(channel.id, 'polling_interval_seconds', intervalValue);
                      }}
                    >
                      <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 justify-center">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="15">15s ⚡</SelectItem>
                        <SelectItem value="30">30s</SelectItem>
                        <SelectItem value="60">60s</SelectItem>
                        <SelectItem value="120">2min</SelectItem>
                        <SelectItem value="300">5min</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Poll Rate</p>
                  </div>
                </div>

                {/* Trading Mode Toggle */}
                <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {channel.trading_mode === 'advanced' ? (
                        <Sparkles className="h-4 w-4 text-amber-500" />
                      ) : (
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">Trading Mode</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${channel.trading_mode !== 'advanced' ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                        Simple
                      </span>
                      <Switch
                        checked={channel.trading_mode === 'advanced'}
                        onCheckedChange={() => toggleTradingMode(channel)}
                      />
                      <span className={`text-xs ${channel.trading_mode === 'advanced' ? 'text-amber-500 font-medium' : 'text-muted-foreground'}`}>
                        Advanced
                      </span>
                    </div>
                  </div>
                  
                  {channel.trading_mode === 'advanced' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Uses keyword detection and configurable rules for trading decisions.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setExpandedRules(expandedRules === channel.id ? null : channel.id);
                            if (expandedKeywords === channel.id) setExpandedKeywords(null);
                          }}
                          className="border-amber-500/30 text-amber-500 hover:bg-amber-500/10 text-xs"
                        >
                          <Settings2 className="h-3 w-3 mr-1" />
                          {expandedRules === channel.id ? 'Hide Rules' : 'Configure Rules'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setExpandedKeywords(expandedKeywords === channel.id ? null : channel.id);
                            if (expandedRules === channel.id) setExpandedRules(null);
                          }}
                          className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 text-xs"
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          {expandedKeywords === channel.id ? 'Hide Keywords' : 'Manage Keywords'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Uses basic APE keyword detection with fixed thresholds.
                    </p>
                  )}
                </div>

                {/* FlipIt Auto-Buy Section */}
                <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🚀</span>
                      <span className="text-sm font-medium">FlipIt Auto-Buy</span>
                      {channel.flipit_enabled && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">
                          Active
                        </Badge>
                      )}
                    </div>
                    <Switch
                      checked={channel.flipit_enabled || false}
                      onCheckedChange={() => toggleFlipitEnabled(channel)}
                    />
                  </div>
                  
                  {channel.flipit_enabled ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        When rules match, automatically create a FlipIt position + fantasy tracking.
                      </p>
                      {/* Wallet Selector */}
                      <div className="mb-3">
                        <Label className="text-xs text-muted-foreground">Trading Wallet</Label>
                        <Select
                          value={channel.flipit_wallet_id || ''}
                          onValueChange={(value) => updateFlipitSettings(channel.id, 'flipit_wallet_id', value || null)}
                        >
                          <SelectTrigger className={`h-8 text-sm ${!channel.flipit_wallet_id ? 'border-orange-500/50 bg-orange-500/10' : ''}`}>
                            <SelectValue placeholder="Select wallet..." />
                          </SelectTrigger>
                          <SelectContent className="bg-popover border border-border">
                            {flipitWallets.length === 0 ? (
                              <div className="py-2 px-3 text-sm text-muted-foreground">No FlipIt wallets available</div>
                            ) : (
                              flipitWallets.map((wallet) => (
                                <SelectItem key={wallet.id} value={wallet.id}>
                                  {wallet.label} ({wallet.pubkey.slice(0, 4)}...{wallet.pubkey.slice(-4)})
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {!channel.flipit_wallet_id && (
                          <p className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            No wallet assigned - auto-buys won't execute
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Buy (SOL)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={channel.flipit_buy_amount_sol ?? (channel.flipit_buy_amount_usd ? (channel.flipit_buy_amount_usd / solPrice).toFixed(2) : 0.1)}
                            onChange={(e) => {
                              const solAmount = Number(e.target.value);
                              const usdAmount = solAmount * solPrice;
                              // Update both SOL and USD values
                              updateFlipitSettings(channel.id, 'flipit_buy_amount_sol', solAmount);
                              updateFlipitSettings(channel.id, 'flipit_buy_amount_usd', usdAmount);
                            }}
                            className="h-8 text-sm"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            ≈ ${((channel.flipit_buy_amount_sol ?? (channel.flipit_buy_amount_usd ? channel.flipit_buy_amount_usd / solPrice : 0.1)) * solPrice).toFixed(2)} USD
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Target (X)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={channel.flipit_sell_multiplier || 2}
                            onChange={(e) => updateFlipitSettings(channel.id, 'flipit_sell_multiplier', Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Max/Day</Label>
                          <Input
                            type="number"
                            value={channel.flipit_max_daily_positions || 5}
                            onChange={(e) => updateFlipitSettings(channel.id, 'flipit_max_daily_positions', Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      {/* Moonbag Settings */}
                      <div className={`p-2 rounded border ${
                        channel.flipit_moonbag_enabled !== false 
                          ? 'bg-emerald-500/10 border-emerald-500/30' 
                          : 'bg-muted/30 border-border/50'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">🌙</span>
                            <span className="text-sm font-medium">Moonbag</span>
                            {channel.flipit_moonbag_enabled !== false && (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
                                Active
                              </Badge>
                            )}
                          </div>
                          <Switch
                            checked={channel.flipit_moonbag_enabled !== false}
                            onCheckedChange={(checked) => updateFlipitSettings(channel.id, 'flipit_moonbag_enabled', checked)}
                          />
                        </div>
                        {channel.flipit_moonbag_enabled !== false && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">
                              At {channel.flipit_sell_multiplier || 2}x: Sell {channel.flipit_moonbag_sell_pct || 90}%, keep {channel.flipit_moonbag_keep_pct || 10}% moonbag
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground">Sell %</Label>
                                <Input
                                  type="number"
                                  step="5"
                                  min="50"
                                  max="99"
                                  value={channel.flipit_moonbag_sell_pct || 90}
                                  onChange={(e) => {
                                    const sellPct = Math.min(99, Math.max(50, Number(e.target.value)));
                                    updateFlipitSettings(channel.id, 'flipit_moonbag_sell_pct', sellPct);
                                    updateFlipitSettings(channel.id, 'flipit_moonbag_keep_pct', 100 - sellPct);
                                  }}
                                  className="h-8 text-sm"
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Keep %</Label>
                                <Input
                                  type="number"
                                  disabled
                                  value={channel.flipit_moonbag_keep_pct || 10}
                                  className="h-8 text-sm bg-muted/50"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Enable to auto-execute real trades via FlipIt when trading rules match.
                    </p>
                  )}
                </div>

                {/* Scalp Mode Section */}
                <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium">Scalp Mode</span>
                      {channel.scalp_mode_enabled && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
                          Active
                        </Badge>
                      )}
                    </div>
                    <Switch
                      checked={channel.scalp_mode_enabled || false}
                      onCheckedChange={() => toggleScalpMode(channel)}
                    />
                  </div>
                  
                  {channel.scalp_mode_enabled ? (
                    <div className="space-y-3">
                      {/* Test Mode Toggle */}
                      <div className={`flex items-center justify-between p-2 rounded border ${
                        channel.scalp_test_mode !== false 
                          ? 'bg-purple-500/10 border-purple-500/30' 
                          : 'bg-red-500/10 border-red-500/30'
                      }`}>
                        <div className="flex items-center gap-2">
                          <FlaskConical className={`h-4 w-4 ${channel.scalp_test_mode !== false ? 'text-purple-500' : 'text-red-500'}`} />
                          <div>
                            <span className="text-sm font-medium">Test Mode</span>
                            <p className="text-xs text-muted-foreground">
                              {channel.scalp_test_mode !== false 
                                ? 'Simulate trades without real transactions' 
                                : '⚠️ LIVE MODE - Real SOL will be spent!'}
                            </p>
                          </div>
                        </div>
                        <Switch 
                          checked={channel.scalp_test_mode !== false}
                          onCheckedChange={(checked) => updateScalpSettings(channel.id, 'scalp_test_mode', checked)}
                        />
                      </div>

                      {/* Trading Wallet Selector */}
                      <div>
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Wallet className="h-3 w-3" /> Trading Wallet
                        </Label>
                        <Select
                          value={channel.flipit_wallet_id || ''}
                          onValueChange={(value) => updateFlipitSettings(channel.id, 'flipit_wallet_id', value || null)}
                        >
                          <SelectTrigger className={`h-8 text-sm ${!channel.flipit_wallet_id ? 'border-orange-500/50 bg-orange-500/10' : ''}`}>
                            <SelectValue placeholder="Select wallet..." />
                          </SelectTrigger>
                          <SelectContent className="bg-popover border border-border">
                            {flipitWallets.map((wallet) => (
                              <SelectItem key={wallet.id} value={wallet.id}>
                                {wallet.label} ({wallet.pubkey.slice(0, 4)}...{wallet.pubkey.slice(-4)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!channel.flipit_wallet_id && (
                          <p className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Required for live trading
                          </p>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Low-risk scalp trades: sell {100 - (channel.scalp_moon_bag_pct || 10)}% at +{channel.scalp_take_profit_pct || 50}%, keep {channel.scalp_moon_bag_pct || 10}% moon bag.
                      </p>
                      
                      {/* Buy Amount in SOL with USD conversion */}
                      <div>
                        <Label className="text-xs text-muted-foreground">Buy Amount (SOL)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={channel.scalp_buy_amount_sol ?? (channel.scalp_buy_amount_usd ? (channel.scalp_buy_amount_usd / solPrice).toFixed(3) : 0.05)}
                          onChange={(e) => {
                            const solAmount = Number(e.target.value);
                            const usdAmount = solAmount * solPrice;
                            updateScalpSettings(channel.id, 'scalp_buy_amount_sol', solAmount);
                            updateScalpSettings(channel.id, 'scalp_buy_amount_usd', usdAmount);
                          }}
                          className="h-8 text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          ≈ ${((channel.scalp_buy_amount_sol ?? (channel.scalp_buy_amount_usd ? channel.scalp_buy_amount_usd / solPrice : 0.05)) * solPrice).toFixed(2)} USD
                        </p>
                      </div>
                      
                      {/* Exit Strategy Row */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Take Profit %</Label>
                          <Input
                            type="number"
                            step="5"
                            value={channel.scalp_take_profit_pct || 50}
                            onChange={(e) => updateScalpSettings(channel.id, 'scalp_take_profit_pct', Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Moon Bag %</Label>
                          <Input
                            type="number"
                            step="5"
                            value={channel.scalp_moon_bag_pct || 10}
                            onChange={(e) => updateScalpSettings(channel.id, 'scalp_moon_bag_pct', Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Stop Loss %</Label>
                          <Input
                            type="number"
                            step="5"
                            value={channel.scalp_stop_loss_pct || 35}
                            onChange={(e) => updateScalpSettings(channel.id, 'scalp_stop_loss_pct', Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      {/* Slippage Settings */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Buy Slippage</Label>
                          <Select
                            value={String(channel.scalp_buy_slippage_bps || 1000)}
                            onValueChange={(v) => updateScalpSettings(channel.id, 'scalp_buy_slippage_bps', Number(v))}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border border-border">
                              <SelectItem value="500">5% (Low)</SelectItem>
                              <SelectItem value="1000">10% (Standard)</SelectItem>
                              <SelectItem value="1500">15% (High)</SelectItem>
                              <SelectItem value="2000">20% (Very High)</SelectItem>
                              <SelectItem value="2500">25% (Extreme)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Sell Slippage</Label>
                          <Select
                            value={String(channel.scalp_sell_slippage_bps || 1500)}
                            onValueChange={(v) => updateScalpSettings(channel.id, 'scalp_sell_slippage_bps', Number(v))}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border border-border">
                              <SelectItem value="500">5% (Low)</SelectItem>
                              <SelectItem value="1000">10% (Standard)</SelectItem>
                              <SelectItem value="1500">15% (High)</SelectItem>
                              <SelectItem value="2000">20% (Very High)</SelectItem>
                              <SelectItem value="2500">25% (Extreme)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Priority Fee (Gas) Settings with USD */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Buy Gas Fee</Label>
                          <Select
                            value={channel.scalp_buy_priority_fee || 'medium'}
                            onValueChange={(v) => updateScalpSettings(channel.id, 'scalp_buy_priority_fee', v)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border border-border">
                              <SelectItem value="low">Low - 0.0001 SOL (${(0.0001 * solPrice).toFixed(2)})</SelectItem>
                              <SelectItem value="medium">Med - 0.0005 SOL (${(0.0005 * solPrice).toFixed(2)})</SelectItem>
                              <SelectItem value="high">High - 0.001 SOL (${(0.001 * solPrice).toFixed(2)})</SelectItem>
                              <SelectItem value="turbo">Turbo - 0.0075 SOL (${(0.0075 * solPrice).toFixed(2)})</SelectItem>
                              <SelectItem value="ultra">Ultra - 0.009 SOL (${(0.009 * solPrice).toFixed(2)})</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Sell Gas Fee</Label>
                          <Select
                            value={channel.scalp_sell_priority_fee || 'high'}
                            onValueChange={(v) => updateScalpSettings(channel.id, 'scalp_sell_priority_fee', v)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border border-border">
                              <SelectItem value="low">Low - 0.0001 SOL (${(0.0001 * solPrice).toFixed(2)})</SelectItem>
                              <SelectItem value="medium">Med - 0.0005 SOL (${(0.0005 * solPrice).toFixed(2)})</SelectItem>
                              <SelectItem value="high">High - 0.001 SOL (${(0.001 * solPrice).toFixed(2)})</SelectItem>
                              <SelectItem value="turbo">Turbo - 0.0075 SOL (${(0.0075 * solPrice).toFixed(2)})</SelectItem>
                              <SelectItem value="ultra">Ultra - 0.009 SOL (${(0.009 * solPrice).toFixed(2)})</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Bonding Curve Filters */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Percent className="h-3 w-3" /> Min Bonding
                          </Label>
                          <Input
                            type="number"
                            value={channel.scalp_min_bonding_pct || 20}
                            onChange={(e) => updateScalpSettings(channel.id, 'scalp_min_bonding_pct', Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Percent className="h-3 w-3" /> Max Bonding
                          </Label>
                          <Input
                            type="number"
                            value={channel.scalp_max_bonding_pct || 65}
                            onChange={(e) => updateScalpSettings(channel.id, 'scalp_max_bonding_pct', Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      {/* Age & Signal Filters */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Max Age (mins)</Label>
                          <Input
                            type="number"
                            value={channel.scalp_max_age_minutes || 45}
                            onChange={(e) => updateScalpSettings(channel.id, 'scalp_max_age_minutes', Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Min Callers</Label>
                          <Input
                            type="number"
                            value={channel.scalp_min_callers || 1}
                            onChange={(e) => updateScalpSettings(channel.id, 'scalp_min_callers', Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Require 2+ for multi-source validation
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Enable for structured scalp trades with pre-buy validation and moon bag exits.
                    </p>
                  )}
                </div>

                {/* KingKong Caller Mode Section */}
                <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">👑</span>
                      <span className="text-sm font-medium">KingKong Caller</span>
                      {channel.kingkong_mode_enabled && (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                          Active
                        </Badge>
                      )}
                    </div>
                    <Switch
                      checked={channel.kingkong_mode_enabled || false}
                      onCheckedChange={() => toggleKingKongMode(channel)}
                    />
                  </div>
                  
                  {channel.kingkong_mode_enabled ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Dual-position mode: executes Quick Flip + Diamond Hand simultaneously.
                      </p>
                      
                      {/* Quick Flip Settings */}
                      <div className="p-2 rounded border bg-blue-500/5 border-blue-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">🏃</span>
                          <span className="text-sm font-medium">Quick Flip</span>
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                            ${channel.kingkong_quick_amount_usd || 25}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Buy Amount (USD)</Label>
                            <Input
                              type="number"
                              step="5"
                              value={channel.kingkong_quick_amount_usd || 25}
                              onChange={(e) => updateKingKongSettings(channel.id, 'kingkong_quick_amount_usd', Number(e.target.value))}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Target (X)</Label>
                            <Input
                              type="number"
                              step="0.5"
                              value={channel.kingkong_quick_multiplier || 2}
                              onChange={(e) => updateKingKongSettings(channel.id, 'kingkong_quick_multiplier', Number(e.target.value))}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Fast exit at {channel.kingkong_quick_multiplier || 2}x, no moonbag
                        </p>
                      </div>
                      
                      {/* Diamond Hand Settings */}
                      <div className="p-2 rounded border bg-purple-500/5 border-purple-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">💎</span>
                          <span className="text-sm font-medium">Diamond Hand</span>
                          <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">
                            ${channel.kingkong_diamond_amount_usd || 100}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Buy Amount (USD)</Label>
                            <Input
                              type="number"
                              step="10"
                              value={channel.kingkong_diamond_amount_usd || 100}
                              onChange={(e) => updateKingKongSettings(channel.id, 'kingkong_diamond_amount_usd', Number(e.target.value))}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Min Peak (X)</Label>
                            <Input
                              type="number"
                              step="1"
                              value={channel.kingkong_diamond_min_peak_x || 5}
                              onChange={(e) => updateKingKongSettings(channel.id, 'kingkong_diamond_min_peak_x', Number(e.target.value))}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Trailing Stop (%)</Label>
                            <Input
                              type="number"
                              step="5"
                              value={channel.kingkong_diamond_trailing_stop_pct || 25}
                              onChange={(e) => updateKingKongSettings(channel.id, 'kingkong_diamond_trailing_stop_pct', Number(e.target.value))}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Max Hold (hours)</Label>
                            <Input
                              type="number"
                              step="1"
                              value={channel.kingkong_diamond_max_hold_hours || 24}
                              onChange={(e) => updateKingKongSettings(channel.id, 'kingkong_diamond_max_hold_hours', Number(e.target.value))}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Trail at {channel.kingkong_diamond_trailing_stop_pct || 25}% after {channel.kingkong_diamond_min_peak_x || 5}x, max {channel.kingkong_diamond_max_hold_hours || 24}h hold
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Enable for dual-position trades: quick profit + diamond hand runner.
                    </p>
                  )}
                </div>

                {/* Analytics Opt-in Toggles */}
                <div className="flex items-center gap-4 p-2 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-yellow-500" />
                    <span className="text-xs">KOTH</span>
                    <Switch
                      id={`koth-${channel.id}`}
                      checked={channel.koth_enabled !== false}
                      onCheckedChange={(checked) => updateScalpSettings(channel.id, 'koth_enabled', checked)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <span className="text-xs">FIRST</span>
                    <Switch
                      id={`first-${channel.id}`}
                      checked={channel.first_enabled !== false}
                      onCheckedChange={(checked) => updateScalpSettings(channel.id, 'first_enabled', checked)}
                    />
                  </div>
                </div>

                {channel.last_check_at && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Last checked {formatDistanceToNow(new Date(channel.last_check_at), { addSuffix: true })}
                  </div>
                )}

                {/* Per-channel test result */}
                {channelTestResults[channel.id] && (
                  <div className={`p-2 rounded text-xs flex items-center gap-2 ${
                    channelTestResults[channel.id].success 
                      ? 'bg-green-500/10 text-green-400' 
                      : 'bg-orange-500/10 text-orange-400'
                  }`}>
                    {channelTestResults[channel.id].success ? (
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 flex-shrink-0" />
                    )}
                    <span>{channelTestResults[channel.id].message}</span>
                  </div>
                )}

                {/* Action buttons - 2 rows */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {/* Scan & Test buttons */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => scanSingleChannel(channel)}
                    disabled={scanningChannelId === channel.id}
                    className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  >
                    {scanningChannelId === channel.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Scan
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testSingleChannel(channel)}
                    disabled={testingChannelId === channel.id}
                    className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                  >
                    {testingChannelId === channel.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 mr-1" />
                    )}
                    Test
                  </Button>
                  
                  {/* Pause/Activate */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleChannel(channel)}
                  >
                    {channel.is_active ? (
                      <>
                        <Pause className="h-4 w-4 mr-1" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-1" />
                        Activate
                      </>
                    )}
                  </Button>
                  
                  {/* Edit button */}
                  <Dialog open={editingChannel?.id === channel.id} onOpenChange={(open) => !open && setEditingChannel(null)}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" onClick={() => startEdit(channel)}>
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Edit Channel</DialogTitle>
                      </DialogHeader>
                      {renderChannelForm(true)}
                    </DialogContent>
                  </Dialog>
                  
                  
                  {/* View Logs button */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setExpandedLogs(expandedLogs === channel.id ? null : channel.id)}
                    className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    {expandedLogs === channel.id ? (
                      <>
                        <ChevronUp className="h-3 w-3 ml-1" />
                        Hide Logs
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 ml-1" />
                        View Logs
                      </>
                    )}
                  </Button>
                </div>
                
                {/* Expandable Rules Manager */}
                {expandedRules === channel.id && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <TradingRulesManager channelId={channel.id} />
                  </div>
                )}

                {/* Expandable Keywords Manager */}
                {expandedKeywords === channel.id && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <TradingKeywordsManager />
                  </div>
                )}
                
                {/* Expandable Scan Logs */}
                {expandedLogs === channel.id && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <ChannelScanLogs 
                      channelId={channel.channel_id}
                      channelUsername={channel.channel_username || ''}
                      configId={channel.id}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {channels.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No channels configured</h3>
            <p className="text-muted-foreground mb-4">
              Add a Telegram channel to start monitoring for token calls
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Channel
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
