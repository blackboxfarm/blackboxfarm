import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, RefreshCw, ChevronUp, ChevronDown, Layers } from 'lucide-react';

interface TradingTier {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  requires_ape_keyword: boolean;
  min_price_usd: number | null;
  max_price_usd: number | null;
  min_market_cap_usd: number | null;
  max_market_cap_usd: number | null;
  buy_amount_usd: number;
  sell_target_multiplier: number;
  stop_loss_pct: number | null;
  stop_loss_enabled: boolean;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_TIER: Partial<TradingTier> = {
  name: '',
  description: '',
  priority: 10,
  is_active: true,
  requires_ape_keyword: false,
  min_price_usd: null,
  max_price_usd: null,
  min_market_cap_usd: null,
  max_market_cap_usd: null,
  buy_amount_usd: 50,
  sell_target_multiplier: 5.0,
  stop_loss_pct: null,
  stop_loss_enabled: false,
  icon: null,
};

export function TradingTiersManager() {
  const [tiers, setTiers] = useState<TradingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<TradingTier | null>(null);
  const [formData, setFormData] = useState<Partial<TradingTier>>(DEFAULT_TIER);

  useEffect(() => {
    loadTiers();
  }, []);

  const loadTiers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('telegram_trading_tiers')
        .select('*')
        .order('priority', { ascending: true });

      if (error) throw error;
      setTiers(data || []);
    } catch (err) {
      console.error('Error loading tiers:', err);
      toast.error('Failed to load trading tiers');
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingTier(null);
    setFormData(DEFAULT_TIER);
    setIsDialogOpen(true);
  };

  const openEditDialog = (tier: TradingTier) => {
    setEditingTier(tier);
    setFormData(tier);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      toast.error('Tier name is required');
      return;
    }

    try {
      const tierData = {
        name: formData.name,
        description: formData.description || null,
        priority: formData.priority || 10,
        is_active: formData.is_active ?? true,
        requires_ape_keyword: formData.requires_ape_keyword ?? false,
        min_price_usd: formData.min_price_usd || null,
        max_price_usd: formData.max_price_usd || null,
        min_market_cap_usd: formData.min_market_cap_usd || null,
        max_market_cap_usd: formData.max_market_cap_usd || null,
        buy_amount_usd: formData.buy_amount_usd || 50,
        sell_target_multiplier: formData.sell_target_multiplier || 5.0,
        stop_loss_pct: formData.stop_loss_pct || null,
        stop_loss_enabled: formData.stop_loss_enabled ?? false,
        icon: formData.icon || null,
      };

      if (editingTier) {
        const { error } = await supabase
          .from('telegram_trading_tiers')
          .update(tierData)
          .eq('id', editingTier.id);
        if (error) throw error;
        toast.success('Tier updated');
      } else {
        const { error } = await supabase.from('telegram_trading_tiers').insert(tierData);
        if (error) throw error;
        toast.success('Tier created');
      }

      setIsDialogOpen(false);
      loadTiers();
    } catch (err) {
      console.error('Error saving tier:', err);
      toast.error('Failed to save tier');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tier?')) return;

    try {
      const { error } = await supabase.from('telegram_trading_tiers').delete().eq('id', id);
      if (error) throw error;
      toast.success('Tier deleted');
      loadTiers();
    } catch (err) {
      console.error('Error deleting tier:', err);
      toast.error('Failed to delete tier');
    }
  };

  const handleToggleActive = async (tier: TradingTier) => {
    try {
      const { error } = await supabase
        .from('telegram_trading_tiers')
        .update({ is_active: !tier.is_active })
        .eq('id', tier.id);
      if (error) throw error;
      setTiers(prev => prev.map(t => t.id === tier.id ? { ...t, is_active: !t.is_active } : t));
    } catch (err) {
      console.error('Error toggling tier:', err);
      toast.error('Failed to update tier');
    }
  };

  const movePriority = async (tier: TradingTier, direction: 'up' | 'down') => {
    const currentIndex = tiers.findIndex(t => t.id === tier.id);
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (swapIndex < 0 || swapIndex >= tiers.length) return;

    const swapTier = tiers[swapIndex];
    
    try {
      await Promise.all([
        supabase.from('telegram_trading_tiers').update({ priority: swapTier.priority }).eq('id', tier.id),
        supabase.from('telegram_trading_tiers').update({ priority: tier.priority }).eq('id', swapTier.id)
      ]);
      loadTiers();
    } catch (err) {
      console.error('Error moving priority:', err);
      toast.error('Failed to update priority');
    }
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return '∞';
    if (price < 0.0001) return `$${price.toFixed(8)}`;
    if (price < 1) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(2)}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Trading Tiers (Simple Mode)
            </CardTitle>
            <CardDescription>
              Configure buy amount and sell targets based on price and keyword conditions
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadTiers} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Add Tier
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tiers List */}
        <div className="space-y-3">
          {tiers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {loading ? 'Loading...' : 'No trading tiers configured. Add your first tier to get started.'}
            </div>
          ) : (
            tiers.map((tier, index) => (
              <Card key={tier.id} className={`${!tier.is_active ? 'opacity-50' : ''} border-l-4 ${tier.requires_ape_keyword ? 'border-l-yellow-500' : 'border-l-blue-500'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex flex-col items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => movePriority(tier, 'up')}
                          disabled={index === 0}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground font-mono">#{tier.priority}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => movePriority(tier, 'down')}
                          disabled={index === tiers.length - 1}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xl">{tier.icon || '📊'}</span>
                          <h4 className="font-medium">{tier.name}</h4>
                          {tier.requires_ape_keyword && (
                            <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-400">
                              🦍 APE Required
                            </Badge>
                          )}
                        </div>
                        
                        {tier.description && (
                          <p className="text-sm text-muted-foreground mb-2">{tier.description}</p>
                        )}
                        
                        <div className="flex flex-wrap gap-2 mb-3">
                          {(tier.min_price_usd !== null || tier.max_price_usd !== null) && (
                            <Badge variant="outline" className="text-xs">
                              💰 Price: {formatPrice(tier.min_price_usd)} - {formatPrice(tier.max_price_usd)}
                            </Badge>
                          )}
                          {(tier.min_market_cap_usd !== null || tier.max_market_cap_usd !== null) && (
                            <Badge variant="outline" className="text-xs">
                              📈 MC: ${tier.min_market_cap_usd?.toLocaleString() || '0'} - ${tier.max_market_cap_usd?.toLocaleString() || '∞'}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-6 text-sm">
                          <div>
                            <span className="text-muted-foreground">Buy Amount</span>
                            <p className="text-green-500 font-bold text-lg">${tier.buy_amount_usd}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Sell Target</span>
                            <p className="text-blue-500 font-bold text-lg">{tier.sell_target_multiplier}x</p>
                          </div>
                          {tier.stop_loss_enabled && tier.stop_loss_pct && (
                            <div>
                              <span className="text-muted-foreground">Stop Loss</span>
                              <p className="text-red-500 font-bold text-lg">-{tier.stop_loss_pct}%</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={tier.is_active}
                        onCheckedChange={() => handleToggleActive(tier)}
                      />
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(tier)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(tier.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Tier Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTier ? 'Edit Tier' : 'Create Tier'}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tier Name *</Label>
                  <Input
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Large Buy Tier"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority (lower = checked first)</Label>
                  <Input
                    type="number"
                    value={formData.priority || 10}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 10 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Icon (emoji)</Label>
                  <Input
                    value={formData.icon || ''}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    placeholder="🦍"
                  />
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <Switch
                    id="requires-ape"
                    checked={formData.requires_ape_keyword ?? false}
                    onCheckedChange={(checked) => setFormData({ ...formData, requires_ape_keyword: checked })}
                  />
                  <Label htmlFor="requires-ape">Requires "APE" keyword</Label>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe when this tier triggers"
                  rows={2}
                />
              </div>

              {/* Price Conditions */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Price Conditions (USD)</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Min Price</Label>
                    <Input
                      type="number"
                      step="0.00000001"
                      value={formData.min_price_usd || ''}
                      onChange={(e) => setFormData({ ...formData, min_price_usd: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="e.g., 0.00002"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Max Price</Label>
                    <Input
                      type="number"
                      step="0.00000001"
                      value={formData.max_price_usd || ''}
                      onChange={(e) => setFormData({ ...formData, max_price_usd: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="e.g., 0.00004"
                    />
                  </div>
                </div>
              </div>

              {/* Market Cap Conditions */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Market Cap Conditions (USD)</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Min MC</Label>
                    <Input
                      type="number"
                      value={formData.min_market_cap_usd || ''}
                      onChange={(e) => setFormData({ ...formData, min_market_cap_usd: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="e.g., 10000"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Max MC</Label>
                    <Input
                      type="number"
                      value={formData.max_market_cap_usd || ''}
                      onChange={(e) => setFormData({ ...formData, max_market_cap_usd: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="e.g., 100000"
                    />
                  </div>
                </div>
              </div>

              {/* Trade Parameters */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Trade Parameters</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Buy Amount (USD)</Label>
                    <Input
                      type="number"
                      value={formData.buy_amount_usd || 50}
                      onChange={(e) => setFormData({ ...formData, buy_amount_usd: parseFloat(e.target.value) || 50 })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Sell Target (x)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={formData.sell_target_multiplier || 5}
                      onChange={(e) => setFormData({ ...formData, sell_target_multiplier: parseFloat(e.target.value) || 5 })}
                    />
                  </div>
                </div>
              </div>

              {/* Stop Loss */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="stop-loss"
                    checked={formData.stop_loss_enabled ?? false}
                    onCheckedChange={(checked) => setFormData({ ...formData, stop_loss_enabled: checked })}
                  />
                  <Label htmlFor="stop-loss">Enable Stop Loss</Label>
                </div>
                {formData.stop_loss_enabled && (
                  <Input
                    type="number"
                    value={formData.stop_loss_pct || ''}
                    onChange={(e) => setFormData({ ...formData, stop_loss_pct: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="Stop loss percentage (e.g., 50)"
                  />
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingTier ? 'Update Tier' : 'Create Tier'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
