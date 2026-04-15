import React, { useState, useEffect, useMemo } from 'react';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from '@/components/ui/pagination';
import { Search, LayoutList, LayoutGrid, MessageCircle, ExternalLink, ChevronDown, ChevronUp, ArrowUpDown, Users, Compass, Star } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LitmusStrip } from '@/components/feed/LitmusStrip';
import { useAuth } from '@/hooks/useAuth';

const PAGE_SIZE = 100;

type FeedItem = {
  token_mint: string;
  symbol: string | null;
  name: string | null;
  posted_at: string | null;
  tweet_id: string | null;
  trigger_source: string | null;
  last_top_200_rank: number | null;
  freshness_tier: number;
  last_activity: string | null;
  health_grade: string | null;
  image_uri: string | null;
  banner_url: string | null;
  // enriched client-side
  total_holders: number | null;
  dust_pct: number | null;
  creator_wallet: string | null;
  x_community_url: string | null;
  x_community_name: string | null;
};

type SortField = 'last_activity' | 'symbol' | 'health_grade' | 'freshness_tier' | 'last_top_200_rank';
type SortDir = 'asc' | 'desc';

const HEALTH_COLORS: Record<string, string> = {
  'A++': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'A+': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'A': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  'A-': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'B+': 'bg-green-500/15 text-green-400 border-green-500/25',
  'B': 'bg-lime-500/15 text-lime-400 border-lime-500/25',
  'B-': 'bg-lime-500/10 text-lime-400 border-lime-500/20',
  'C+': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  'C': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'C-': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'D+': 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  'D': 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  'F': 'bg-red-500/15 text-red-400 border-red-500/25',
};

const HEALTH_DESCRIPTIONS: Record<string, string> = {
  'A++': 'Exceptional Network',
  'A+': 'Strong Network',
  'A': 'Healthy Distribution',
  'A-': 'Good Health',
  'B+': 'Above Average',
  'B': 'Moderate Strength',
  'B-': 'Fair Health',
  'C+': 'Mixed Signals',
  'C': 'Speculative',
  'C-': 'Weak Signals',
  'D+': 'Fragile',
  'D': 'Weak Structure',
  'F': 'High Risk',
};

function getRiskSignal(grade: string | null): { emoji: string; label: string; color: string } {
  if (!grade) return { emoji: '⚪', label: 'Unknown', color: 'text-muted-foreground' };
  if (['A++', 'A+', 'A', 'A-'].includes(grade)) return { emoji: '🟢', label: 'Strong', color: 'text-emerald-400' };
  if (['B+', 'B', 'B-'].includes(grade)) return { emoji: '🟢', label: 'Moderate', color: 'text-green-400' };
  if (['C+', 'C', 'C-'].includes(grade)) return { emoji: '🟡', label: 'Speculative', color: 'text-yellow-400' };
  return { emoji: '🔴', label: 'High Risk', color: 'text-red-400' };
}

function HealthBadge({ grade, showDescription }: { grade: string | null; showDescription?: boolean }) {
  if (!grade) return <span className="text-muted-foreground text-xs">—</span>;
  const cls = HEALTH_COLORS[grade] || 'bg-muted text-muted-foreground';
  const desc = HEALTH_DESCRIPTIONS[grade] || '';
  return (
    <span className="flex items-center gap-1.5">
      <Badge variant="outline" className={cn('text-xs font-bold', cls)}>{grade}</Badge>
      {showDescription && desc && <span className="text-xs text-muted-foreground">{desc}</span>}
    </span>
  );
}

function RiskSignalBadge({ grade }: { grade: string | null }) {
  const risk = getRiskSignal(grade);
  return (
    <span className={cn('text-xs font-medium', risk.color)}>
      {risk.emoji} {risk.label}
    </span>
  );
}

function WalletInfo({ holders, dustPct }: { holders: number | null; dustPct: number | null }) {
  if (!holders) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="text-xs text-muted-foreground flex items-center gap-1">
      <Users className="h-3 w-3" />
      {holders.toLocaleString()} wallets
      {dustPct != null && <span className="text-muted-foreground/70">• {dustPct.toFixed(0)}% Dust</span>}
    </span>
  );
}

function FreshnessBadge({ tier, rank }: { tier: number; rank: number | null }) {
  if (tier === 1 && rank) {
    return (
      <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
        <Star className="h-2.5 w-2.5 fill-amber-400" /> #{rank}
      </Badge>
    );
  }
  return null;
}

const PLACEHOLDER_SYMBOLS = new Set(['', '-', '???', 'UNKNOWN', 'UNK', 'NO SYMBOL']);
const PLACEHOLDER_NAMES = new Set(['', '-', 'UNKNOWN', 'UNKNOWN TOKEN']);

function getCleanSymbol(symbol: string | null) {
  const raw = symbol?.trim() || '';
  const normalized = raw.startsWith('$') ? raw.slice(1) : raw;
  return PLACEHOLDER_SYMBOLS.has(normalized.toUpperCase()) ? null : normalized;
}

function getCleanName(name: string | null) {
  const raw = name?.trim() || '';
  return PLACEHOLDER_NAMES.has(raw.toUpperCase()) ? null : raw;
}

function getDisplayTicker(item: FeedItem) {
  const cleanSymbol = getCleanSymbol(item.symbol);
  if (cleanSymbol) return cleanSymbol;

  const nameGuess = getCleanName(item.name)?.split(/\s|-/)[0]?.replace(/[^A-Za-z0-9]/g, '');
  if (nameGuess) return nameGuess;

  return item.token_mint.slice(0, 6);
}

function getDisplayName(item: FeedItem) {
  return getCleanName(item.name) || 'Metadata pending';
}

export default function Feed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [view, setView] = useState<'summary' | 'grid'>('summary');
  const [expandedMint, setExpandedMint] = useState<string | null>(null);
  const [modalItem, setModalItem] = useState<FeedItem | null>(null);
  const [sortField, setSortField] = useState<SortField>('last_top_200_rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [redirectModal, setRedirectModal] = useState<{ type: 'wallet' | 'handle'; value: string } | null>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const v = debouncedSearch.trim();
    if (!v) { setRedirectModal(null); return; }
    if (v.startsWith('@')) {
      setRedirectModal({ type: 'handle', value: v });
    } else {
      setRedirectModal(null);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [page, debouncedSearch, sortField, sortDir]);

  async function fetchData() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // When searching, query the view with filters; otherwise paginate
    let query = supabase
      .from('live_feed_curated' as any)
      .select('token_mint, symbol, name, posted_at, tweet_id, trigger_source, last_top_200_rank, freshness_tier, last_activity, health_grade, image_uri, banner_url', { count: 'exact' });

    if (debouncedSearch.trim()) {
      const s = debouncedSearch.trim().replace(/^\$/, '');
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) {
        query = query.eq('token_mint', s);
      } else {
        query = query.ilike('symbol', `%${s}%`);
      }
    }

    // Sort
    if (sortField === 'last_top_200_rank') {
      query = query.order('last_top_200_rank', { ascending: sortDir === 'asc', nullsFirst: false }).order('last_activity', { ascending: false });
    } else if (sortField === 'freshness_tier') {
      query = query.order('freshness_tier', { ascending: true }).order('last_activity', { ascending: false });
    } else if (sortField === 'last_activity') {
      query = query.order('last_activity', { ascending: sortDir === 'asc' });
    } else {
      query = query.order(sortField, { ascending: sortDir === 'asc' });
    }

    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) { console.error('Feed query error:', error); setLoading(false); return; }

    const rawItems = (data || []) as any[];
    const mints = rawItems.map((d: any) => d.token_mint);

    // Enrich with holder data + master token directory (creator wallet, X community)
    let holderMap: Record<string, { total_holders: number; dust_pct: number }> = {};
    let tokenDirMap: Record<string, { creator_wallet: string | null; x_community_url: string | null; x_community_name: string | null }> = {};
    if (mints.length > 0) {
      const [holderRes, dirRes] = await Promise.all([
        supabase
          .from('holder_daily_summary')
          .select('token_mint, total_holders, shrimp_count')
          .in('token_mint', mints)
          .order('summary_date', { ascending: false }),
        supabase
          .from('master_token_directory' as any)
          .select('token_mint, creator_wallet, x_community_urls, x_community_names')
          .in('token_mint', mints),
      ]);
      if (holderRes.data) {
        holderRes.data.forEach((h: any) => {
          if (!holderMap[h.token_mint]) {
            const dustPct = h.total_holders > 0 ? ((h.shrimp_count || 0) / h.total_holders) * 100 : 0;
            holderMap[h.token_mint] = { total_holders: h.total_holders, dust_pct: dustPct };
          }
        });
      }
      if (dirRes.data) {
        dirRes.data.forEach((d: any) => {
          if (!tokenDirMap[d.token_mint]) {
            tokenDirMap[d.token_mint] = {
              creator_wallet: d.creator_wallet || null,
              x_community_url: d.x_community_urls?.[0] || null,
              x_community_name: d.x_community_names?.[0] || null,
            };
          }
        });
      }
    }

    const merged: FeedItem[] = rawItems.map((d: any) => ({
      token_mint: d.token_mint,
      symbol: d.symbol,
      name: d.name,
      posted_at: d.posted_at,
      tweet_id: d.tweet_id,
      trigger_source: d.trigger_source,
      last_top_200_rank: d.last_top_200_rank,
      freshness_tier: d.freshness_tier,
      last_activity: d.last_activity,
      health_grade: d.health_grade,
      image_uri: d.image_uri,
      banner_url: d.banner_url,
      total_holders: holderMap[d.token_mint]?.total_holders || null,
      dust_pct: holderMap[d.token_mint]?.dust_pct ?? null,
      creator_wallet: tokenDirMap[d.token_mint]?.creator_wallet || null,
      x_community_url: tokenDirMap[d.token_mint]?.x_community_url || null,
      x_community_name: tokenDirMap[d.token_mint]?.x_community_name || null,
    }));

    setItems(merged);
    setTotalCount(count || 0);
    setLoading(false);

    if (debouncedSearch.trim() && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(debouncedSearch.trim()) && merged.length === 0) {
      setRedirectModal({ type: 'wallet', value: debouncedSearch.trim() });
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'freshness_tier' ? 'asc' : 'desc');
    }
  }

  function handleItemClick(item: FeedItem) {
    if (isMobile) {
      setModalItem(item);
    } else {
      setExpandedMint(prev => prev === item.token_mint ? null : item.token_mint);
    }
  }

  const paginationPages = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('ellipsis');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  }, [page, totalPages]);

  function ItemActions({ item, onClose }: { item: FeedItem; onClose?: () => void }) {
    const bubblePath = user ? `/bubblemap?token=${item.token_mint}` : `/bubblepromo?token=${item.token_mint}`;
    return (
      <div className="flex gap-2 flex-wrap">
        <a href={`https://solscan.io/token/${item.token_mint}`} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline" className="gap-2"><ExternalLink className="h-3 w-3" /> SolScan</Button>
        </a>
        {item.creator_wallet && (
          <a href={`https://solscan.io/account/${item.creator_wallet}`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-2 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"><ExternalLink className="h-3 w-3" /> Dev Wallet</Button>
          </a>
        )}
        {item.x_community_url && (
          <a href={item.x_community_url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-2"><ExternalLink className="h-3 w-3" /> {item.x_community_name || 'X Community'}</Button>
          </a>
        )}
        <a href={`/holders?token=${item.token_mint}`} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline" className="gap-2"><Users className="h-3 w-3" /> Wallet Analysis</Button>
        </a>
        <a href={bubblePath} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline" className="gap-2"><Compass className="h-3 w-3" /> Bubble Map!</Button>
        </a>
      </div>
    );
  }

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Telegram Promo Banner */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row items-center gap-3">
          <MessageCircle className="h-6 w-6 text-primary shrink-0" />
          <div className="text-center sm:text-left flex-1">
            <p className="text-sm font-medium">This feed is <strong>live and free</strong> in our Telegram channel — real-time alerts, no delay.</p>
          </div>
          <a href="https://t.me/HoldersIntel" target="_blank" rel="noopener noreferrer" className="shrink-0">
            <Button size="sm" className="gap-2"><MessageCircle className="h-4 w-4" /> Join Channel</Button>
          </a>
        </div>

        {/* Intelligence Warning Banner */}
        <div className="rounded-lg border-2 border-amber-500/40 bg-amber-500/5 p-4 md:p-5 space-y-2" data-oracle-hint="Health grades are AI-calculated — ask me how they work" data-oracle-zone="feed-health-info">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none mt-0.5">⚠️</span>
            <div className="space-y-1.5">
              <p className="text-sm md:text-base font-bold text-amber-400 uppercase tracking-wide">Intelligence Data Notice</p>
              <p className="text-xs md:text-sm text-foreground/90 leading-relaxed">
                12-hour <strong>Health &amp; Risk Rating Blocks</strong> of the most recent <strong>active top 500 tokens</strong>, curated from our database of the last 30 days — filtered from the top 12,000 tokens scraped and collected from our <strong>65,000+ token database</strong> and growing daily.
              </p>
              <p className="text-xs md:text-sm text-foreground/70 leading-relaxed">
                 Spidered and cross-linked with wallets and community socials. Mouse over blocks for saved snapshot history when available. Use the refresh button for the latest analysis on any token.
              </p>
            </div>
          </div>
        </div>

        {/* Header + Controls */}
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Live Intel Feed</h1>
            <p className="text-sm text-muted-foreground">
              {totalCount.toLocaleString()} tokens curated — Top 200 + Intel Reports + Community Discoveries
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 md:w-72" data-oracle-hint="Search by name, symbol, or paste a contract address" data-oracle-zone="feed-search">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search $TICKER or token address..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex border border-border rounded-md overflow-hidden">
              <Button variant={view === 'summary' ? 'default' : 'ghost'} size="icon" className="rounded-none h-10 w-10" onClick={() => setView('summary')}>
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button variant={view === 'grid' ? 'default' : 'ghost'} size="icon" className="rounded-none h-10 w-10" onClick={() => setView('grid')}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Litmus Strip Legend */}
        <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1" data-oracle-hint="Click any token row for the full breakdown and action buttons" data-oracle-zone="feed-litmus">
          <span className="font-medium">12h History:</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-3 rounded-sm bg-emerald-500 inline-block" /> Strong (A-B+)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-3 rounded-sm bg-yellow-400 inline-block" /> Moderate (B-C)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-3 rounded-sm bg-orange-500 inline-block" /> Weak (D)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-3 rounded-sm bg-red-500 inline-block" /> Critical (F)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-3 rounded-sm bg-muted-foreground/20 inline-block" /> No data</span>
          <span className="hidden sm:inline">— Hover for saved snapshots • <Star className="h-2.5 w-2.5 inline fill-amber-400 text-amber-400" /> = Top 200</span>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No results found.</div>
        ) : view === 'summary' ? (
          /* ── Summary View ── */
          <div className="space-y-3">
            {items.map(item => {
              return (
                <Card key={item.token_mint} className="p-4 cursor-pointer hover:border-primary/40 transition-colors" onClick={() => handleItemClick(item)}>
                  <div className="flex items-center gap-3">
                    {item.image_uri && (
                      <img src={item.image_uri} alt="" className="w-10 h-10 rounded-full shrink-0 object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FreshnessBadge tier={item.freshness_tier} rank={item.last_top_200_rank} />
                        <span className="font-bold text-sm">${getDisplayTicker(item)}</span>
                        <span className="text-xs text-muted-foreground truncate">{getDisplayName(item)}</span>
                        <HealthBadge grade={item.health_grade} showDescription />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <RiskSignalBadge grade={item.health_grade} />
                        <WalletInfo holders={item.total_holders} dustPct={item.dust_pct} />
                        <LitmusStrip tokenMint={item.token_mint} />
                        {item.last_activity && <span>Last activity {format(new Date(item.last_activity), 'MMM d, yyyy HH:mm')}</span>}
                      </div>
                    </div>
                    {!isMobile && (
                      expandedMint === item.token_mint ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  {/* Expanded content (desktop) */}
                  {!isMobile && expandedMint === item.token_mint && (
                    <div className="mt-4 pt-4 border-t border-border space-y-3">
                      <div className="text-sm space-y-1">
                        <div><span className="text-muted-foreground">Mint:</span> <code className="text-xs break-all">{item.token_mint}</code></div>
                      </div>
                      <ItemActions item={item} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          /* ── Grid View ── */
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead compact className="cursor-pointer" onClick={() => toggleSort('freshness_tier')}>
                    <div className="flex items-center gap-1">Rank <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead compact className="cursor-pointer" onClick={() => toggleSort('symbol')}>
                    <div className="flex items-center gap-1">$TICKER <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead compact className="cursor-pointer" onClick={() => toggleSort('health_grade')}>
                    <div className="flex items-center gap-1">Health <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead compact>Risk</TableHead>
                  <TableHead compact>Wallets</TableHead>
                  <TableHead compact className="cursor-pointer" onClick={() => toggleSort('last_activity')}>
                    <div className="flex items-center gap-1">Last activity <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.token_mint} className="cursor-pointer" onClick={() => handleItemClick(item)}>
                    <TableCell compact>
                      <FreshnessBadge tier={item.freshness_tier} rank={item.last_top_200_rank} />
                    </TableCell>
                    <TableCell compact>
                      <div className="flex items-center gap-2">
                        {item.image_uri && <img src={item.image_uri} alt="" className="w-5 h-5 rounded-full" />}
                         <span className="font-medium">${getDisplayTicker(item)}</span>
                      </div>
                    </TableCell>
                    <TableCell compact><HealthBadge grade={item.health_grade} showDescription /></TableCell>
                    <TableCell compact><RiskSignalBadge grade={item.health_grade} /></TableCell>
                    <TableCell compact><WalletInfo holders={item.total_holders} dustPct={item.dust_pct} /></TableCell>
                    <TableCell compact>{item.last_activity ? format(new Date(item.last_activity), 'MMM d HH:mm') : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious onClick={() => setPage(p => Math.max(1, p - 1))} className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
              </PaginationItem>
              {paginationPages.map((p, i) =>
                p === 'ellipsis' ? (
                  <PaginationItem key={`e${i}`}><PaginationEllipsis /></PaginationItem>
                ) : (
                  <PaginationItem key={p}>
                    <PaginationLink isActive={page === p} onClick={() => setPage(p as number)} className="cursor-pointer">{p}</PaginationLink>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <PaginationNext onClick={() => setPage(p => Math.min(totalPages, p + 1))} className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>

      {/* Mobile / Click Modal */}
      <Dialog open={!!modalItem} onOpenChange={() => setModalItem(null)}>
        <DialogContent className="max-w-md">
          {modalItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {modalItem.image_uri && <img src={modalItem.image_uri} alt="" className="w-8 h-8 rounded-full" />}
                  <FreshnessBadge tier={modalItem.freshness_tier} rank={modalItem.last_top_200_rank} />
                   ${getDisplayTicker(modalItem)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">{getDisplayName(modalItem)}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <HealthBadge grade={modalItem.health_grade} showDescription />
                  <RiskSignalBadge grade={modalItem.health_grade} />
                </div>
                <WalletInfo holders={modalItem.total_holders} dustPct={modalItem.dust_pct} />
                <LitmusStrip tokenMint={modalItem.token_mint} />
                <div className="text-xs text-muted-foreground">
                  {modalItem.last_activity && <span>Last seen: {format(new Date(modalItem.last_activity), 'MMM d, yyyy HH:mm')}</span>}
                </div>
                <div><span className="text-muted-foreground text-xs">Mint:</span> <code className="text-xs break-all">{modalItem.token_mint}</code></div>
                <div className="pt-2">
                  <ItemActions item={modalItem} onClose={() => setModalItem(null)} />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Redirect Modal */}
      <Dialog open={!!redirectModal} onOpenChange={() => setRedirectModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Try a different tool</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {redirectModal?.type === 'handle' ? (
              <p>It looks like you entered an X handle. Try our <strong>Bubble Map</strong> to explore wallet networks.</p>
            ) : (
              <p>This address wasn't found in our feed. It may be a wallet address — try our <strong>Holder Analysis</strong> tool.</p>
            )}
            <div className="flex gap-2">
              <a href="/holders" target="_blank" rel="noopener noreferrer"><Button size="sm" onClick={() => setRedirectModal(null)}>Wallet Analysis</Button></a>
              <a href="/bubblemap" target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" onClick={() => setRedirectModal(null)}>Bubble Map</Button></a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SiteLayout>
  );
}
