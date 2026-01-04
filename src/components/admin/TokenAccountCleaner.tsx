import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Flame, Search, Trash2, Loader2, RefreshCw, ExternalLink } from "lucide-react";

interface ScanResult {
  walletPubkey: string;
  source: string;
  emptyAccountCount: number;
  estimatedRecoverySol: number;
  accounts: { mint: string; programId: string }[];
}

interface CleanResult {
  walletPubkey: string;
  source: string;
  accountsClosed: number;
  solRecovered: number;
  signatures: string[];
  errors: string[];
}

interface ScanResponse {
  action: string;
  walletsScanned: number;
  walletsWithEmptyAccounts: number;
  totalEmptyAccounts: number;
  totalRecoverableSol: number;
  results: ScanResult[];
}

interface CleanResponse {
  action: string;
  walletsProcessed: number;
  totalAccountsClosed: number;
  totalSolRecovered: number;
  consolidation?: {
    targetWallet: string;
    walletsConsolidated: number;
    totalConsolidated: number;
    signatures: string[];
    errors: string[];
  } | null;
  results: CleanResult[];
}

export function TokenAccountCleaner() {
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResponse | null>(null);
  const [cleanResults, setCleanResults] = useState<CleanResponse | null>(null);

  const handleScan = async () => {
    setIsScanning(true);
    setScanResults(null);
    setCleanResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('token-account-cleaner', {
        body: { action: 'scan' }
      });

      if (error) throw error;
      
      setScanResults(data as ScanResponse);
      
      if (data.totalEmptyAccounts > 0) {
        toast.success(`Found ${data.totalEmptyAccounts} empty accounts worth ~${data.totalRecoverableSol.toFixed(4)} SOL`);
      } else {
        toast.info("No empty token accounts found");
      }
    } catch (err: any) {
      console.error("Scan error:", err);
      toast.error(err.message || "Failed to scan wallets");
    } finally {
      setIsScanning(false);
    }
  };

  const handleClean = async () => {
    if (!scanResults || scanResults.totalEmptyAccounts === 0) {
      toast.error("Please scan first to find empty accounts");
      return;
    }

    setIsCleaning(true);
    setCleanResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('token-account-cleaner', {
        body: { action: 'clean_all' }
      });

      if (error) throw error;
      
      setCleanResults(data as CleanResponse);
      setScanResults(null); // Clear scan results after cleaning
      
      if (data.totalAccountsClosed > 0) {
        toast.success(`Reclaimed ${data.totalSolRecovered.toFixed(4)} SOL from ${data.totalAccountsClosed} accounts!`);
      } else {
        toast.info("No accounts were closed");
      }
    } catch (err: any) {
      console.error("Clean error:", err);
      toast.error(err.message || "Failed to clean accounts");
    } finally {
      setIsCleaning(false);
    }
  };

  const shortenAddress = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Flame className="h-6 w-6 text-orange-500" />
            <div>
              <CardTitle>Token Account Rent Reclaimer</CardTitle>
              <CardDescription>
                Reclaim SOL from empty token accounts (~0.002 SOL each)
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleScan}
              disabled={isScanning || isCleaning}
              variant="outline"
            >
              {isScanning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Scan All Wallets
            </Button>
            <Button
              onClick={handleClean}
              disabled={isCleaning || isScanning || !scanResults || scanResults.totalEmptyAccounts === 0}
              variant="default"
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isCleaning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Reclaim Rent
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        {scanResults && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{scanResults.walletsScanned}</div>
              <div className="text-xs text-muted-foreground">Wallets Scanned</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{scanResults.walletsWithEmptyAccounts}</div>
              <div className="text-xs text-muted-foreground">With Empty Accounts</div>
            </div>
            <div className="bg-orange-500/10 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-500">{scanResults.totalEmptyAccounts}</div>
              <div className="text-xs text-muted-foreground">Total Empty Accounts</div>
            </div>
            <div className="bg-green-500/10 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-500">
                {scanResults.totalRecoverableSol.toFixed(4)} SOL
              </div>
              <div className="text-xs text-muted-foreground">Recoverable</div>
            </div>
          </div>
        )}

        {/* Clean Results */}
        {cleanResults && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold">{cleanResults.walletsProcessed}</div>
                <div className="text-xs text-muted-foreground">Wallets Processed</div>
              </div>
              <div className="bg-orange-500/10 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-orange-500">{cleanResults.totalAccountsClosed}</div>
                <div className="text-xs text-muted-foreground">Accounts Closed</div>
              </div>
              <div className="bg-green-500/10 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-500">
                  {cleanResults.totalSolRecovered.toFixed(4)} SOL
                </div>
                <div className="text-xs text-muted-foreground">Recovered</div>
              </div>
              {cleanResults.consolidation && (
                <div className="bg-amber-500/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-amber-500">
                    {cleanResults.consolidation.totalConsolidated.toFixed(4)} SOL
                  </div>
                  <div className="text-xs text-muted-foreground">→ FlipIt Wallet</div>
                </div>
              )}
            </div>

            {/* Consolidation Summary */}
            {cleanResults.consolidation && cleanResults.consolidation.totalConsolidated > 0 && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-amber-500" />
                    <span className="font-medium">Consolidated to FlipIt Wallet</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <code className="text-xs bg-background/50 px-2 py-1 rounded">
                      {shortenAddress(cleanResults.consolidation.targetWallet)}
                    </code>
                    <span className="text-amber-500 font-bold">
                      +{cleanResults.consolidation.totalConsolidated.toFixed(4)} SOL
                    </span>
                    {cleanResults.consolidation.signatures.length > 0 && (
                      <a
                        href={`https://solscan.io/tx/${cleanResults.consolidation.signatures[0]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Per-wallet results */}
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {cleanResults.results.filter(r => r.accountsClosed > 0 || r.errors.length > 0).map((result, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">
                        {result.source}
                      </Badge>
                      <code className="text-xs">{shortenAddress(result.walletPubkey)}</code>
                    </div>
                    <div className="flex items-center gap-3">
                      {result.accountsClosed > 0 && (
                        <span className="text-green-500 text-sm">
                          +{result.solRecovered.toFixed(4)} SOL ({result.accountsClosed} accounts)
                        </span>
                      )}
                      {result.errors.length > 0 && (
                        <span className="text-destructive text-xs">
                          {result.errors.length} errors
                        </span>
                      )}
                      {result.signatures.length > 0 && (
                        <a
                          href={`https://solscan.io/tx/${result.signatures[0]}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Scan Results Detail */}
        {scanResults && scanResults.results.length > 0 && !cleanResults && (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {scanResults.results.map((result, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {result.source}
                    </Badge>
                    <code className="text-xs">{shortenAddress(result.walletPubkey)}</code>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-orange-500 text-sm">
                      {result.emptyAccountCount} empty
                    </span>
                    <span className="text-green-500 text-sm">
                      ~{result.estimatedRecoverySol.toFixed(4)} SOL
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Empty state */}
        {!scanResults && !cleanResults && (
          <div className="text-center py-8 text-muted-foreground">
            <Flame className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>Click "Scan All Wallets" to find empty token accounts</p>
            <p className="text-xs mt-2">Each empty account holds ~0.002 SOL in rent that can be reclaimed</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
