import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Filter, RefreshCw } from 'lucide-react';

interface TradingKeyword {
  id: string;
  keyword: string;
  category: string;
  weight: number;
  is_active: boolean;
  created_at: string;
}

const CATEGORIES = [
  { value: 'high_conviction', label: 'High Conviction', color: 'bg-green-500' },
  { value: 'bullish', label: 'Bullish', color: 'bg-emerald-500' },
  { value: 'fomo', label: 'FOMO', color: 'bg-yellow-500' },
  { value: 'caution', label: 'Caution', color: 'bg-orange-500' },
  { value: 'bearish', label: 'Bearish', color: 'bg-red-500' },
  { value: 'general', label: 'General', color: 'bg-gray-500' },
];

export function TradingKeywordsManager() {
  const [keywords, setKeywords] = useState<TradingKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [editingKeyword, setEditingKeyword] = useState<TradingKeyword | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Form state
  const [formKeyword, setFormKeyword] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formWeight, setFormWeight] = useState('1.0');

  useEffect(() => {
    loadKeywords();
  }, []);

  const loadKeywords = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trading_keywords')
        .select('*')
        .order('category', { ascending: true })
        .order('weight', { ascending: false });

      if (error) throw error;
      setKeywords(data || []);
    } catch (err) {
      console.error('Error loading keywords:', err);
      toast.error('Failed to load keywords');
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingKeyword(null);
    setFormKeyword('');
    setFormCategory('general');
    setFormWeight('1.0');
    setIsDialogOpen(true);
  };

  const openEditDialog = (kw: TradingKeyword) => {
    setEditingKeyword(kw);
    setFormKeyword(kw.keyword);
    setFormCategory(kw.category);
    setFormWeight(kw.weight.toString());
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formKeyword.trim()) {
      toast.error('Keyword is required');
      return;
    }

    try {
      const weight = parseFloat(formWeight) || 1.0;

      if (editingKeyword) {
        // Update
        const { error } = await supabase
          .from('trading_keywords')
          .update({
            keyword: formKeyword.toLowerCase().trim(),
            category: formCategory,
            weight
          })
          .eq('id', editingKeyword.id);

        if (error) throw error;
        toast.success('Keyword updated');
      } else {
        // Insert
        const { error } = await supabase
          .from('trading_keywords')
          .insert({
            keyword: formKeyword.toLowerCase().trim(),
            category: formCategory,
            weight
          });

        if (error) throw error;
        toast.success('Keyword added');
      }

      setIsDialogOpen(false);
      loadKeywords();
    } catch (err: any) {
      console.error('Error saving keyword:', err);
      if (err.code === '23505') {
        toast.error('Keyword already exists');
      } else {
        toast.error('Failed to save keyword');
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this keyword?')) return;

    try {
      const { error } = await supabase
        .from('trading_keywords')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Keyword deleted');
      loadKeywords();
    } catch (err) {
      console.error('Error deleting keyword:', err);
      toast.error('Failed to delete keyword');
    }
  };

  const handleToggleActive = async (kw: TradingKeyword) => {
    try {
      const { error } = await supabase
        .from('trading_keywords')
        .update({ is_active: !kw.is_active })
        .eq('id', kw.id);

      if (error) throw error;
      setKeywords(prev => prev.map(k => 
        k.id === kw.id ? { ...k, is_active: !k.is_active } : k
      ));
    } catch (err) {
      console.error('Error toggling keyword:', err);
      toast.error('Failed to update keyword');
    }
  };

  const getCategoryBadge = (category: string) => {
    const cat = CATEGORIES.find(c => c.value === category);
    return (
      <Badge variant="outline" className={`${cat?.color || 'bg-gray-500'} text-white border-0`}>
        {cat?.label || category}
      </Badge>
    );
  };

  const getWeightColor = (weight: number) => {
    if (weight >= 1.5) return 'text-green-500 font-bold';
    if (weight >= 1.0) return 'text-foreground';
    if (weight > 0) return 'text-muted-foreground';
    return 'text-red-500 font-bold';
  };

  const filteredKeywords = keywords.filter(kw => {
    const matchesSearch = kw.keyword.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || kw.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categoryStats = CATEGORIES.map(cat => ({
    ...cat,
    count: keywords.filter(k => k.category === cat.value).length
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              🏷️ Trading Keywords
            </CardTitle>
            <CardDescription>
              Manage keywords that trigger trading decisions in Advanced Mode
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadKeywords} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openAddDialog}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Keyword
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingKeyword ? 'Edit Keyword' : 'Add Keyword'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Keyword</Label>
                    <Input
                      value={formKeyword}
                      onChange={(e) => setFormKeyword(e.target.value)}
                      placeholder="e.g., ape, moon, gem"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={formCategory} onValueChange={setFormCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Weight</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formWeight}
                      onChange={(e) => setFormWeight(e.target.value)}
                      placeholder="1.0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher = more important. Negative = bearish signal.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave}>
                    {editingKeyword ? 'Update' : 'Add'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Category Stats */}
        <div className="flex flex-wrap gap-2">
          {categoryStats.map(cat => (
            <Badge 
              key={cat.value} 
              variant="outline" 
              className={`${cat.color} text-white border-0 cursor-pointer hover:opacity-80`}
              onClick={() => setCategoryFilter(categoryFilter === cat.value ? 'all' : cat.value)}
            >
              {cat.label}: {cat.count}
            </Badge>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search keywords..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Weight</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKeywords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {loading ? 'Loading...' : 'No keywords found'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredKeywords.map(kw => (
                  <TableRow key={kw.id} className={!kw.is_active ? 'opacity-50' : ''}>
                    <TableCell className="font-mono font-medium">{kw.keyword}</TableCell>
                    <TableCell>{getCategoryBadge(kw.category)}</TableCell>
                    <TableCell className={`text-center ${getWeightColor(kw.weight)}`}>
                      {kw.weight > 0 ? '+' : ''}{kw.weight.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={kw.is_active}
                        onCheckedChange={() => handleToggleActive(kw)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(kw)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(kw.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Total: {keywords.length} keywords • Active: {keywords.filter(k => k.is_active).length}
        </p>
      </CardContent>
    </Card>
  );
}