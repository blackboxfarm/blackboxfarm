import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  Zap,
  Users,
  LayoutGrid,
  List,
  Eye,
  Twitter,
  Send
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ChannelScanLogs } from './ChannelScanLogs';
import { MonitorHealthPanel } from './MonitorHealthPanel';
import { TradingRulesManager } from './TradingRulesManager';
import { TradingKeywordsManager } from './TradingKeywordsManager';
import { ChannelConfigEditor } from './ChannelConfigEditor';
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
  // Watch mode - when true, only fantasy trades are executed
  watch_mode_fantasy_only?: boolean;
  // KingKong Caller Mode settings
  kingkong_mode_enabled?: boolean;
  kingkong_trigger_source?: 'whale_name' | 'username';
  kingkong_quick_amount_usd?: number;
  kingkong_quick_multiplier?: number;
  kingkong_diamond_amount_usd?: number;
  kingkong_diamond_trailing_stop_pct?: number;
  kingkong_diamond_min_peak_x?: number;
  kingkong_diamond_max_hold_hours?: number;
  kingkong_diamond_stop_urgency?: 'normal' | 'aggressive' | 'max';
  // Polling settings
  polling_interval_seconds?: number | null;
  price_monitor_interval_seconds?: number | null;
  // Holder count filter settings
  min_holder_count?: number;
  holder_check_enabled?: boolean;
  holder_check_action?: 'skip' | 'watchlist' | 'warn_only';
  // Fantasy buy announcement settings
  tweet_on_fantasy_buy?: boolean;
  telegram_announcements_enabled?: boolean;
}

interface AnnouncementTarget {
  id: string;
  source_channel_id: string;
  target_channel_id: string;
  target_channel_name: string | null;
  custom_message: string;
  is_active: boolean;
  sort_order: number;
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
  
  // View mode toggle: 'cards' or 'list'
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  
  // Simplified add form - just paste ID
  const [newMonitorId, setNewMonitorId] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    name: string | null;
    type: 'channel' | 'group' | null;
    valid: boolean;
  } | null>(null);
  
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
  const [showHealthPanel, setShowHealthPanel] = useState(false);
  const [channelTestResults, setChannelTestResults] = useState<Record<string, {
    success: boolean;
    message: string;
    messageCount?: number;
  }>>({});
  
  // Announcement targets state
  const [announcementTargets, setAnnouncementTargets] = useState<Record<string, AnnouncementTarget[]>>({});
  const [loadingTargets, setLoadingTargets] = useState<string | null>(null);

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

  // ============================================
  // ANNOUNCEMENT TARGETS CRUD
  // ============================================
  const loadAnnouncementTargets = async (sourceChannelId: string) => {
    setLoadingTargets(sourceChannelId);
    try {
      const { data, error } = await supabase
        .from('telegram_announcement_targets')
        .select('*')
        .eq('source_channel_id', sourceChannelId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setAnnouncementTargets(prev => ({
        ...prev,
        [sourceChannelId]: (data || []) as AnnouncementTarget[]
      }));
    } catch (err) {
      console.error('Error loading announcement targets:', err);
    } finally {
      setLoadingTargets(null);
    }
  };

  const addAnnouncementTarget = async (sourceChannelId: string, targetChannelId: string, targetChannelName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const existingTargets = announcementTargets[sourceChannelId] || [];
      const nextOrder = existingTargets.length;

      const { data, error } = await supabase
        .from('telegram_announcement_targets')
        .insert({
          source_channel_id: sourceChannelId,
          target_channel_id: targetChannelId,
          target_channel_name: targetChannelName,
          custom_message: "Aped a bit of this - DYOR - I'm just guessing",
          is_active: true,
          sort_order: nextOrder,
          user_id: user.id
        })
        .select()
        .single();

      if (error) throw error;
      
      setAnnouncementTargets(prev => ({
        ...prev,
        [sourceChannelId]: [...(prev[sourceChannelId] || []), data as AnnouncementTarget]
      }));
      toast.success('Announcement target added');
    } catch (err) {
      console.error('Error adding announcement target:', err);
      toast.error('Failed to add target');
    }
  };

  const updateAnnouncementTarget = async (targetId: string, sourceChannelId: string, updates: Partial<AnnouncementTarget>) => {
    try {
      const { error } = await supabase
        .from('telegram_announcement_targets')
        .update(updates)
        .eq('id', targetId);

      if (error) throw error;
      
      setAnnouncementTargets(prev => ({
        ...prev,
        [sourceChannelId]: (prev[sourceChannelId] || []).map(t => 
          t.id === targetId ? { ...t, ...updates } : t
        )
      }));
    } catch (err) {
      console.error('Error updating announcement target:', err);
      toast.error('Failed to update target');
    }
  };

  const deleteAnnouncementTarget = async (targetId: string, sourceChannelId: string) => {
    try {
      const { error } = await supabase
        .from('telegram_announcement_targets')
        .delete()
        .eq('id', targetId);

      if (error) throw error;
      
      setAnnouncementTargets(prev => ({
        ...prev,
        [sourceChannelId]: (prev[sourceChannelId] || []).filter(t => t.id !== targetId)
      }));
      toast.success('Announcement target removed');
    } catch (err) {
      console.error('Error deleting announcement target:', err);
      toast.error('Failed to remove target');
    }
  };

  // Simplified add monitor - just paste ID and auto-lookup
  const lookupMonitorId = async (idInput: string) => {
    const cleanId = idInput.trim().replace('@', '').replace('https://t.me/', '').replace('t.me/', '');
    if (!cleanId) {
      setLookupResult(null);
      return;
    }
    
    setLookingUp(true);
    setLookupResult(null);
    
    try {
      // Try to fetch info about the channel/group using telegram-scraper
      const { data, error } = await supabase.functions.invoke('telegram-scraper', {
        body: { 
          action: 'test_access',
          channelId: cleanId
        }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        setLookupResult({
          name: data.channelName || cleanId,
          type: data.isGroup ? 'group' : 'channel',
          valid: true
        });
      } else {
        // Even if lookup fails, we can still add it - user has the ID
        setLookupResult({
          name: cleanId,
          type: isNumericChatId(cleanId) ? 'group' : 'channel',
          valid: true // Trust the user - they have the ID
        });
      }
    } catch (err) {
      console.warn('Lookup failed, proceeding anyway:', err);
      // Still allow adding - if user has the ID, they're in it
      setLookupResult({
        name: cleanId,
        type: isNumericChatId(cleanId) ? 'group' : 'channel',
        valid: true
      });
    } finally {
      setLookingUp(false);
    }
  };

  const addMonitorSimple = async () => {
    const cleanId = newMonitorId.trim().replace('@', '').replace('https://t.me/', '').replace('t.me/', '');
    if (!cleanId) {
      toast.error('Enter a channel/group ID');
      return;
    }

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData?.user) {
        toast.error('You must be logged in');
        return;
      }

      const { error } = await supabase
        .from('telegram_channel_config')
        .insert({
          user_id: userData.user.id,
          channel_id: cleanId.toLowerCase(),
          channel_name: lookupResult?.name || cleanId,
          channel_username: cleanId.toLowerCase(),
          channel_type: lookupResult?.type || (isNumericChatId(cleanId) ? 'group' : 'channel'),
          is_active: true,
          fantasy_mode: true,
          fantasy_buy_amount_usd: 100,
          ape_keyword_enabled: true,
          max_mint_age_minutes: 60,
          scan_window_minutes: 1440,
        });

      if (error) throw error;

      toast.success('Monitor added!');
      setShowAddDialog(false);
      setNewMonitorId('');
      setLookupResult(null);
      loadChannels();
    } catch (err: any) {
      console.error('Error adding monitor:', err);
      toast.error(err?.message || 'Failed to add monitor');
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

  const updateKingKongSettings = async (channelId: string, field: string, value: number | boolean | string) => {
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
        <h2 className="text-xl font-semibold">Telegram Monitor</h2>
        <div className="flex gap-2 items-center">
          {/* View Toggle */}
          <div className="flex border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === 'cards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('cards')}
              className="rounded-none"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          
          <Button 
            variant={showHealthPanel ? 'default' : 'outline'} 
            onClick={() => setShowHealthPanel(!showHealthPanel)}
            className={showHealthPanel ? '' : 'border-blue-500/30 text-blue-400 hover:bg-blue-500/10'}
          >
            <Eye className="h-4 w-4 mr-2" />
            Monitor Health
          </Button>
          <Button 
            variant="outline" 
            onClick={enableAllChannels}
            className="border-green-500/30 text-green-400 hover:bg-green-500/10"
          >
            <Play className="h-4 w-4 mr-2" />
            Enable ALL + KOTH + FIRST
          </Button>
          <Dialog open={showAddDialog} onOpenChange={(open) => {
            setShowAddDialog(open);
            if (!open) {
              setNewMonitorId('');
              setLookupResult(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add New Monitor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Monitor</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Channel/Group ID</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Paste ID (e.g., -1002486747312 or alphacalls)"
                      value={newMonitorId}
                      onChange={(e) => {
                        setNewMonitorId(e.target.value);
                        // Auto-lookup on paste
                        if (e.target.value.length > 5) {
                          lookupMonitorId(e.target.value);
                        }
                      }}
                      className="font-mono"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => lookupMonitorId(newMonitorId)}
                      disabled={lookingUp || !newMonitorId.trim()}
                    >
                      {lookingUp ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Paste the numeric ID from TG bots or the username
                  </p>
                </div>
                
                {/* Lookup Result */}
                {lookupResult && (
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="font-medium">{lookupResult.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {lookupResult.type === 'group' ? '👥 Group' : '📢 Channel'}
                      </Badge>
                    </div>
                  </div>
                )}
                
                <Button 
                  onClick={addMonitorSimple} 
                  className="w-full"
                  disabled={!newMonitorId.trim() || lookingUp}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Monitor
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Monitor Health Panel */}
      {showHealthPanel && (
        <MonitorHealthPanel />
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {channels.map((channel) => (
                <div 
                  key={channel.id} 
                  className={`flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer transition-colors ${!channel.is_active ? 'opacity-60' : ''}`}
                  onClick={() => startEdit(channel)}
                >
                  <div className="flex items-center gap-3">
                    <MessageCircle className="h-4 w-4 text-blue-500" />
                    <div>
                      <div className="font-medium text-sm">
                        {channel.channel_name || channel.channel_username}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        @{channel.channel_username}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {/* Stats */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span title="Calls Detected">{channel.total_calls_detected || 0} calls</span>
                      <span title="Buys Executed">{channel.total_buys_executed || 0} buys</span>
                    </div>
                    
                    {/* Badges */}
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs h-5">
                        {channel.channel_type === 'group' ? '👥' : '📢'}
                      </Badge>
                      {channel.fantasy_mode ? (
                        <Badge variant="outline" className="text-xs h-5 bg-purple-500/10 text-purple-400 border-purple-500/30">
                          Fantasy
                        </Badge>
                      ) : (
                        <Badge className="text-xs h-5 bg-green-500">
                          Live
                        </Badge>
                      )}
                      <Badge variant={channel.is_active ? 'default' : 'secondary'} className="text-xs h-5">
                        {channel.is_active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleChannel(channel);
                        }}
                      >
                        {channel.is_active ? (
                          <Pause className="h-3 w-3" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(channel);
                        }}
                        title="Edit settings"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChannel(channel.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {channels.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  No monitors configured. Click "Add New Monitor" to get started.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Card View */}
      {viewMode === 'cards' && (
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
                        <SelectItem value="10">10s ⚡⚡</SelectItem>
                        <SelectItem value="15">15s ⚡</SelectItem>
                        <SelectItem value="30">30s</SelectItem>
                        <SelectItem value="60">60s</SelectItem>
                        <SelectItem value="120">2min</SelectItem>
                        <SelectItem value="300">5min</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Msg Poll</p>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <Select
                      value={channel.price_monitor_interval_seconds?.toString() || 'default'}
                      onValueChange={(value) => {
                        const intervalValue = value === 'default' ? null : Number(value);
                        updateFlipitSettings(channel.id, 'price_monitor_interval_seconds', intervalValue);
                      }}
                    >
                      <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 justify-center">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="15">15s ⚡⚡</SelectItem>
                        <SelectItem value="30">30s ⚡</SelectItem>
                        <SelectItem value="60">60s</SelectItem>
                        <SelectItem value="120">2min</SelectItem>
                        <SelectItem value="300">5min</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Price Poll</p>
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

                {/* Holder Count Filter Section */}
                <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Holder Filter</span>
                      {channel.holder_check_enabled !== false && (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                          Active
                        </Badge>
                      )}
                    </div>
                    <Switch
                      checked={channel.holder_check_enabled !== false}
                      onCheckedChange={(checked) => updateFlipitSettings(channel.id, 'holder_check_enabled', checked)}
                    />
                  </div>
                  
                  {channel.holder_check_enabled !== false ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Skip tokens with fewer than <span className="font-medium text-foreground">{channel.min_holder_count || 15}</span> holders to avoid pump-and-dump schemes.
                      </p>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Min Holders</Label>
                          <Input
                            type="number"
                            step="5"
                            min="1"
                            max="100"
                            value={channel.min_holder_count || 15}
                            onChange={(e) => updateFlipitSettings(channel.id, 'min_holder_count', Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Action</Label>
                          <Select
                            value={channel.holder_check_action || 'skip'}
                            onValueChange={(value) => updateFlipitSettings(channel.id, 'holder_check_action', value)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border border-border">
                              <SelectItem value="skip">Skip (Don't Buy)</SelectItem>
                              <SelectItem value="warn_only">Warn Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Enable to filter out low-holder tokens (pump-and-dump protection).
                    </p>
                  )}
                </div>

                {/* Fantasy Buy Announcements Section */}
                {channel.fantasy_mode && (
                <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Send className="h-4 w-4 text-cyan-500" />
                    <span className="text-sm font-medium">Fantasy Buy Announcements</span>
                  </div>
                  
                  <div className="space-y-3">
                    {/* Twitter Toggle */}
                    <div className={`flex items-center justify-between p-2 rounded border ${
                      channel.tweet_on_fantasy_buy 
                        ? 'bg-sky-500/10 border-sky-500/30' 
                        : 'bg-muted/30 border-border/50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Twitter className={`h-4 w-4 ${channel.tweet_on_fantasy_buy ? 'text-sky-500' : 'text-muted-foreground'}`} />
                        <div>
                          <span className="text-sm font-medium">Post to Twitter</span>
                          <p className="text-xs text-muted-foreground">
                            Tweet when fantasy buy is executed
                          </p>
                        </div>
                      </div>
                      <Switch 
                        checked={channel.tweet_on_fantasy_buy || false}
                        onCheckedChange={(checked) => updateFlipitSettings(channel.id, 'tweet_on_fantasy_buy', checked)}
                      />
                    </div>

                    {/* Telegram Multi-Channel Announcements */}
                    <div className={`p-2 rounded border ${
                      channel.telegram_announcements_enabled 
                        ? 'bg-cyan-500/10 border-cyan-500/30' 
                        : 'bg-muted/30 border-border/50'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <MessageSquare className={`h-4 w-4 ${channel.telegram_announcements_enabled ? 'text-cyan-500' : 'text-muted-foreground'}`} />
                          <div>
                            <span className="text-sm font-medium">Telegram Announcements</span>
                            <p className="text-xs text-muted-foreground">
                              Post to multiple groups with custom messages
                            </p>
                          </div>
                        </div>
                        <Switch 
                          checked={channel.telegram_announcements_enabled || false}
                          onCheckedChange={(checked) => {
                            updateFlipitSettings(channel.id, 'telegram_announcements_enabled', checked);
                            if (checked && !announcementTargets[channel.id]) {
                              loadAnnouncementTargets(channel.id);
                            }
                          }}
                        />
                      </div>
                      
                      {channel.telegram_announcements_enabled && (
                        <div className="space-y-2 mt-3">
                          {/* Load targets on first render */}
                          {!announcementTargets[channel.id] && loadingTargets !== channel.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-xs"
                              onClick={() => loadAnnouncementTargets(channel.id)}
                            >
                              Load announcement targets
                            </Button>
                          )}
                          
                          {loadingTargets === channel.id && (
                            <div className="flex items-center justify-center py-2">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          )}
                          
                          {/* List of configured targets */}
                          {(announcementTargets[channel.id] || []).map((target) => (
                            <div 
                              key={target.id} 
                              className={`p-2 rounded border ${target.is_active ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-muted/20 border-border/30 opacity-60'}`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Users className="h-3 w-3 text-cyan-400" />
                                  <span className="text-sm font-medium">{target.target_channel_name || target.target_channel_id}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Switch
                                    checked={target.is_active}
                                    onCheckedChange={(checked) => updateAnnouncementTarget(target.id, channel.id, { is_active: checked })}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                    onClick={() => deleteAnnouncementTarget(target.id, channel.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              <Textarea
                                value={target.custom_message}
                                onChange={(e) => updateAnnouncementTarget(target.id, channel.id, { custom_message: e.target.value })}
                                placeholder="Custom message..."
                                className="text-xs h-16 resize-none"
                              />
                            </div>
                          ))}
                          
                          {/* Add new target */}
                          <div className="pt-2 border-t border-border/30">
                            <Label className="text-xs text-muted-foreground mb-1 block">Add Target Channel</Label>
                            <Select
                              value=""
                              onValueChange={(value) => {
                                const selectedChannel = channels.find(c => c.channel_id === value);
                                if (selectedChannel) {
                                  addAnnouncementTarget(
                                    channel.id, 
                                    selectedChannel.channel_id, 
                                    selectedChannel.channel_name || selectedChannel.channel_username || selectedChannel.channel_id
                                  );
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="+ Add announcement target..." />
                              </SelectTrigger>
                              <SelectContent className="bg-popover border border-border">
                                {channels
                                  .filter(c => c.id !== channel.id && !(announcementTargets[channel.id] || []).some(t => t.target_channel_id === c.channel_id))
                                  .map((c) => (
                                    <SelectItem key={c.id} value={c.channel_id}>
                                      {c.channel_name || c.channel_username} {c.channel_type === 'group' ? '👥' : '📢'}
                                    </SelectItem>
                                  ))
                                }
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {(announcementTargets[channel.id] || []).length > 0 && (
                            <p className="text-xs text-cyan-400">
                              ⏱️ 3-second pause between groups to avoid rate limits
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                )}

                {/* Watch Mode Toggle - CRITICAL: Controls real vs fantasy trading */}
                <div className={`p-3 rounded-lg border ${
                  channel.watch_mode_fantasy_only === false 
                    ? 'bg-red-500/10 border-red-500/50' 
                    : 'bg-purple-500/10 border-purple-500/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye className={`h-4 w-4 ${channel.watch_mode_fantasy_only === false ? 'text-red-500' : 'text-purple-400'}`} />
                      <div>
                        <span className="text-sm font-medium">
                          {channel.watch_mode_fantasy_only === false ? '🔴 LIVE MODE' : '👁️ Watch Mode'}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {channel.watch_mode_fantasy_only === false 
                            ? 'Real SOL will be spent on trades!' 
                            : 'Simulation only - no real trades'}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={channel.watch_mode_fantasy_only !== false}
                      onCheckedChange={async (checked) => {
                        if (!checked) {
                          // Switching to LIVE mode - confirm first
                          const confirmed = window.confirm(
                            '⚠️ ENABLE LIVE TRADING?\n\nThis will allow REAL SOL to be spent on trades from this channel.\n\nAre you sure?'
                          );
                          if (!confirmed) return;
                        }
                        await updateFlipitSettings(channel.id, 'watch_mode_fantasy_only', checked);
                        toast.success(checked ? 'Watch mode enabled (simulation only)' : '🔴 LIVE mode enabled - real trades active!');
                      }}
                    />
                  </div>
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
                    <ChannelConfigEditor
                      channel={channel}
                      flipitWallets={flipitWallets}
                      onSaved={loadChannels}
                      section="flipit"
                    />
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
                    <ChannelConfigEditor
                      channel={channel}
                      flipitWallets={flipitWallets}
                      onSaved={loadChannels}
                      section="scalp"
                    />
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
                    <ChannelConfigEditor
                      channel={channel}
                      flipitWallets={flipitWallets}
                      onSaved={loadChannels}
                      section="kingkong"
                    />
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
      )}

      {channels.length === 0 && viewMode === 'cards' && (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No monitors configured</h3>
            <p className="text-muted-foreground mb-4">
              Add a Telegram channel or group to start monitoring for token calls
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add New Monitor
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Standalone Edit Dialog for List View */}
      {viewMode === 'list' && editingChannel && (
        <Dialog open={!!editingChannel} onOpenChange={(open) => !open && setEditingChannel(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Monitor: {editingChannel.channel_name || editingChannel.channel_username}</DialogTitle>
            </DialogHeader>
            {renderChannelForm(true)}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
