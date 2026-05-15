import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, AlertTriangle, Activity, RefreshCw, ExternalLink, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface WalletFamily {
  id: string;
  seed_wallet: string;
  family_name: string | null;
  total_wallets: number;
  risk_score: number;
  total_mints_detected: number;
  last_rescored_at: string | null;
  created_at: string;
  tier_counts?: { A: number; B: number; C: number };
  active_members?: number;
  mint_count?: number;
  unread_mint_count?: number;
  allstar_tier?: string | null;
  allstar_handle?: string | null;
  allstar_status?: string | null;
  allstar_best_mcap?: number | null;
  allstar_best_symbol?: string | null;
}

interface KPIs {
  active_devs: number;
  discovered_families: number;
  coverage_pct: number;
  unread_mints: number;
}

interface FamilyDashboardProps {
  onSelectFamily: (familyId: string) => void;
}

export function FamilyDashboard({ onSelectFamily }: FamilyDashboardProps) {
  const [families, setFamilies] = useState<WalletFamily[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState<string>('ALL');
  const [hasMintsOnly, setHasMintsOnly] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    loadFamilies();
  }, [tierFilter, hasMintsOnly]);

  // Realtime: refetch on registry / family / member changes (debounced)
  useEffect(() => {
    const refetchDebounced = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => loadFamilies(), 800);
    };
    const channel = supabase
      .channel('family-intel-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_families' }, refetchDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_family_members' }, refetchDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'allstar_dev_registry' }, refetchDebounced)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadFamilies() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('family-graph-api', {
        body: { action: 'list', tier: tierFilter, has_mints: hasMintsOnly },
      });
      if (error) throw error;
      setFamilies(data?.families || []);
      setKpis(data?.kpis || null);
    } catch (err) {
      console.error('Failed to load families:', err);
    } finally {
      setLoading(false);
    }
  }

  async function runDiscovery() {
    setDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke('family-discovery-engine', {
        body: { maxSeeds: 10 },
      });
      if (error) throw error;
      toast.success(`Discovery: ${data?.familiesProcessed || 0} families · +${data?.walletsDiscovered || 0} wallets`);
      loadFamilies();
    } catch (err: any) {
      toast.error(`Discovery failed: ${err.message || err}`);
    } finally {
      setDiscovering(false);
    }
  }

  function shortWallet(w: string) {
    return w ? `${w.slice(0, 4)}...${w.slice(-4)}` : '—';
  }

  function formatMcap(m: number | null | undefined) {
    if (!m) return '—';
    if (m >= 1_000_000) return `$${(m / 1_000_000).toFixed(1)}M`;
    if (m >= 1_000) return `$${(m / 1_000).toFixed(0)}K`;
    return `$${m.toFixed(0)}`;
  }

  const tierOptions = useMemo(
    () => ['ALL', 'T9', 'T8', 'T7', 'T6', 'T5', 'T4', 'T3', 'T2', 'T1'],
    [],
  );

  const KpiBar = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <div className="rounded-md border border-border/60 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Active Devs</div>
        <div className="text-lg font-semibold">{kpis?.active_devs ?? '—'}</div>
      </div>
      <div className="rounded-md border border-border/60 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Families</div>
        <div className="text-lg font-semibold">{kpis?.discovered_families ?? '—'}</div>
      </div>
      <div className="rounded-md border border-border/60 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Coverage</div>
        <div className="text-lg font-semibold">{kpis?.coverage_pct ?? 0}%</div>
      </div>
      <div className="rounded-md border border-border/60 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Unread Mints</div>
        <div className={`text-lg font-semibold ${(kpis?.unread_mints || 0) > 0 ? 'text-red-400' : ''}`}>
          {kpis?.unread_mints ?? 0}
        </div>
      </div>
    </div>
  );

  if (loading && !families.length) {
    return (
      <div className="space-y-4">
        {KpiBar}
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading families...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {KpiBar}

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Wallet Families ({families.length})</h3>
          <select
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
            className="bg-background border border-border rounded px-2 py-1 text-xs"
          >
            {tierOptions.map(t => (
              <option key={t} value={t}>{t === 'ALL' ? 'All Tiers' : t}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={hasMintsOnly} onChange={e => setHasMintsOnly(e.target.checked)} className="rounded" />
            Has mints
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runDiscovery}
            disabled={discovering}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {discovering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Discover now
          </button>
          <button onClick={loadFamilies} className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-accent">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      {!families.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No families match this filter</p>
          <p className="text-sm mt-1">Adjust the tier filter or click "Discover now" to seed from the Allstar Registry</p>
        </div>
      ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead compact>Family</TableHead>
            <TableHead compact>Tier</TableHead>
            <TableHead compact>X Handle</TableHead>
            <TableHead compact>Seed Wallet</TableHead>
            <TableHead compact>Wallets</TableHead>
            <TableHead compact>Tiers (A/B/C)</TableHead>
            <TableHead compact>Mints</TableHead>
            <TableHead compact>Best $MC</TableHead>
            <TableHead compact>Risk</TableHead>
            <TableHead compact>Last Scored</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {families.map(f => (
            <TableRow
              key={f.id}
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => onSelectFamily(f.id)}
            >
              <TableCell compact className="font-medium">
                {f.family_name || (f.allstar_handle ? `@${f.allstar_handle}` : 'Unnamed')}
              </TableCell>
              <TableCell compact>
                {f.allstar_tier ? (
                  <Badge className="bg-primary/15 text-primary border-primary/30">{f.allstar_tier}</Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
              <TableCell compact>
                {f.allstar_handle ? (
                  <a
                    href={`https://x.com/${f.allstar_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-primary hover:underline text-xs flex items-center gap-1"
                  >
                    @{f.allstar_handle}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
              <TableCell compact className="font-mono text-xs">
                {shortWallet(f.seed_wallet)}
              </TableCell>
              <TableCell compact>
                <Badge variant="secondary">{f.total_wallets || f.active_members || 0}</Badge>
              </TableCell>
              <TableCell compact>
                <div className="flex gap-1">
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{f.tier_counts?.A || 0}</Badge>
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{f.tier_counts?.B || 0}</Badge>
                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">{f.tier_counts?.C || 0}</Badge>
                </div>
              </TableCell>
              <TableCell compact>
                {(f.total_mints_detected || f.mint_count || 0) > 0 ? (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {f.total_mints_detected || f.mint_count}
                    {(f.unread_mint_count || 0) > 0 ? ` (${f.unread_mint_count} new)` : ''}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell compact className="text-xs">
                {formatMcap(f.allstar_best_mcap)}
                {f.allstar_best_symbol ? <span className="text-muted-foreground"> · {f.allstar_best_symbol}</span> : null}
              </TableCell>
              <TableCell compact>
                <span className={Number(f.risk_score) > 50 ? 'text-red-400' : 'text-muted-foreground'}>
                  {Number(f.risk_score).toFixed(0)}
                </span>
              </TableCell>
              <TableCell compact className="text-muted-foreground text-xs">
                {f.last_rescored_at ? new Date(f.last_rescored_at).toLocaleDateString() : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      )}
    </div>
  );
}
