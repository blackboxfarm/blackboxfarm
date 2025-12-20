import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, Eye, Trash2, ExternalLink, AlertTriangle, Clock, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { CronStatusPanel } from "./CronStatusPanel";

interface MintMonitorWallet {
  id: string;
  wallet_address: string;
  label: string | null;
  source_token: string | null;
  is_cron_enabled: boolean;
  last_scanned_at: string | null;
  created_at: string;
}

interface MintDetection {
  id: string;
  wallet_id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  detected_at: string;
}

export const WatchdogWalletsList = () => {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<MintMonitorWallet[]>([]);
  const [detections, setDetections] = useState<Record<string, MintDetection[]>>({});
  const [loading, setLoading] = useState(true);
  const [scanningWallet, setScanningWallet] = useState<string | null>(null);
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);

  const fetchWallets = async () => {
    if (!user?.id) {
      setWallets([]);
      setDetections({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch wallets for current user
      const { data: walletsData, error: walletsError } = await supabase
        .from('mint_monitor_wallets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (walletsError) throw walletsError;
      setWallets(walletsData || []);

      // Fetch detections for all wallets
      if (walletsData && walletsData.length > 0) {
        const walletIds = walletsData.map(w => w.id);
        const { data: detectionsData, error: detectionsError } = await supabase
          .from('mint_monitor_detections')
          .select('*')
          .in('wallet_id', walletIds)
          .order('detected_at', { ascending: false });

        if (detectionsError) throw detectionsError;

        // Group detections by wallet_id
        const grouped: Record<string, MintDetection[]> = {};
        (detectionsData || []).forEach(d => {
          if (!grouped[d.wallet_id]) grouped[d.wallet_id] = [];
          grouped[d.wallet_id].push(d);
        });
        setDetections(grouped);
      } else {
        setDetections({});
      }
    } catch (err: any) {
      toast.error("Failed to load watchdog wallets: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    fetchWallets();
  }, [user?.id]);

  useEffect(() => {
    const handler = () => fetchWallets();
    window.addEventListener('mint-monitor-wallets-changed', handler);
    return () => window.removeEventListener('mint-monitor-wallets-changed', handler);
  }, [user?.id]);

  const manualScan = async (walletAddress: string, walletId: string) => {
    setScanningWallet(walletId);
    try {
      const { data, error } = await supabase.functions.invoke('mint-monitor-scanner', {
        body: { action: 'scan_now', walletAddress, userId: user?.id }
      });

      if (error) throw error;

      const mintsFound = data.results?.length || 0;
      if (mintsFound > 0) {
        toast.success(`Found ${mintsFound} new token(s)!`);
        fetchWallets(); // Refresh to show new detections
      } else {
        toast.info("No new mints detected");
      }
    } catch (err: any) {
      toast.error("Scan failed: " + err.message);
    } finally {
      setScanningWallet(null);
    }
  };

  const toggleCron = async (walletId: string, currentlyEnabled: boolean) => {
    try {
      const { error } = await supabase
        .from('mint_monitor_wallets')
        .update({ is_cron_enabled: !currentlyEnabled, updated_at: new Date().toISOString() })
        .eq('id', walletId);

      if (error) throw error;

      toast.success(currentlyEnabled ? "Cron monitoring disabled" : "Cron monitoring enabled");
      fetchWallets();
    } catch (err: any) {
      toast.error("Failed to update: " + err.message);
    }
  };

  const removeWallet = async (walletId: string) => {
    try {
      // First delete associated detections
      await supabase.from('mint_monitor_detections').delete().eq('wallet_id', walletId);
      
      // Then delete the wallet
      const { error } = await supabase.from('mint_monitor_wallets').delete().eq('id', walletId);
      if (error) throw error;

      toast.success("Wallet removed from watchdog");
      fetchWallets();
    } catch (err: any) {
      toast.error("Failed to remove: " + err.message);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (wallets.length === 0) {
    return (
      <div className="space-y-4">
        <CronStatusPanel />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Watchdog Wallets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p>No wallets in watchdog yet.</p>
              <p className="text-sm">Click "Add to Watchdog" on a spawner candidate to start monitoring.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalDetections = Object.values(detections).flat().length;
  const activeWallets = wallets.filter(w => w.is_cron_enabled).length;

  return (
    <div className="space-y-4">
      {/* Cron Status Panel */}
      <CronStatusPanel />
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-blue-500" />
            Watchdog Wallets
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{wallets.length} wallets</Badge>
            <Badge variant="secondary" className="bg-green-500/20 text-green-300">
              {activeWallets} active
            </Badge>
            <Badge variant="secondary" className="bg-purple-500/20 text-purple-300">
              {totalDetections} detections
            </Badge>
            <Button variant="outline" size="sm" onClick={fetchWallets}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
      <CardContent className="space-y-3">
        {wallets.map((wallet) => {
          const walletDetections = detections[wallet.id] || [];
          const isExpanded = expandedWallet === wallet.id;

          return (
            <div 
              key={wallet.id} 
              className={`p-3 rounded-lg border transition-all ${
                wallet.is_cron_enabled 
                  ? 'bg-green-500/5 border-green-500/30' 
                  : 'bg-muted/50 border-border'
              }`}
            >
              {/* Header Row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant={wallet.is_cron_enabled ? "default" : "secondary"} className="text-[10px]">
                    {wallet.is_cron_enabled ? '🟢 Active' : '⏸ Paused'}
                  </Badge>
                  {walletDetections.length > 0 && (
                    <Badge className="bg-purple-500/20 text-purple-300 text-[10px]">
                      {walletDetections.length} mints detected
                    </Badge>
                  )}
                  {wallet.label && (
                    <span className="text-xs text-muted-foreground">{wallet.label}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => manualScan(wallet.wallet_address, wallet.id)}
                    disabled={scanningWallet === wallet.id}
                  >
                    {scanningWallet === wallet.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => toggleCron(wallet.id, wallet.is_cron_enabled)}
                  >
                    {wallet.is_cron_enabled ? '⏸' : '▶️'}
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => removeWallet(wallet.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Wallet Address */}
              <a 
                href={`https://solscan.io/account/${wallet.wallet_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-primary hover:underline block mb-2"
              >
                {wallet.wallet_address}
              </a>

              {/* Last Scanned */}
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-2">
                <Clock className="h-3 w-3" />
                Last scanned: {formatDate(wallet.last_scanned_at)}
              </div>

              {/* Detections - Collapsible */}
              {walletDetections.length > 0 && (
                <div className="mt-2 pt-2 border-t border-green-500/20">
                  <button 
                    onClick={() => setExpandedWallet(isExpanded ? null : wallet.id)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {isExpanded ? '▼' : '▶'} View {walletDetections.length} detected mints
                  </button>
                  
                  {isExpanded && (
                    <div className="mt-2 space-y-1 max-h-[200px] overflow-y-auto">
                      {walletDetections.map((detection) => (
                        <div 
                          key={detection.id}
                          className="flex items-center justify-between p-2 bg-background/50 rounded text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-purple-400">
                              ${detection.token_symbol || 'Unknown'}
                            </span>
                            <span className="text-muted-foreground truncate max-w-[200px]">
                              {detection.token_name || detection.token_mint.slice(0, 16) + '...'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {formatDate(detection.detected_at)}
                            </span>
                            <a
                              href={`https://dexscreener.com/solana/${detection.token_mint}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
      </Card>
    </div>
  );
};
