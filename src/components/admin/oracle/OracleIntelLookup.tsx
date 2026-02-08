import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOracleLookup } from "@/hooks/useOracleLookup";
import { Search, AlertTriangle, CheckCircle, AlertCircle, Shield, Users, Coins, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";

const OracleIntelLookup = () => {
  const [query, setQuery] = useState("");
  const { lookup, result, isLoading, error, reset } = useOracleLookup();

  const handleLookup = () => {
    if (!query.trim()) {
      toast.error("Please enter a token address, wallet, or @X handle");
      return;
    }
    lookup(query.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLookup();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const getTrafficLightColor = (light: string) => {
    switch (light) {
      case 'RED': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'YELLOW': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'GREEN': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'BLUE': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getScoreColor = (score: number) => {
    if (score < 20) return 'text-red-500';
    if (score < 40) return 'text-orange-500';
    if (score < 60) return 'text-yellow-500';
    if (score < 80) return 'text-green-500';
    return 'text-blue-500';
  };

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Developer Intelligence Lookup
          </CardTitle>
          <CardDescription>
            Enter a token address, wallet address, or @X handle to get instant reputation data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="e.g., 8xK7...mN2p or @cryptodev123 or token mint..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
            />
            <Button onClick={handleLookup} disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Check Intel
                </>
              )}
            </Button>
            {result && (
              <Button variant="outline" onClick={() => { reset(); setQuery(""); }}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-5 w-5" />
              <span>Error: {error instanceof Error ? error.message : 'Unknown error'}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Display */}
      {result && (
        <div className="space-y-4">
          {/* Main Score Card */}
          <Card className={`border-2 ${getTrafficLightColor(result.trafficLight)}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge className={getTrafficLightColor(result.trafficLight)} variant="outline">
                    {result.trafficLight}
                  </Badge>
                  <CardTitle className="text-xl">
                    {result.profile?.displayName || `Dev ${result.resolvedWallet?.slice(0, 8)}...`}
                  </CardTitle>
                </div>
                <div className={`text-4xl font-bold ${getScoreColor(result.score)}`}>
                  {result.score}/100
                </div>
              </div>
              {result.resolvedWallet && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-mono">{result.resolvedWallet}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyToClipboard(result.resolvedWallet!)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <a 
                    href={`https://solscan.io/account/${result.resolvedWallet}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {/* Recommendation */}
              <div className="p-4 rounded-lg bg-background/50 border mb-6">
                <p className="text-lg">{result.recommendation}</p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{result.stats.totalTokens}</div>
                  <div className="text-xs text-muted-foreground">Total Tokens</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-500/10">
                  <div className="text-2xl font-bold text-green-500">{result.stats.successfulTokens}</div>
                  <div className="text-xs text-muted-foreground">Successful</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-500/10">
                  <div className="text-2xl font-bold text-red-500">{result.stats.rugPulls}</div>
                  <div className="text-xs text-muted-foreground">Rug Pulls</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-orange-500/10">
                  <div className="text-2xl font-bold text-orange-500">{result.stats.slowDrains}</div>
                  <div className="text-xs text-muted-foreground">Slow Drains</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{result.stats.failedTokens}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold">{result.stats.avgLifespanHours?.toFixed(0) || 'N/A'}</div>
                  <div className="text-xs text-muted-foreground">Avg Lifespan (hrs)</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status Cards */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Blacklist Status */}
            <Card className={result.blacklistStatus.isBlacklisted ? 'border-red-500/50' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  {result.blacklistStatus.isBlacklisted ? (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  Blacklist Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.blacklistStatus.isBlacklisted ? (
                  <div className="space-y-2">
                    <Badge variant="destructive">BLACKLISTED</Badge>
                    {result.blacklistStatus.reason && (
                      <p className="text-sm text-muted-foreground">{result.blacklistStatus.reason}</p>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-green-500">Not on blacklist</span>
                )}
              </CardContent>
            </Card>

            {/* Whitelist Status */}
            <Card className={result.whitelistStatus.isWhitelisted ? 'border-green-500/50' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Whitelist Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.whitelistStatus.isWhitelisted ? (
                  <div className="space-y-2">
                    <Badge className="bg-green-500/20 text-green-500 border-green-500/50">WHITELISTED</Badge>
                    {result.whitelistStatus.reason && (
                      <p className="text-sm text-muted-foreground">{result.whitelistStatus.reason}</p>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Not on whitelist</span>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Network Associations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Network Associations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.network.devTeam && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Dev Team</span>
                  <Badge variant="secondary">{result.network.devTeam.name}</Badge>
                </div>
              )}

              {result.network.linkedXAccounts.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Linked X Accounts</span>
                  <div className="flex flex-wrap gap-2">
                    {result.network.linkedXAccounts.map((handle, i) => (
                      <Badge key={i} variant="outline">@{handle}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {result.network.sharedMods.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Shared Mods</span>
                  <div className="flex flex-wrap gap-2">
                    {result.network.sharedMods.slice(0, 10).map((mod, i) => (
                      <Badge key={i} variant="outline" className="text-xs">@{mod}</Badge>
                    ))}
                    {result.network.sharedMods.length > 10 && (
                      <Badge variant="secondary">+{result.network.sharedMods.length - 10} more</Badge>
                    )}
                  </div>
                </div>
              )}

              {result.network.relatedTokens.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Related Tokens</span>
                  <div className="flex flex-wrap gap-2">
                    {result.network.relatedTokens.slice(0, 10).map((token, i) => (
                      <Badge key={i} variant="outline" className="font-mono text-xs">{token}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {result.network.linkedWallets.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Linked Wallets</span>
                  <div className="flex flex-wrap gap-2">
                    {result.network.linkedWallets.slice(0, 5).map((wallet, i) => (
                      <Badge key={i} variant="outline" className="font-mono text-xs">
                        {wallet.slice(0, 8)}...{wallet.slice(-4)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {result.meshLinksAdded > 0 && (
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  +{result.meshLinksAdded} new mesh links discovered
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {!result && !isLoading && !error && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Enter a query to get started</h3>
            <p className="text-muted-foreground text-sm">
              Lookup developer reputation by token address, wallet, or X handle
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OracleIntelLookup;
