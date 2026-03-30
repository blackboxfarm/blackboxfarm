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
import { Search, LayoutList, LayoutGrid, MessageCircle, ExternalLink, ChevronDown, ChevronUp, ArrowUpDown, Users, Compass } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LitmusStrip } from '@/components/feed/LitmusStrip';

const PAGE_SIZE = 50;

type FeedItem = {
  id: string;
  symbol: string | null;
  name: string | null;
  token_mint: string;
  posted_at: string | null;
  tweet_id: string | null;
  health_grade: string | null;
  image_uri: string | null;
  total_holders: number | null;
  dust_pct: number | null;
};

type SortField = 'posted_at' | 'symbol' | 'health_grade';
type SortDir = 'asc' | 'desc';

const HEALTH_COLORS: Record<string, string> = {
  'A++': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'A+': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'A': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  'B+': 'bg-green-500/15 text-green-400 border-green-500/25',
  'B': 'bg-lime-500/15 text-lime-400 border-lime-500/25',
  'C+': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  'C': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'D': 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  'F': 'bg-red-500/15 text-red-400 border-red-500/25',
};

const HEALTH_DESCRIPTIONS: Record<string, string> = {
  'A++': 'Exceptional Network',
  'A+': 'Strong Network',
  'A': 'Healthy Distribution',
  'B+': 'Above Average',
  'B': 'Moderate Strength',
  'C+': 'Mixed Signals',
  'C': 'Speculative',
  'D': 'Weak Structure',
  'F': 'High Risk',
};

function getRiskSignal(grade: string | null): { emoji: string; label: string; color: string } {
  if (!grade) return { emoji: '⚪', label: 'Unknown', color: 'text-muted-foreground' };
  if (['A++', 'A+', 'A'].includes(grade)) return { emoji: '🟢', label: 'Strong', color: 'text-emerald-400' };
  if (['B+', 'B'].includes(grade)) return { emoji: '🟢', label: 'Moderate', color: 'text-green-400' };
  if (['C+', 'C'].includes(grade)) return { emoji: '🟡', label: 'Speculative', color: 'text-yellow-400' };
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

export default function Feed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [view, setView] = useState<'summary' | 'grid'>('summary');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalItem, setModalItem] = useState<FeedItem | null>(null);
  const [sortField, setSortField] = useState<SortField>('posted_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [redirectModal, setRedirectModal] = useState<{ type: 'wallet' | 'handle'; value: string } | null>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

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

    let query = supabase
      .from('holders_intel_post_queue')
      .select('id, symbol, name, token_mint, posted_at, tweet_id', { count: 'exact' })
      .eq('status', 'posted')
      .not('posted_at', 'is', null);

    if (debouncedSearch.trim()) {
      const s = debouncedSearch.trim().replace(/^\$/, '');
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) {
        query = query.eq('token_mint', s);
      } else {
        query = query.ilike('symbol', `%${s}%`);
      }
    }

    query = query.order(sortField, { ascending: sortDir === 'asc' });
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) { console.error(error); setLoading(false); return; }

    const mints = (data || []).map(d => d.token_mint);
    let healthMap: Record<string, { health_grade: string | null; image_uri: string | null }> = {};
    let holderMap: Record<string, { total_holders: number; dust_pct: number }> = {};

    if (mints.length > 0) {
      // Fetch health grades + images
      const { data: seenData } = await supabase
        .from('holders_intel_seen_tokens')
        .select('token_mint, health_grade, image_uri')
        .in('token_mint', mints);
      if (seenData) {
        seenData.forEach(s => { healthMap[s.token_mint] = { health_grade: s.health_grade, image_uri: s.image_uri }; });
      }

      // Fetch latest holder summary for wallet counts + dust
      const { data: holderData } = await supabase
        .from('holder_daily_summary')
        .select('token_mint, total_holders, shrimp_count')
        .in('token_mint', mints)
        .order('summary_date', { ascending: false });
      if (holderData) {
        // Take most recent per mint
        holderData.forEach(h => {
          if (!holderMap[h.token_mint]) {
            const dustPct = h.total_holders > 0 ? ((h.shrimp_count || 0) / h.total_holders) * 100 : 0;
            holderMap[h.token_mint] = { total_holders: h.total_holders, dust_pct: dustPct };
          }
        });
      }
    }

    const merged: FeedItem[] = (data || []).map(d => ({
      id: d.id,
      symbol: d.symbol,
      name: d.name,
      token_mint: d.token_mint,
      posted_at: d.posted_at,
      tweet_id: d.tweet_id,
      health_grade: healthMap[d.token_mint]?.health_grade || null,
      image_uri: healthMap[d.token_mint]?.image_uri || null,
      total_holders: holderMap[d.token_mint]?.total_holders || null,
      dust_pct: holderMap[d.token_mint]?.dust_pct ?? null,
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
      setSortDir('desc');
    }
  }

  function handleItemClick(item: FeedItem) {
    if (isMobile) {
      setModalItem(item);
    } else {
      setExpandedId(prev => prev === item.id ? null : item.id);
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

        {/* Header + Controls */}
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Live Feed</h1>
            <p className="text-sm text-muted-foreground">{totalCount.toLocaleString()} token reports posted</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 md:w-72">
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
              const risk = getRiskSignal(item.health_grade);
              return (
                <Card key={item.id} className="p-4 cursor-pointer hover:border-primary/40 transition-colors" onClick={() => handleItemClick(item)}>
                  <div className="flex items-center gap-3">
                    {item.image_uri && (
                      <img src={item.image_uri} alt="" className="w-10 h-10 rounded-full shrink-0 object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">${item.symbol || '???'}</span>
                        <span className="text-xs text-muted-foreground truncate">{item.name}</span>
                        <HealthBadge grade={item.health_grade} showDescription />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <RiskSignalBadge grade={item.health_grade} />
                        <WalletInfo holders={item.total_holders} dustPct={item.dust_pct} />
                        {item.posted_at && <span>{format(new Date(item.posted_at), 'MMM d, yyyy HH:mm')}</span>}
                      </div>
                    </div>
                    {!isMobile && (
                      expandedId === item.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  {/* Expanded content (desktop) */}
                  {!isMobile && expandedId === item.id && (
                    <div className="mt-4 pt-4 border-t border-border space-y-3">
                      <div className="text-sm space-y-1">
                        <div><span className="text-muted-foreground">Mint:</span> <code className="text-xs break-all">{item.token_mint}</code></div>
                      </div>
                      <div className="flex gap-2">
                        {item.tweet_id && (
                          <a href={`https://x.com/HoldersIntel/status/${item.tweet_id}`} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="gap-2"><ExternalLink className="h-3 w-3" /> View on X</Button>
                          </a>
                        )}
                        <Button size="sm" variant="outline" className="gap-2" onClick={e => { e.stopPropagation(); navigate(`/holders?token=${item.token_mint}`); }}>
                          <Users className="h-3 w-3" /> Wallet Analysis
                        </Button>
                        <Button size="sm" variant="outline" className="gap-2" onClick={e => { e.stopPropagation(); navigate(`/bubblemap?mint=${item.token_mint}`); }}>
                          <Compass className="h-3 w-3" /> Bubble Map!
                        </Button>
                      </div>
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
                  <TableHead compact className="cursor-pointer" onClick={() => toggleSort('symbol')}>
                    <div className="flex items-center gap-1">$TICKER <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead compact className="cursor-pointer" onClick={() => toggleSort('health_grade')}>
                    <div className="flex items-center gap-1">Health <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead compact>Risk</TableHead>
                  <TableHead compact>Wallets</TableHead>
                  <TableHead compact className="cursor-pointer" onClick={() => toggleSort('posted_at')}>
                    <div className="flex items-center gap-1">Date <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => handleItemClick(item)}>
                    <TableCell compact>
                      <div className="flex items-center gap-2">
                        {item.image_uri && <img src={item.image_uri} alt="" className="w-5 h-5 rounded-full" />}
                        <span className="font-medium">${item.symbol || '???'}</span>
                      </div>
                    </TableCell>
                    <TableCell compact><HealthBadge grade={item.health_grade} showDescription /></TableCell>
                    <TableCell compact><RiskSignalBadge grade={item.health_grade} /></TableCell>
                    <TableCell compact><WalletInfo holders={item.total_holders} dustPct={item.dust_pct} /></TableCell>
                    <TableCell compact>{item.posted_at ? format(new Date(item.posted_at), 'MMM d HH:mm') : '—'}</TableCell>
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
                  ${modalItem.symbol || '???'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">{modalItem.name}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <HealthBadge grade={modalItem.health_grade} showDescription />
                  <RiskSignalBadge grade={modalItem.health_grade} />
                </div>
                <WalletInfo holders={modalItem.total_holders} dustPct={modalItem.dust_pct} />
                <div className="text-xs text-muted-foreground">
                  {modalItem.posted_at && <span>Posted: {format(new Date(modalItem.posted_at), 'MMM d, yyyy HH:mm')}</span>}
                </div>
                <div><span className="text-muted-foreground text-xs">Mint:</span> <code className="text-xs break-all">{modalItem.token_mint}</code></div>
                <div className="flex gap-2 pt-2 flex-wrap">
                  {modalItem.tweet_id && (
                    <a href={`https://x.com/HoldersIntel/status/${modalItem.tweet_id}`} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-2"><ExternalLink className="h-3 w-3" /> View on X</Button>
                    </a>
                  )}
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => { setModalItem(null); navigate(`/holders?token=${modalItem.token_mint}`); }}>
                    <Users className="h-3 w-3" /> Wallet Analysis
                  </Button>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => { setModalItem(null); navigate(`/bubblemap?mint=${modalItem.token_mint}`); }}>
                    <Compass className="h-3 w-3" /> Bubble Map!
                  </Button>
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
              <Button size="sm" onClick={() => { setRedirectModal(null); navigate('/holders'); }}>Wallet Analysis</Button>
              <Button size="sm" variant="outline" onClick={() => { setRedirectModal(null); navigate('/bubblemap'); }}>Bubble Map</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SiteLayout>
  );
}
