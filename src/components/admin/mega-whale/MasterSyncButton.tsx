import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  RefreshCw, 
  Loader2, 
  CheckCircle, 
  Wallet, 
  Coins, 
  Layers, 
  Sparkles,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  megaWhaleId: string;
  whaleName?: string;
}

interface SyncStats {
  totalWallets: number;
  dustWallets: number;
  mintedWallets: number;
  mintableWallets: number;
  bundledWallets: number;
  lastSync: string | null;
}

export const MasterSyncButton: React.FC<Props> = ({ megaWhaleId, whaleName }) => {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  useEffect(() => {
    loadStats();
  }, [megaWhaleId]);

  const loadStats = async () => {
    try {
      // Get whale info for last sync time
      const { data: whale } = await supabase
        .from('mega_whales')
        .select('last_sync_at, total_offspring_wallets')
        .eq('id', megaWhaleId)
        .single();

      // Get wallet stats
      const { data: offspring } = await supabase
        .from('mega_whale_offspring')
        .select('is_dust, has_minted, is_mintable, is_bundled')
        .eq('mega_whale_id', megaWhaleId);

      if (offspring) {
        setStats({
          totalWallets: offspring.length,
          dustWallets: offspring.filter(w => w.is_dust).length,
          mintedWallets: offspring.filter(w => w.has_minted).length,
          mintableWallets: offspring.filter(w => w.is_mintable).length,
          bundledWallets: offspring.filter(w => w.is_bundled).length,
          lastSync: whale?.last_sync_at || null,
        });
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const runMasterSync = async (forceFull = false) => {
    setSyncing(true);
    setProgress(0);
    setStatus('Starting sync...');

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(p => Math.min(p + 2, 90));
      }, 1000);

      setStatus('Discovering wallets (6 levels deep)...');
      
      const { data, error } = await supabase.functions.invoke('mega-whale-master-sync', {
        body: { 
          mega_whale_id: megaWhaleId,
          max_depth: 6,
          force_full_sync: forceFull
        }
      });

      clearInterval(progressInterval);

      if (error) throw error;

      setProgress(100);
      setStatus('Sync complete!');
      setLastResult(data);

      toast.success(
        `Sync complete! Found ${data.wallets_discovered} wallets, ${data.minters_found} minters, ${data.dust_marked} dust`,
        { duration: 5000 }
      );

      await loadStats();

    } catch (error: any) {
      toast.error(`Sync failed: ${error.message}`);
      setStatus('Sync failed');
    } finally {
      setSyncing(false);
      setTimeout(() => {
        setProgress(0);
        setStatus('');
      }, 3000);
    }
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Never synced';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Master Sync
          </div>
          {stats?.lastSync && (
            <Badge variant="outline" className="text-xs font-normal">
              <Clock className="h-3 w-3 mr-1" />
              {formatLastSync(stats.lastSync)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        {stats && stats.totalWallets > 0 && (
          <div className="grid grid-cols-5 gap-2 text-center">
            <div className="p-2 rounded-lg bg-background/50 border border-border/30">
              <Wallet className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <div className="font-mono font-bold">{stats.totalWallets}</div>
              <div className="text-[10px] text-muted-foreground">Total</div>
            </div>
            <div className="p-2 rounded-lg bg-background/50 border border-border/30">
              <AlertTriangle className="h-4 w-4 mx-auto mb-1 text-orange-500" />
              <div className="font-mono font-bold text-orange-500">{stats.dustWallets}</div>
              <div className="text-[10px] text-muted-foreground">Dust</div>
            </div>
            <div className="p-2 rounded-lg bg-background/50 border border-border/30">
              <Coins className="h-4 w-4 mx-auto mb-1 text-purple-500" />
              <div className="font-mono font-bold text-purple-500">{stats.mintedWallets}</div>
              <div className="text-[10px] text-muted-foreground">Minted</div>
            </div>
            <div className="p-2 rounded-lg bg-background/50 border border-border/30">
              <Sparkles className="h-4 w-4 mx-auto mb-1 text-green-500" />
              <div className="font-mono font-bold text-green-500">{stats.mintableWallets}</div>
              <div className="text-[10px] text-muted-foreground">Mintable</div>
            </div>
            <div className="p-2 rounded-lg bg-background/50 border border-border/30">
              <Layers className="h-4 w-4 mx-auto mb-1 text-blue-500" />
              <div className="font-mono font-bold text-blue-500">{stats.bundledWallets}</div>
              <div className="text-[10px] text-muted-foreground">Bundled</div>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {syncing && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">{status}</p>
          </div>
        )}

        {/* Last Result */}
        {lastResult && !syncing && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm">
            <div className="flex items-center gap-2 text-green-500 font-medium mb-2">
              <CheckCircle className="h-4 w-4" />
              {lastResult.sync_type === 'incremental' ? 'Incremental' : 'Full'} Sync Complete
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div>Wallets discovered: <span className="text-foreground">{lastResult.wallets_discovered}</span></div>
              <div>New wallets: <span className="text-foreground">{lastResult.new_wallets}</span></div>
              <div>Minters found: <span className="text-foreground">{lastResult.minters_found}</span></div>
              <div>Dust marked: <span className="text-foreground">{lastResult.dust_marked}</span></div>
              <div>Mintable marked: <span className="text-foreground">{lastResult.mintable_marked}</span></div>
              <div>Bundles detected: <span className="text-foreground">{lastResult.bundled_detected}</span></div>
            </div>
          </div>
        )}

        {/* Main Sync Button */}
        <Button
          onClick={() => runMasterSync(false)}
          disabled={syncing}
          size="lg"
          className="w-full h-14 text-base font-semibold"
        >
          {syncing ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Syncing...
            </>
          ) : stats?.lastSync ? (
            <>
              <RefreshCw className="h-5 w-5 mr-2" />
              Sync Wallets
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5 mr-2" />
              Run Initial Sync
            </>
          )}
        </Button>

        {/* Force Full Sync (smaller) */}
        {stats?.lastSync && (
          <Button
            onClick={() => runMasterSync(true)}
            disabled={syncing}
            variant="outline"
            size="sm"
            className="w-full"
          >
            Force Full Resync
          </Button>
        )}

        {/* Info Text */}
        <p className="text-xs text-muted-foreground text-center">
          {stats?.lastSync 
            ? 'Click to check for new wallets & update balances'
            : 'Discovers wallets 6-deep, checks balances & mint history, auto-flags dust/mintable/bundled'
          }
        </p>
      </CardContent>
    </Card>
  );
};
