import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Copy, 
  Check, 
  ExternalLink, 
  Loader2, 
  Rocket, 
  GitBranch,
  Wallet,
  AlertTriangle,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MintedToken {
  mint: string;
  name?: string;
  symbol?: string;
  image?: string;
  createdAt?: string;
  marketCap?: number;
  launchpad?: string;
}

interface OffspringWallet {
  wallet: string;
  depth: number;
  fundingPath: string[];
  mintedTokens: MintedToken[];
  children: OffspringWallet[];
  fundedAmount?: number;
  fundedAt?: string;
}

interface ScanResult {
  parentWallet: string;
  totalOffspring: number;
  totalMinters: number;
  totalTokensMinted: number;
  offspringTree: OffspringWallet;
  allMintedTokens: MintedToken[];
  scanDuration: number;
}

export function SniffDashboard() {
  const [parentWallet, setParentWallet] = useState('');
  const [maxDepth, setMaxDepth] = useState(3);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [expandedWallets, setExpandedWallets] = useState<Set<string>>(new Set());

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const formatDate = (timestamp: string | number | undefined): string => {
    if (!timestamp) return 'Unknown';
    const date = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}/${date.getFullYear()}`;
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const toggleWalletExpanded = (wallet: string) => {
    setExpandedWallets(prev => {
      const next = new Set(prev);
      if (next.has(wallet)) {
        next.delete(wallet);
      } else {
        next.add(wallet);
      }
      return next;
    });
  };

  const runScan = async () => {
    if (!parentWallet.trim()) {
      toast.error('Please enter a wallet address');
      return;
    }

    setIsScanning(true);
    setScanResult(null);

    try {
      const startTime = Date.now();
      
      const { data, error } = await supabase.functions.invoke('offspring-mint-scanner', {
        body: {
          parentWallet: parentWallet.trim(),
          maxDepth,
          minAmountSol: 0.01
        }
      });

      if (error) throw error;

      const result: ScanResult = {
        ...data,
        scanDuration: (Date.now() - startTime) / 1000
      };

      // Fetch token metadata for all minted tokens
      if (result.allMintedTokens && result.allMintedTokens.length > 0) {
        const mints = result.allMintedTokens.map(t => t.mint);
        const { data: metadataData } = await supabase.functions.invoke('token-metadata-batch', {
          body: { mints }
        });

        if (metadataData?.tokens) {
          const metadataMap = new Map<string, MintedToken>(metadataData.tokens.map((t: MintedToken) => [t.mint, t]));
          result.allMintedTokens = result.allMintedTokens.map(t => {
            const metadata = metadataMap.get(t.mint);
            return metadata ? { ...t, ...metadata } : t;
          });
        }
      }

      setScanResult(result);
      
      // Auto-expand first level
      if (result.offspringTree) {
        setExpandedWallets(new Set([result.offspringTree.wallet]));
      }

      toast.success(`Scan complete! Found ${result.totalTokensMinted} tokens from ${result.totalMinters} minters`);
    } catch (error: any) {
      console.error('Scan error:', error);
      toast.error(error.message || 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const renderWalletNode = (node: OffspringWallet, isRoot = false): React.ReactNode => {
    const isExpanded = expandedWallets.has(node.wallet);
    const hasChildren = node.children && node.children.length > 0;
    const hasMints = node.mintedTokens && node.mintedTokens.length > 0;

    return (
      <div key={node.wallet} className={cn("relative", !isRoot && "ml-6 border-l-2 border-muted pl-4")}>
        <div className={cn(
          "p-3 rounded-lg mb-2",
          isRoot ? "bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30" :
          hasMints ? "bg-gradient-to-r from-green-500/20 to-green-500/10 border border-green-500/30" :
          "bg-muted/50 border border-border"
        )}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {(hasChildren || hasMints) && (
                <button onClick={() => toggleWalletExpanded(node.wallet)} className="p-1 hover:bg-background/50 rounded">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              )}
              <Wallet className={cn("h-4 w-4", isRoot ? "text-primary" : hasMints ? "text-green-500" : "text-muted-foreground")} />
              <code className="text-sm font-mono">{truncateAddress(node.wallet)}</code>
              <button onClick={() => copyToClipboard(node.wallet)} className="p-1 hover:bg-background/50 rounded">
                {copiedAddress === node.wallet ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
              </button>
              <a 
                href={`https://solscan.io/account/${node.wallet}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-1 hover:bg-background/50 rounded"
              >
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </a>
            </div>
            <div className="flex items-center gap-2">
              {isRoot && <Badge variant="outline" className="bg-primary/20">ROOT</Badge>}
              <Badge variant="outline">Depth {node.depth}</Badge>
              {hasMints && (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  <Rocket className="h-3 w-3 mr-1" />
                  {node.mintedTokens.length} Token{node.mintedTokens.length > 1 ? 's' : ''}
                </Badge>
              )}
              {hasChildren && (
                <Badge variant="outline" className="text-muted-foreground">
                  <GitBranch className="h-3 w-3 mr-1" />
                  {node.children.length} Children
                </Badge>
              )}
            </div>
          </div>

          {/* Minted tokens list */}
          {isExpanded && hasMints && (
            <div className="mt-3 space-y-2">
              {node.mintedTokens.map((token) => (
                <div key={token.mint} className="flex items-center justify-between p-2 bg-background/50 rounded-lg border border-border/50">
                  <div className="flex items-center gap-3">
                    {token.image ? (
                      <img src={token.image} alt={token.symbol || 'Token'} className="w-8 h-8 rounded-full" onError={(e) => e.currentTarget.style.display = 'none'} />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <Rocket className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">${token.symbol || 'Unknown'}</span>
                        {token.name && <span className="text-xs text-muted-foreground">{token.name}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <code>{truncateAddress(token.mint)}</code>
                        <button onClick={() => copyToClipboard(token.mint)} className="hover:text-foreground">
                          {copiedAddress === token.mint ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatDate(token.createdAt)}</span>
                    {token.marketCap && (
                      <Badge variant="outline" className="text-xs">
                        ${token.marketCap >= 1000 ? `${(token.marketCap / 1000).toFixed(1)}K` : token.marketCap.toFixed(0)}
                      </Badge>
                    )}
                    <a 
                      href={`https://pump.fun/coin/${token.mint}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 rounded bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-xs hover:from-green-500/30 hover:to-emerald-500/30 transition-colors"
                    >
                      <img src="/launchpad-logos/pumpfun.png" alt="pump.fun" className="w-4 h-4" />
                      pump.fun
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Children */}
        {isExpanded && hasChildren && (
          <div className="space-y-1">
            {node.children.map(child => renderWalletNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            🐕 SNIFF - Offspring Mint Scanner
          </CardTitle>
          <CardDescription>
            Trace wallet funding chains and discover all tokens minted by offspring wallets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Enter parent wallet address..."
              value={parentWallet}
              onChange={(e) => setParentWallet(e.target.value)}
              className="flex-1 font-mono"
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Depth:</span>
              <Input
                type="number"
                min={1}
                max={5}
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
                className="w-16"
              />
            </div>
            <Button onClick={runScan} disabled={isScanning} className="gap-2">
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Sniff
                </>
              )}
            </Button>
          </div>

          {isScanning && (
            <div className="p-4 bg-muted/50 rounded-lg animate-pulse">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <p className="font-medium">Scanning wallet tree...</p>
                  <p className="text-sm text-muted-foreground">This may take a minute for deep scans</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {scanResult && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{scanResult.totalOffspring}</div>
                <p className="text-sm text-muted-foreground">Offspring Wallets</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-500">{scanResult.totalMinters}</div>
                <p className="text-sm text-muted-foreground">Active Minters</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-orange-500">{scanResult.totalTokensMinted}</div>
                <p className="text-sm text-muted-foreground">Tokens Minted</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-500">{scanResult.scanDuration.toFixed(1)}s</div>
                <p className="text-sm text-muted-foreground">Scan Duration</p>
              </CardContent>
            </Card>
          </div>

          {/* All Minted Tokens Table */}
          {scanResult.allMintedTokens && scanResult.allMintedTokens.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-green-500" />
                  All Minted Tokens ({scanResult.allMintedTokens.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Token</th>
                        <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Mint Address</th>
                        <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Date</th>
                        <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Market Cap</th>
                        <th className="text-right py-2 px-3 text-sm font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanResult.allMintedTokens.map((token) => (
                        <tr key={token.mint} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              {token.image ? (
                                <img src={token.image} alt="" className="w-6 h-6 rounded-full" onError={(e) => e.currentTarget.style.display = 'none'} />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                                  <Rocket className="h-3 w-3" />
                                </div>
                              )}
                              <div>
                                <span className="font-semibold">${token.symbol || '???'}</span>
                                {token.name && <span className="text-xs text-muted-foreground ml-1">({token.name})</span>}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1">
                              <code className="text-xs">{truncateAddress(token.mint)}</code>
                              <button onClick={() => copyToClipboard(token.mint)} className="p-1 hover:bg-muted rounded">
                                {copiedAddress === token.mint ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-sm text-muted-foreground">
                            {formatDate(token.createdAt)}
                          </td>
                          <td className="py-3 px-3">
                            {token.marketCap ? (
                              <Badge variant="outline">
                                ${token.marketCap >= 1000000 
                                  ? `${(token.marketCap / 1000000).toFixed(2)}M` 
                                  : token.marketCap >= 1000 
                                    ? `${(token.marketCap / 1000).toFixed(1)}K` 
                                    : token.marketCap.toFixed(0)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <a 
                              href={`https://pump.fun/coin/${token.mint}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-xs hover:from-green-500/30 hover:to-emerald-500/30 transition-colors"
                            >
                              <img src="/launchpad-logos/pumpfun.png" alt="pump.fun" className="w-4 h-4" />
                              pump.fun
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Family Tree */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-primary" />
                Wallet Family Tree
              </CardTitle>
              <CardDescription>
                Click wallets to expand and see their offspring and minted tokens
              </CardDescription>
            </CardHeader>
            <CardContent>
              {scanResult.offspringTree && renderWalletNode(scanResult.offspringTree, true)}
            </CardContent>
          </Card>

          {/* Warning if no mints found */}
          {scanResult.totalTokensMinted === 0 && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <div>
                    <p className="font-medium">No tokens minted by offspring</p>
                    <p className="text-sm text-muted-foreground">
                      This wallet has {scanResult.totalOffspring} offspring but none have minted tokens.
                      Try increasing the scan depth or checking a different parent wallet.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
