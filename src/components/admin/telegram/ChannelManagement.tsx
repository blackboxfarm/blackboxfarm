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
  MessageSquare
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
}

export function ChannelManagement() {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [telegramTargets, setTelegramTargets] = useState<TelegramTarget[]>([]);
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
  }, []);

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
      setChannels((data || []) as ChannelConfig[]);
    } catch (err) {
      console.error('Error loading channels:', err);
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const addChannel = async () => {
    if (!formData.channel_username.trim()) {
      toast.error('Channel username is required');
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
          channel_id: formData.channel_username.toLowerCase(),
          channel_name: formData.channel_name || formData.channel_username,
          channel_username: formData.channel_username.toLowerCase().replace('@', ''),
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
    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ is_active: !channel.is_active })
        .eq('id', channel.id);

      if (error) throw error;

      toast.success(`Channel ${channel.is_active ? 'paused' : 'activated'}`);
      loadChannels();
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

  const updateFlipitSettings = async (channelId: string, field: string, value: number) => {
    try {
      const { error } = await supabase
        .from('telegram_channel_config')
        .update({ [field]: value })
        .eq('id', channelId);

      if (error) throw error;
      loadChannels();
    } catch (err) {
      console.error('Error updating FlipIt settings:', err);
      toast.error('Failed to update FlipIt settings');
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Channel Management</h2>
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
                
                <div className="grid grid-cols-3 gap-2 text-center">
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
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Enable to auto-execute real trades via FlipIt when trading rules match.
                    </p>
                  )}
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
