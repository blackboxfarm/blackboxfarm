import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, GripVertical, RefreshCw, ChevronUp, ChevronDown, Copy, Zap } from 'lucide-react';

interface TradingRule {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  channel_id: string | null;
  required_keywords: string[];
  excluded_keywords: string[];
  min_keyword_weight: number | null;
  min_price_usd: number | null;
  max_price_usd: number | null;
  bonding_curve_position: string | null;
  min_bonding_pct: number | null;
  max_bonding_pct: number | null;
  require_on_curve: boolean | null;
  require_graduated: boolean | null;
  min_age_minutes: number | null;
  max_age_minutes: number | null;
  min_market_cap_usd: number | null;
  max_market_cap_usd: number | null;
  platforms: string[];
  buy_amount_usd: number;
  sell_target_multiplier: number;
  stop_loss_pct: number | null;
  stop_loss_enabled: boolean;
  fallback_to_fantasy: boolean;
}

interface ChannelConfig {
  id: string;
  channel_name: string;
}

const BONDING_POSITIONS = [
  { value: 'any', label: 'Any Position' },
  { value: 'early', label: 'Early (0-25%)' },
  { value: 'mid', label: 'Mid (25-75%)' },
  { value: 'late', label: 'Late (75-100%)' },
  { value: 'graduated', label: 'Graduated' },
];

const PLATFORMS = ['pump.fun', 'raydium', 'orca', 'moonshot'];

const DEFAULT_RULE: Partial<TradingRule> = {
  name: '',
  description: '',
  priority: 100,
  is_active: true,
  channel_id: null,
  required_keywords: [],
  excluded_keywords: [],
  min_keyword_weight: null,
  min_price_usd: null,
  max_price_usd: null,
  bonding_curve_position: 'any',
  min_bonding_pct: null,
  max_bonding_pct: null,
  require_on_curve: null,
  require_graduated: null,
  min_age_minutes: null,
  max_age_minutes: null,
  min_market_cap_usd: null,
  max_market_cap_usd: null,
  platforms: [],
  buy_amount_usd: 50,
  sell_target_multiplier: 2.0,
  stop_loss_pct: null,
  stop_loss_enabled: false,
  fallback_to_fantasy: true,
};

export function TradingRulesManager() {
  const [rules, setRules] = useState<TradingRule[]>([]);
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TradingRule | null>(null);
  const [formData, setFormData] = useState<Partial<TradingRule>>(DEFAULT_RULE);
  const [keywordsInput, setKeywordsInput] = useState('');
  const [excludedKeywordsInput, setExcludedKeywordsInput] = useState('');
  const [platformsInput, setPlatformsInput] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesRes, channelsRes] = await Promise.all([
        supabase.from('trading_rules').select('*').order('priority', { ascending: true }),
        supabase.from('telegram_channel_config').select('id, channel_name')
      ]);

      if (rulesRes.error) throw rulesRes.error;
      if (channelsRes.error) throw channelsRes.error;

      setRules(rulesRes.data || []);
      setChannels(channelsRes.data || []);
    } catch (err) {
      console.error('Error loading data:', err);
      toast.error('Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingRule(null);
    setFormData(DEFAULT_RULE);
    setKeywordsInput('');
    setExcludedKeywordsInput('');
    setPlatformsInput([]);
    setIsDialogOpen(true);
  };

  const openEditDialog = (rule: TradingRule) => {
    setEditingRule(rule);
    setFormData(rule);
    setKeywordsInput(rule.required_keywords?.join(', ') || '');
    setExcludedKeywordsInput(rule.excluded_keywords?.join(', ') || '');
    setPlatformsInput(rule.platforms || []);
    setIsDialogOpen(true);
  };

  const duplicateRule = (rule: TradingRule) => {
    setEditingRule(null);
    setFormData({
      ...rule,
      id: undefined,
      name: `${rule.name} (Copy)`,
      priority: rule.priority + 1
    });
    setKeywordsInput(rule.required_keywords?.join(', ') || '');
    setExcludedKeywordsInput(rule.excluded_keywords?.join(', ') || '');
    setPlatformsInput(rule.platforms || []);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      toast.error('Rule name is required');
      return;
    }

    try {
      const ruleData = {
        ...formData,
        required_keywords: keywordsInput.split(',').map(k => k.trim().toLowerCase()).filter(Boolean),
        excluded_keywords: excludedKeywordsInput.split(',').map(k => k.trim().toLowerCase()).filter(Boolean),
        platforms: platformsInput,
        channel_id: formData.channel_id === 'global' ? null : formData.channel_id
      };

      if (editingRule) {
        const { error } = await supabase
          .from('trading_rules')
          .update(ruleData as any)
          .eq('id', editingRule.id);
        if (error) throw error;
        toast.success('Rule updated');
      } else {
        const { error } = await supabase.from('trading_rules').insert(ruleData);
        if (error) throw error;
        toast.success('Rule created');
      }

      setIsDialogOpen(false);
      loadData();
    } catch (err) {
      console.error('Error saving rule:', err);
      toast.error('Failed to save rule');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rule?')) return;

    try {
      const { error } = await supabase.from('trading_rules').delete().eq('id', id);
      if (error) throw error;
      toast.success('Rule deleted');
      loadData();
    } catch (err) {
      console.error('Error deleting rule:', err);
      toast.error('Failed to delete rule');
    }
  };

  const handleToggleActive = async (rule: TradingRule) => {
    try {
      const { error } = await supabase
        .from('trading_rules')
        .update({ is_active: !rule.is_active })
        .eq('id', rule.id);
      if (error) throw error;
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
    } catch (err) {
      console.error('Error toggling rule:', err);
      toast.error('Failed to update rule');
    }
  };

  const movePriority = async (rule: TradingRule, direction: 'up' | 'down') => {
    const currentIndex = rules.findIndex(r => r.id === rule.id);
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (swapIndex < 0 || swapIndex >= rules.length) return;

    const swapRule = rules[swapIndex];
    
    try {
      await Promise.all([
        supabase.from('trading_rules').update({ priority: swapRule.priority }).eq('id', rule.id),
        supabase.from('trading_rules').update({ priority: rule.priority }).eq('id', swapRule.id)
      ]);
      loadData();
    } catch (err) {
      console.error('Error moving priority:', err);
      toast.error('Failed to update priority');
    }
  };

  const getChannelName = (channelId: string | null) => {
    if (!channelId) return 'Global';
    const channel = channels.find(c => c.id === channelId);
    return channel?.channel_name || 'Unknown';
  };

  const renderConditionBadges = (rule: TradingRule) => {
    const badges = [];
    
    if (rule.required_keywords?.length > 0) {
      badges.push(
        <Badge key="kw" variant="outline" className="text-xs">
          🏷️ {rule.required_keywords.slice(0, 3).join(', ')}{rule.required_keywords.length > 3 ? '...' : ''}
        </Badge>
      );
    }
    
    if (rule.min_price_usd !== null || rule.max_price_usd !== null) {
      badges.push(
        <Badge key="price" variant="outline" className="text-xs">
          💰 ${rule.min_price_usd || 0} - ${rule.max_price_usd || '∞'}
        </Badge>
      );
    }
    
    if (rule.bonding_curve_position && rule.bonding_curve_position !== 'any') {
      badges.push(
        <Badge key="curve" variant="outline" className="text-xs">
          📈 {rule.bonding_curve_position}
        </Badge>
      );
    }
    
    if (rule.max_age_minutes) {
      badges.push(
        <Badge key="age" variant="outline" className="text-xs">
          ⏱️ &lt;{rule.max_age_minutes}min
        </Badge>
      );
    }
    
    if (rule.platforms?.length > 0) {
      badges.push(
        <Badge key="plat" variant="outline" className="text-xs">
          🔗 {rule.platforms.join(', ')}
        </Badge>
      );
    }
    
    return badges;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Trading Rules Engine
            </CardTitle>
            <CardDescription>
              Configure advanced trading rules for automated decisions
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Add Rule
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rules List */}
        <div className="space-y-2">
          {rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {loading ? 'Loading...' : 'No trading rules configured. Add your first rule to get started.'}
            </div>
          ) : (
            rules.map((rule, index) => (
              <Card key={rule.id} className={`${!rule.is_active ? 'opacity-50' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex flex-col items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => movePriority(rule, 'up')}
                          disabled={index === 0}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground font-mono">#{rule.priority}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => movePriority(rule, 'down')}
                          disabled={index === rules.length - 1}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{rule.name}</h4>
                          <Badge variant={rule.channel_id ? 'secondary' : 'default'} className="text-xs">
                            {getChannelName(rule.channel_id)}
                          </Badge>
                        </div>
                        
                        {rule.description && (
                          <p className="text-sm text-muted-foreground mb-2">{rule.description}</p>
                        )}
                        
                        <div className="flex flex-wrap gap-1 mb-2">
                          {renderConditionBadges(rule)}
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-green-500 font-medium">
                            Buy: ${rule.buy_amount_usd}
                          </span>
                          <span className="text-blue-500">
                            Target: {rule.sell_target_multiplier}x
                          </span>
                          {rule.stop_loss_enabled && rule.stop_loss_pct && (
                            <span className="text-red-500">
                              Stop: -{rule.stop_loss_pct}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={() => handleToggleActive(rule)}
                      />
                      <Button variant="ghost" size="sm" onClick={() => duplicateRule(rule)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(rule)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(rule.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Rule Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRule ? 'Edit Rule' : 'Create Rule'}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Rule Name *</Label>
                  <Input
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., APE Full Send"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority (lower = higher priority)</Label>
                  <Input
                    type="number"
                    value={formData.priority || 100}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 100 })}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe when this rule should trigger"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select
                  value={formData.channel_id || 'global'}
                  onValueChange={(v) => setFormData({ ...formData, channel_id: v === 'global' ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global (all channels)</SelectItem>
                    {channels.map(ch => (
                      <SelectItem key={ch.id} value={ch.id}>{ch.channel_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Accordion type="multiple" className="w-full">
                {/* Keyword Conditions */}
                <AccordionItem value="keywords">
                  <AccordionTrigger>🏷️ Keyword Conditions</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Required Keywords (ANY must match)</Label>
                      <Input
                        value={keywordsInput}
                        onChange={(e) => setKeywordsInput(e.target.value)}
                        placeholder="ape, moon, gem (comma-separated)"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Excluded Keywords (NONE should match)</Label>
                      <Input
                        value={excludedKeywordsInput}
                        onChange={(e) => setExcludedKeywordsInput(e.target.value)}
                        placeholder="rug, scam (comma-separated)"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Minimum Keyword Weight</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={formData.min_keyword_weight ?? ''}
                        onChange={(e) => setFormData({ ...formData, min_keyword_weight: e.target.value ? parseFloat(e.target.value) : null })}
                        placeholder="e.g., 1.5"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Price Conditions */}
                <AccordionItem value="price">
                  <AccordionTrigger>💰 Price Conditions</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Min Price (USD)</Label>
                        <Input
                          type="number"
                          step="0.00000001"
                          value={formData.min_price_usd ?? ''}
                          onChange={(e) => setFormData({ ...formData, min_price_usd: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="0.00001"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Max Price (USD)</Label>
                        <Input
                          type="number"
                          step="0.00000001"
                          value={formData.max_price_usd ?? ''}
                          onChange={(e) => setFormData({ ...formData, max_price_usd: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="0.0001"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Min Market Cap (USD)</Label>
                        <Input
                          type="number"
                          value={formData.min_market_cap_usd ?? ''}
                          onChange={(e) => setFormData({ ...formData, min_market_cap_usd: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="10000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Max Market Cap (USD)</Label>
                        <Input
                          type="number"
                          value={formData.max_market_cap_usd ?? ''}
                          onChange={(e) => setFormData({ ...formData, max_market_cap_usd: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="1000000"
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Bonding Curve */}
                <AccordionItem value="curve">
                  <AccordionTrigger>📈 Bonding Curve Conditions</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Curve Position</Label>
                      <Select
                        value={formData.bonding_curve_position || 'any'}
                        onValueChange={(v) => setFormData({ ...formData, bonding_curve_position: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BONDING_POSITIONS.map(pos => (
                            <SelectItem key={pos.value} value={pos.value}>{pos.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Min Bonding %</Label>
                        <Input
                          type="number"
                          value={formData.min_bonding_pct ?? ''}
                          onChange={(e) => setFormData({ ...formData, min_bonding_pct: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Max Bonding %</Label>
                        <Input
                          type="number"
                          value={formData.max_bonding_pct ?? ''}
                          onChange={(e) => setFormData({ ...formData, max_bonding_pct: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="25"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.require_on_curve || false}
                          onCheckedChange={(v) => setFormData({ ...formData, require_on_curve: v })}
                        />
                        <Label>Must be on curve</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.require_graduated || false}
                          onCheckedChange={(v) => setFormData({ ...formData, require_graduated: v })}
                        />
                        <Label>Must be graduated</Label>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Token Age & Platform */}
                <AccordionItem value="other">
                  <AccordionTrigger>⏱️ Age & Platform</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Min Age (minutes)</Label>
                        <Input
                          type="number"
                          value={formData.min_age_minutes ?? ''}
                          onChange={(e) => setFormData({ ...formData, min_age_minutes: e.target.value ? parseInt(e.target.value) : null })}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Max Age (minutes)</Label>
                        <Input
                          type="number"
                          value={formData.max_age_minutes ?? ''}
                          onChange={(e) => setFormData({ ...formData, max_age_minutes: e.target.value ? parseInt(e.target.value) : null })}
                          placeholder="60"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Platforms (leave empty for any)</Label>
                      <div className="flex flex-wrap gap-2">
                        {PLATFORMS.map(plat => (
                          <Badge
                            key={plat}
                            variant={platformsInput.includes(plat) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => {
                              if (platformsInput.includes(plat)) {
                                setPlatformsInput(platformsInput.filter(p => p !== plat));
                              } else {
                                setPlatformsInput([...platformsInput, plat]);
                              }
                            }}
                          >
                            {plat}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Actions */}
                <AccordionItem value="actions">
                  <AccordionTrigger>🎯 Trade Actions</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Buy Amount (USD) *</Label>
                        <Input
                          type="number"
                          value={formData.buy_amount_usd || 50}
                          onChange={(e) => setFormData({ ...formData, buy_amount_usd: parseFloat(e.target.value) || 50 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Sell Target Multiplier *</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.sell_target_multiplier || 2}
                          onChange={(e) => setFormData({ ...formData, sell_target_multiplier: parseFloat(e.target.value) || 2 })}
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.stop_loss_enabled || false}
                          onCheckedChange={(v) => setFormData({ ...formData, stop_loss_enabled: v })}
                        />
                        <Label>Enable Stop Loss</Label>
                      </div>
                      {formData.stop_loss_enabled && (
                        <div className="mt-2">
                          <Label>Stop Loss % (e.g., 50 = sell if -50%)</Label>
                          <Input
                            type="number"
                            value={formData.stop_loss_pct ?? ''}
                            onChange={(e) => setFormData({ ...formData, stop_loss_pct: e.target.value ? parseFloat(e.target.value) : null })}
                            placeholder="50"
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={formData.fallback_to_fantasy ?? true}
                        onCheckedChange={(v) => setFormData({ ...formData, fallback_to_fantasy: v })}
                      />
                      <Label>Fallback to Fantasy if no match</Label>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingRule ? 'Update Rule' : 'Create Rule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <p className="text-xs text-muted-foreground">
          Rules are evaluated in priority order. The first matching rule is applied.
        </p>
      </CardContent>
    </Card>
  );
}