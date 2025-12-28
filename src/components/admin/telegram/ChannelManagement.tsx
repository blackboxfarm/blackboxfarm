import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { 
  Plus, 
  Settings, 
  Trash2, 
  Edit,
  MessageCircle,
  TrendingUp,
  Clock,
  Loader2,
  Play,
  Pause
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
  total_calls_detected: number;
  total_buys_executed: number;
  last_check_at: string | null;
}

export function ChannelManagement() {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ChannelConfig | null>(null);
  const [formData, setFormData] = useState({
    channel_name: '',
    channel_username: '',
    channel_type: 'channel' as 'channel' | 'group',
    fantasy_mode: true,
    fantasy_buy_amount_usd: 100,
    ape_keyword_enabled: true,
    max_mint_age_minutes: 60
  });

  useEffect(() => {
    loadChannels();
  }, []);

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
      const { error } = await supabase
        .from('telegram_channel_config')
        .insert({
          channel_id: formData.channel_username.toLowerCase(),
          channel_name: formData.channel_name || formData.channel_username,
          channel_username: formData.channel_username.toLowerCase().replace('@', ''),
          channel_type: formData.channel_type,
          is_active: true,
          fantasy_mode: formData.fantasy_mode,
          fantasy_buy_amount_usd: formData.fantasy_buy_amount_usd,
          ape_keyword_enabled: formData.ape_keyword_enabled,
          max_mint_age_minutes: formData.max_mint_age_minutes
        });

      if (error) throw error;

      toast.success('Channel added successfully');
      setShowAddDialog(false);
      resetForm();
      loadChannels();
    } catch (err) {
      console.error('Error adding channel:', err);
      toast.error('Failed to add channel');
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
      max_mint_age_minutes: 60
    });
  };

  const startEdit = (channel: ChannelConfig) => {
    setFormData({
      channel_name: channel.channel_name || '',
      channel_username: channel.channel_username || '',
      channel_type: (channel.channel_type as 'channel' | 'group') || 'channel',
      fantasy_mode: channel.fantasy_mode,
      fantasy_buy_amount_usd: channel.fantasy_buy_amount_usd,
      ape_keyword_enabled: channel.ape_keyword_enabled,
      max_mint_age_minutes: channel.max_mint_age_minutes
    });
    setEditingChannel(channel);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ChannelForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="channel_name">Display Name</Label>
        <Input
          id="channel_name"
          value={formData.channel_name}
          onChange={(e) => setFormData({ ...formData, channel_name: e.target.value })}
          placeholder="e.g., Alpha Calls"
        />
      </div>
      <div>
        <Label htmlFor="channel_username">Channel/Group Username *</Label>
        <Input
          id="channel_username"
          value={formData.channel_username}
          onChange={(e) => setFormData({ ...formData, channel_username: e.target.value })}
          placeholder="e.g., alphacalls (without @)"
        />
        <p className="text-xs text-muted-foreground mt-1">
          The username from t.me/username
        </p>
      </div>
      <div>
        <Label>Type</Label>
        <div className="flex gap-2 mt-2">
          <Button
            type="button"
            size="sm"
            variant={formData.channel_type === 'channel' ? 'default' : 'outline'}
            onClick={() => setFormData({ ...formData, channel_type: 'channel' })}
          >
            📢 Channel
          </Button>
          <Button
            type="button"
            size="sm"
            variant={formData.channel_type === 'group' ? 'default' : 'outline'}
            onClick={() => setFormData({ ...formData, channel_type: 'group' })}
          >
            👥 Group
          </Button>
        </div>
        {formData.channel_type === 'group' && (
          <p className="text-xs text-orange-500 mt-2">
            ⚠️ Groups require your bot to be a member, or MTProto session
          </p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>Fantasy Mode</Label>
          <p className="text-xs text-muted-foreground">Paper trade without real money</p>
        </div>
        <Switch
          checked={formData.fantasy_mode}
          onCheckedChange={(checked) => setFormData({ ...formData, fantasy_mode: checked })}
        />
      </div>
      <div>
        <Label htmlFor="fantasy_buy_amount">Fantasy Buy Amount (USD)</Label>
        <Input
          id="fantasy_buy_amount"
          type="number"
          value={formData.fantasy_buy_amount_usd}
          onChange={(e) => setFormData({ ...formData, fantasy_buy_amount_usd: Number(e.target.value) })}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>APE Keyword Detection</Label>
          <p className="text-xs text-muted-foreground">Trigger on "ape" mentions</p>
        </div>
        <Switch
          checked={formData.ape_keyword_enabled}
          onCheckedChange={(checked) => setFormData({ ...formData, ape_keyword_enabled: checked })}
        />
      </div>
      <div>
        <Label htmlFor="max_age">Max Token Age (minutes)</Label>
        <Input
          id="max_age"
          type="number"
          value={formData.max_mint_age_minutes}
          onChange={(e) => setFormData({ ...formData, max_mint_age_minutes: Number(e.target.value) })}
        />
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Telegram Channel</DialogTitle>
            </DialogHeader>
            <ChannelForm />
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

                {channel.last_check_at && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Last checked {formatDistanceToNow(new Date(channel.last_check_at), { addSuffix: true })}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
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
                  <Dialog open={editingChannel?.id === channel.id} onOpenChange={(open) => !open && setEditingChannel(null)}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" onClick={() => startEdit(channel)}>
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Channel</DialogTitle>
                      </DialogHeader>
                      <ChannelForm isEdit />
                    </DialogContent>
                  </Dialog>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteChannel(channel.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
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
