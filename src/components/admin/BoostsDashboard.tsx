import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Trash2, ArrowUpDown, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const PLATFORMS = ['Telegram', 'Instagram', 'Twitter/X', 'Facebook', 'TikTok', 'YouTube', 'Discord', 'Reddit', 'Threads', 'Other'];
const BOOST_TYPES = ['followers', 'likes', 'comments', 'emoticons', 'views', 'shares', 'subscribers', 'members', 'reactions', 'reposts'];

type SortField = 'boost_date' | 'platform' | 'boost_type' | 'amount';
type SortDir = 'asc' | 'desc';

export function BoostsDashboard() {
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState('');
  const [boostDate, setBoostDate] = useState<Date>(new Date());
  const [amount, setAmount] = useState('');
  const [boostType, setBoostType] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [sortField, setSortField] = useState<SortField>('boost_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data: boosts = [], isLoading } = useQuery({
    queryKey: ['boost-entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('boost_entries')
        .select('*')
        .order('boost_date', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('boost_entries').insert({
        platform,
        boost_date: format(boostDate, 'yyyy-MM-dd'),
        amount: parseInt(amount),
        boost_type: boostType,
        link_url: linkUrl || null,
        link_label: linkLabel || null,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boost-entries'] });
      toast.success('Boost entry added');
      setPlatform(''); setAmount(''); setBoostType(''); setLinkUrl(''); setLinkLabel(''); setNotes('');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('boost_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boost-entries'] });
      toast.success('Entry deleted');
    },
  });

  const sorted = [...boosts].sort((a, b) => {
    const av = a[sortField], bv = b[sortField];
    if (sortField === 'amount') return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const canSubmit = platform && amount && parseInt(amount) > 0 && boostType;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Add Boost Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !boostDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {boostDate ? format(boostDate, 'PPP') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={boostDate} onSelect={(d) => d && setBoostDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input type="number" placeholder="e.g. 300" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={boostType} onValueChange={setBoostType}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {BOOST_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link URL</Label>
              <Input placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link Label</Label>
              <Input placeholder="e.g. Post, Handle, Story" value={linkLabel} onChange={e => setLinkLabel(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input placeholder="Optional notes" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => addMutation.mutate()} disabled={!canSubmit || addMutation.isPending} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Boost History ({sorted.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {([['boost_date', 'Date'], ['platform', 'Platform'], ['boost_type', 'Type'], ['amount', 'Amount']] as [SortField, string][]).map(([f, label]) => (
                  <TableHead key={f} compact className="cursor-pointer select-none" onClick={() => toggleSort(f)}>
                    <span className="flex items-center gap-1">{label} <ArrowUpDown className="h-3 w-3 opacity-50" /></span>
                  </TableHead>
                ))}
                <TableHead compact>Link</TableHead>
                <TableHead compact>Notes</TableHead>
                <TableHead compact></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell compact colSpan={7} className="text-center py-4 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : sorted.length === 0 ? (
                <TableRow><TableCell compact colSpan={7} className="text-center py-4 text-muted-foreground">No boost entries yet</TableCell></TableRow>
              ) : sorted.map(b => (
                <TableRow key={b.id}>
                  <TableCell compact>{format(new Date(b.boost_date), 'MMM dd, yyyy')}</TableCell>
                  <TableCell compact>{b.platform}</TableCell>
                  <TableCell compact className="capitalize">{b.boost_type}</TableCell>
                  <TableCell compact className="font-mono">{b.amount.toLocaleString()}</TableCell>
                  <TableCell compact>
                    {b.link_url ? (
                      <a href={b.link_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-xs">
                        {b.link_label || 'Link'} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell compact className="max-w-[150px] truncate text-muted-foreground">{b.notes || '—'}</TableCell>
                  <TableCell compact>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteMutation.mutate(b.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
