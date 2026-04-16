import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Waves, RefreshCw, TrendingUp, DollarSign, Droplets, ExternalLink, 
  Clock, Activity, Plus, Loader2, ArrowUpDown, Coins, BarChart3, Lock, Download
} from 'lucide-react';
import { useSolPrice } from '@/hooks/useSolPrice';

interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  price: number;
  market_cap: number;
  holders: number;
}

interface PoolData {
  address: string;
  name: string;
  token_x: TokenInfo;
  token_y: TokenInfo;
  token_x_amount: number;
  token_y_amount: number;
  tvl: number;
  current_price: number;
  created_at: number;
  pool_config: {
    base_fee_pct: number;
    protocol_fee_pct: number;
    dynamic_fee_initialized: boolean;
    concentrated_liquidity: boolean;
  };
  volume: Record<string, number>;
  fees: Record<string, number>;
  fee_tvl_ratio: Record<string, number>;
  cumulative_metrics: { volume: number; fees: number };
  permanent_lock_liquidity: number;
  has_farm: boolean;
  farm_apr: number;
  launchpad: string;
}

interface PoolTransaction {
  signature: string;
  timestamp: number;
  type: string;
  description: string;
  fee: number;
  tokenTransfers: Array<{
    mint: string;
    tokenAmount: number;
    fromUserAccount: string;
    toUserAccount: string;
  }>;
}

interface PoolResult {
  pool: PoolData;
  transactions: PoolTransaction[];
  wallet: string;
}

const DEFAULT_POOL = 'FqB1j4BAKoUzvmeKAKvzsJDy3kTfgTTEp2CpRii1opj4';

export function MeteoraPoolsDashboard() {
  const [pools, setPools] = useState<PoolResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newPoolAddress, setNewPoolAddress] = useState('');
  const [trackedPools, setTrackedPools] = useState<string[]>([DEFAULT_POOL]);
  const { price: solPrice } = useSolPrice();

  const fetchPools = useCallback(async () => {
    setIsLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = (await supabase.auth.getSession()).data.session;
      
      const url = `${supabaseUrl}/functions/v1/meteora-pools?action=wallet-pools&pool_addresses=${trackedPools.join(',')}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || anonKey}`,
          'apikey': anonKey,
        },
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPools(data?.pools || []);
    } catch (err: any) {
      console.error('Failed to fetch pools:', err);
      toast.error('Failed to fetch pool data');
    } finally {
      setIsLoading(false);
    }
  }, [trackedPools]);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  const addPool = () => {
    const addr = newPoolAddress.trim();
    if (!addr || trackedPools.includes(addr)) return;
    if (addr.length < 32 || addr.length > 44) {
      toast.error('Invalid pool address');
      return;
    }
    setTrackedPools(prev => [...prev, addr]);
    setNewPoolAddress('');
    toast.success('Pool added, refreshing...');
  };

  const removePool = (addr: string) => {
    setTrackedPools(prev => prev.filter(p => p !== addr));
  };

  const formatUsd = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  };

  const formatNumber = (n: number, decimals = 2) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(decimals)}K`;
    return n.toFixed(decimals);
  };

  const timeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 24) return `${Math.floor(hours / 24)}d ago`;
    if (hours > 0) return `${hours}h ${mins}m ago`;
    return `${mins}m ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
            <Waves className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Meteora Liquidity Pools</h2>
            <p className="text-sm text-muted-foreground">DAMM v2 · Active LP Positions</p>
          </div>
        </div>
        <Button onClick={fetchPools} disabled={isLoading} variant="outline" size="sm">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {/* Add Pool */}
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input
              placeholder="Add Meteora DAMM v2 pool address..."
              value={newPoolAddress}
              onChange={(e) => setNewPoolAddress(e.target.value)}
              className="font-mono text-xs"
              onKeyDown={(e) => e.key === 'Enter' && addPool()}
            />
            <Button onClick={addPool} size="sm" disabled={!newPoolAddress.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pool Cards */}
      {isLoading && pools.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : pools.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Droplets className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No pool data available. Add a pool address above or wait for data to load.</p>
          </CardContent>
        </Card>
      ) : (
        pools.map((result) => (
          <PoolCard
            key={result.pool.address}
            result={result}
            solPrice={solPrice}
            formatUsd={formatUsd}
            formatNumber={formatNumber}
            timeAgo={timeAgo}
            onRemove={() => removePool(result.pool.address)}
          />
        ))
      )}

      {/* Tracked Pools without data */}
      {trackedPools.filter(addr => !pools.find(p => p.pool.address === addr)).map(addr => (
        <Card key={addr} className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-mono text-muted-foreground">{addr}</p>
              <p className="text-xs text-yellow-500">Pending data fetch...</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => removePool(addr)}>Remove</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PoolCard({ result, solPrice, formatUsd, formatNumber, timeAgo, onRemove }: {
  result: PoolResult;
  solPrice: number;
  formatUsd: (n: number) => string;
  formatNumber: (n: number, d?: number) => string;
  timeAgo: (t: number) => string;
  onRemove: () => void;
}) {
  const { pool, transactions, wallet } = result;
  const [showTxs, setShowTxs] = useState(false);
  const [showReclaimDialog, setShowReclaimDialog] = useState(false);
  const [reclaimSig, setReclaimSig] = useState('');
  const [reclaimMint, setReclaimMint] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const tokenXValue = pool.token_x_amount * pool.token_x.price;
  const tokenYValue = pool.token_y_amount * pool.token_y.price;
  const totalValue = tokenXValue + tokenYValue;
  const xPct = totalValue > 0 ? (tokenXValue / totalValue) * 100 : 50;

  const feeApr = pool.fee_tvl_ratio['24h'] ? (pool.fee_tvl_ratio['24h'] * 365).toFixed(1) : '0';

  const handleImportReclaim = async () => {
    const sig = reclaimSig.trim();
    if (!sig || sig.length < 64) {
      toast.error('Enter a valid LP withdrawal transaction signature');
      return;
    }
    setIsImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('flipit-lp-reclaim', {
        body: {
          signature: sig,
          pool_address: pool.address,
          wallet_pubkey: wallet,
          token_mint: reclaimMint.trim() || undefined,
        },
      });
      if (error) throw new Error(error.message || 'Import failed');
      if (data?.error) {
        toast.error(data.message || data.error);
        return;
      }
      const s = data?.summary;
      toast.success(
        `Imported ${s?.token || 'token'}: ${Number(s?.quantity || 0).toLocaleString()} tokens @ $${Number(s?.price_usd || 0).toFixed(8)} (= $${Number(s?.reclaimed_value_usd || 0).toFixed(2)})`,
        { duration: 8000 }
      );
      setShowReclaimDialog(false);
      setReclaimSig('');
      setReclaimMint('');
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* Pool Header */}
      <CardHeader className="pb-3 bg-gradient-to-r from-blue-500/5 to-cyan-500/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-[10px] font-bold text-white border-2 border-background z-10">
                {pool.token_x.symbol.slice(0, 2).toUpperCase()}
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white border-2 border-background">
                {pool.token_y.symbol.slice(0, 2).toUpperCase()}
              </div>
            </div>
            <div>
              <CardTitle className="text-lg">{pool.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-[10px]">DAMM v2</Badge>
                {pool.pool_config.dynamic_fee_initialized && (
                  <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-500">Dynamic Fee</Badge>
                )}
                {pool.launchpad && (
                  <Badge variant="outline" className="text-[10px] border-orange-500/50 text-orange-500">{pool.launchpad}</Badge>
                )}
                {pool.permanent_lock_liquidity > 0 && (
                  <Badge variant="outline" className="text-[10px] border-blue-500/50 text-blue-500">
                    <Lock className="h-3 w-3 mr-1" />{pool.permanent_lock_liquidity.toFixed(0)}% Locked
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReclaimDialog(true)}
              className="text-xs gap-1 border-cyan-500/40 text-cyan-500 hover:bg-cyan-500/10"
              title="Import LP withdrawal as a Reclaimed flip position"
            >
              <Download className="h-3.5 w-3.5" />
              Import LP Withdrawal
            </Button>
            <a
              href={`https://www.meteora.ag/dammv2/${pool.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <Button variant="ghost" size="sm" onClick={onRemove} className="text-xs text-destructive">✕</Button>
          </div>
        </div>
      </CardHeader>

      {/* LP Reclaim Import Dialog */}
      <Dialog open={showReclaimDialog} onOpenChange={setShowReclaimDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-cyan-500" />
              Import LP Withdrawal as Reclaimed Position
            </DialogTitle>
            <DialogDescription>
              Paste the transaction signature for the LP dissolution. The system will fetch the returned tokens to wallet
              <code className="mx-1 text-[10px] bg-muted px-1 py-0.5 rounded">{wallet?.slice(0, 6)}...{wallet?.slice(-4)}</code>
              and create a synthetic flip position priced at the current token value. SOL returned to the wallet is not tracked as a position.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">LP Withdrawal Tx Signature *</Label>
              <Input
                placeholder="5xK...sig"
                value={reclaimSig}
                onChange={(e) => setReclaimSig(e.target.value)}
                className="font-mono text-xs"
                disabled={isImporting}
              />
            </div>
            <div>
              <Label className="text-xs">Specific Token Mint (optional)</Label>
              <Input
                placeholder={`Default: largest non-SOL token returned (${pool.token_x.symbol} or ${pool.token_y.symbol})`}
                value={reclaimMint}
                onChange={(e) => setReclaimMint(e.target.value)}
                className="font-mono text-xs"
                disabled={isImporting}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Leave blank to auto-pick the largest non-SOL token transfer in the tx.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowReclaimDialog(false)} disabled={isImporting}>Cancel</Button>
            <Button onClick={handleImportReclaim} disabled={isImporting || !reclaimSig.trim()}>
              {isImporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Import as Reclaimed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CardContent className="space-y-4 pt-4">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricBox 
            icon={<DollarSign className="h-4 w-4" />}
            label="TVL" 
            value={formatUsd(pool.tvl)} 
            color="text-green-400"
          />
          <MetricBox 
            icon={<BarChart3 className="h-4 w-4" />}
            label="24h Volume" 
            value={formatUsd(pool.volume['24h'] || 0)} 
            color="text-blue-400"
          />
          <MetricBox 
            icon={<Coins className="h-4 w-4" />}
            label="24h Fees" 
            value={formatUsd(pool.fees['24h'] || 0)} 
            color="text-yellow-400"
          />
          <MetricBox 
            icon={<TrendingUp className="h-4 w-4" />}
            label="Fee APR" 
            value={`${feeApr}%`}
            color="text-emerald-400"
          />
        </div>

        <Separator />

        {/* Liquidity Allocation */}
        <div>
          <p className="text-sm font-medium mb-2 text-muted-foreground">Liquidity Allocation</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{pool.token_x.symbol}</span>
              <span className="text-muted-foreground">
                {formatNumber(pool.token_x_amount)} · {formatUsd(tokenXValue)} · {xPct.toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
              <div 
                className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-l-full transition-all" 
                style={{ width: `${xPct}%` }}
              />
              <div 
                className="h-full bg-gradient-to-r from-purple-400 to-indigo-500 rounded-r-full transition-all" 
                style={{ width: `${100 - xPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{pool.token_y.symbol}</span>
              <span className="text-muted-foreground">
                {formatNumber(pool.token_y_amount)} · {formatUsd(tokenYValue)} · {(100 - xPct).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Pool Configuration */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Base Fee</p>
            <p className="font-medium">{pool.pool_config.base_fee_pct}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Protocol Fee</p>
            <p className="font-medium">{pool.pool_config.protocol_fee_pct}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Current Price</p>
            <p className="font-medium">1 {pool.token_x.symbol} ≈ {pool.current_price < 0.001 ? pool.current_price.toExponential(3) : pool.current_price.toFixed(6)} {pool.token_y.symbol}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Created</p>
            <p className="font-medium">{timeAgo(pool.created_at)}</p>
          </div>
        </div>

        {/* Volume Breakdown */}
        <div>
          <p className="text-sm font-medium mb-2 text-muted-foreground">Volume & Fees by Window</p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {['30m', '1h', '2h', '4h', '12h', '24h'].map(window => (
              <div key={window} className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">{window}</p>
                <p className="text-xs font-bold">{formatUsd(pool.volume[window] || 0)}</p>
                <p className="text-[10px] text-yellow-500">{formatUsd(pool.fees[window] || 0)} fees</p>
              </div>
            ))}
          </div>
        </div>

        {/* Cumulative */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
          <div>
            <p className="text-xs text-muted-foreground">Cumulative Volume</p>
            <p className="font-bold text-green-400">{formatUsd(pool.cumulative_metrics.volume)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Fees Earned</p>
            <p className="font-bold text-yellow-400">{formatUsd(pool.cumulative_metrics.fees)}</p>
          </div>
        </div>

        {/* Token Info */}
        <div className="grid grid-cols-2 gap-3">
          <TokenInfoCard token={pool.token_x} formatUsd={formatUsd} formatNumber={formatNumber} />
          <TokenInfoCard token={pool.token_y} formatUsd={formatUsd} formatNumber={formatNumber} />
        </div>

        {/* Transactions */}
        {transactions.length > 0 && (
          <>
            <Separator />
            <div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowTxs(!showTxs)}
                className="text-sm text-muted-foreground"
              >
                <Activity className="h-4 w-4 mr-2" />
                {transactions.length} Pool Transactions
                <ArrowUpDown className="h-3 w-3 ml-2" />
              </Button>
              {showTxs && (
                <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                  {transactions.map(tx => (
                    <div key={tx.signature} className="flex items-center justify-between p-2 rounded bg-muted/30 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{tx.type}</Badge>
                        <span className="text-muted-foreground truncate max-w-[200px]">{tx.description || tx.signature.slice(0, 16) + '...'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{timeAgo(tx.timestamp * 1000)}</span>
                        <a
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MetricBox({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50 border border-muted">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-[10px] uppercase text-muted-foreground font-medium">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function TokenInfoCard({ token, formatUsd, formatNumber }: { 
  token: TokenInfo; 
  formatUsd: (n: number) => string; 
  formatNumber: (n: number, d?: number) => string 
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-muted">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">{token.symbol}</span>
        <a
          href={`https://solscan.io/token/${token.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Price</span>
          <span>{token.price < 0.001 ? token.price.toExponential(3) : `$${token.price.toFixed(4)}`}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">MCap</span>
          <span>{formatUsd(token.market_cap)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Holders</span>
          <span>{formatNumber(token.holders, 0)}</span>
        </div>
      </div>
    </div>
  );
}
