import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Star, ExternalLink, RefreshCw, Search, Copy, Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// Higher tier number = better developer (matches proven_dev_tokens scale)
const TIER_LABELS: Record<number, { label: string; color: string }> = {
  8: { label: '🥇 T8 Legend', color: 'text-yellow-400' },
  7: { label: '🥇 T7 Elite', color: 'text-yellow-400' },
  6: { label: '🥈 T6 $1M+', color: 'text-gray-300' },
  5: { label: '🥈 T5 $500K+', color: 'text-gray-300' },
  4: { label: '🥉 T4 $300K+', color: 'text-amber-600' },
  3: { label: 'T3 $100K+', color: 'text-muted-foreground' },
  2: { label: 'T2 Promising', color: 'text-muted-foreground' },
  1: { label: 'T1 Watch', color: 'text-muted-foreground' },
};

export function AllstarRegistry() {
  const [search, setSearch] = useState('');
  const [backfilling, setBackfilling] = useState(false);

  const backfillFromTop200 = async () => {
    setBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-allstars', {
        body: { max_resolve: 30 },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(
          `Backfill complete: ${data.creators_resolved} creators resolved, ${data.newly_promoted} promoted, ${data.upgraded} upgraded`,
          { duration: 8000 }
        );
        refetch();
      } else {
        toast.error(data?.error || 'Backfill failed');
      }
    } catch (err: any) {
      toast.error(`Backfill error: ${err.message}`);
    } finally {
      setBackfilling(false);
    }
  };

  const { data: devs, isLoading, refetch } = useQuery({
    queryKey: ['allstar-registry'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allstar_dev_registry')
        .select('*')
        .order('best_tier', { ascending: false })
        .order('best_mcap_achieved', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = (devs || []).filter(d => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      d.master_wallet?.toLowerCase().includes(s) ||
      d.twitter_handle?.toLowerCase().includes(s) ||
      d.best_token_symbol?.toLowerCase().includes(s) ||
      d.status?.toLowerCase().includes(s)
    );
  });

  const copyWallet = (wallet: string) => {
    navigator.clipboard.writeText(wallet);
    toast.success('Wallet copied');
  };

  const formatMcap = (mcap: number | null) => {
    if (!mcap) return '-';
    if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(1)}M`;
    if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(0)}K`;
    return `$${mcap.toFixed(0)}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-400" />
            Tracked Developers ({filtered.length})
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search wallet, twitter, symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Tier</TableHead>
                <TableHead>Master Wallet</TableHead>
                <TableHead>Twitter</TableHead>
                <TableHead>Best Token</TableHead>
                <TableHead className="text-right">Best MCap</TableHead>
                <TableHead className="text-right">Family Size</TableHead>
                <TableHead className="text-right">New Mints</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Audit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No allstar developers found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((dev) => {
                  const tier = TIER_LABELS[dev.best_tier] || { label: `T${dev.best_tier}`, color: 'text-muted-foreground' };
                  return (
                    <TableRow key={dev.id} className="text-xs">
                      <TableCell>
                        <span className={`font-bold ${tier.color}`}>{tier.label}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="text-[10px] font-mono">
                            {dev.master_wallet.slice(0, 6)}...{dev.master_wallet.slice(-4)}
                          </code>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyWallet(dev.master_wallet)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                          <a
                            href={`https://solscan.io/account/${dev.master_wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        {dev.twitter_handle ? (
                          <a
                            href={`https://x.com/${dev.twitter_handle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-400 hover:underline"
                          >
                            @{dev.twitter_handle}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {dev.best_token_symbol ? (
                          <Badge variant="secondary" className="text-[10px]">
                            ${dev.best_token_symbol}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMcap(dev.best_mcap_achieved)}
                      </TableCell>
                      <TableCell className="text-right">
                        {dev.total_wallet_family_size || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {dev.new_mints_found ? (
                          <Badge variant="destructive" className="text-[10px]">
                            {dev.new_mints_found}
                          </Badge>
                        ) : '0'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={dev.status === 'active' ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
                          {dev.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[10px]">
                        {dev.last_audit_at
                          ? format(new Date(dev.last_audit_at), 'MMM d HH:mm')
                          : 'Never'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
