import React, { useState, useEffect } from "react";
import { Search, Shield, AlertTriangle, CheckCircle, XCircle, Loader2, ExternalLink, Users, Coins, Network } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface OracleResult {
  found: boolean;
  inputType: 'token' | 'wallet' | 'x_account' | 'unknown';
  resolvedWallet?: string;
  profile?: {
    id: string;
    displayName: string;
    masterWallet: string;
    kycVerified: boolean;
    tags: string[];
  };
  score: number;
  trafficLight: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE' | 'UNKNOWN';
  stats: {
    totalTokens: number;
    successfulTokens: number;
    failedTokens: number;
    rugPulls: number;
    slowDrains: number;
    avgLifespanHours: number;
  };
  network: {
    linkedWallets: string[];
    linkedXAccounts: string[];
    sharedMods: string[];
    relatedTokens: string[];
    devTeam?: { id: string; name: string };
  };
  blacklistStatus: {
    isBlacklisted: boolean;
    reason?: string;
    linkedEntities?: string[];
  };
  whitelistStatus: {
    isWhitelisted: boolean;
    reason?: string;
  };
  recommendation: string;
  meshLinksAdded: number;
}

const getTrafficLightColor = (light: string) => {
  switch (light) {
    case 'RED': return 'bg-red-500/20 text-red-400 border-red-500/50';
    case 'YELLOW': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    case 'GREEN': return 'bg-green-500/20 text-green-400 border-green-500/50';
    case 'BLUE': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    default: return 'bg-muted text-muted-foreground border-muted';
  }
};

const getTrafficLightBorder = (light: string) => {
  switch (light) {
    case 'RED': return 'border-red-500/50';
    case 'YELLOW': return 'border-yellow-500/50';
    case 'GREEN': return 'border-green-500/50';
    case 'BLUE': return 'border-blue-500/50';
    default: return 'border-border';
  }
};

const Oracle = () => {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<OracleResult | null>(null);
  const { toast } = useToast();

  const handleLookup = async () => {
    if (!query.trim()) {
      toast({
        title: "Input Required",
        description: "Please enter a token address, wallet, or @X handle",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('oracle-unified-lookup', {
        body: { input: query.trim() }
      });

      if (error) throw error;
      setResult(data);
    } catch (err: any) {
      toast({
        title: "Lookup Failed",
        description: err.message || "Failed to perform lookup",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLookup();
    }
  };

  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  useEffect(() => {
    document.title = "Oracle - Developer Reputation Lookup | BlackBox";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950/30 via-background to-purple-950/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-500/10 via-transparent to-transparent" />
        
        <div className="relative container mx-auto px-4 py-16 md:py-24">
          <div className="text-center space-y-6 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm">
              <Shield className="w-4 h-4" />
              Developer Reputation Engine
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
              🔮 Oracle
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Check developer reputation before you invest. Enter any token, wallet, or @X handle to get instant intel.
            </p>

            {/* Search Box */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto mt-8">
              <Input
                placeholder="Token address, wallet, or @X handle..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 h-12 bg-background/50 border-violet-500/30 focus:border-violet-500 text-lg"
              />
              <Button 
                onClick={handleLookup} 
                disabled={isLoading}
                className="h-12 px-8 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Search className="w-5 h-5 mr-2" />
                    Check Intel
                  </>
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Examples: <span className="text-violet-400 cursor-pointer" onClick={() => setQuery("@elonmusk")}>@elonmusk</span> • 
              <span className="text-violet-400 cursor-pointer ml-1" onClick={() => setQuery("7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr")}>7GCihgDB...W2hr</span>
            </p>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="container mx-auto px-4 pb-16">
        {result && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Main Result Card */}
            <Card className={`border-2 ${getTrafficLightBorder(result.trafficLight)} bg-gradient-to-br from-background to-muted/20`}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className={`text-lg px-4 py-1 ${getTrafficLightColor(result.trafficLight)}`}>
                    {result.trafficLight === 'RED' && '🔴'}
                    {result.trafficLight === 'YELLOW' && '🟡'}
                    {result.trafficLight === 'GREEN' && '🟢'}
                    {result.trafficLight === 'BLUE' && '🔵'}
                    {result.trafficLight === 'UNKNOWN' && '⚪'}
                    {' '}{result.trafficLight}
                  </Badge>
                  <Badge variant="outline" className="text-muted-foreground">
                    Score: {result.score}/100
                  </Badge>
                  <Badge variant="outline" className="text-muted-foreground">
                    {result.inputType.replace('_', ' ').toUpperCase()}
                  </Badge>
                  {result.blacklistStatus.isBlacklisted && (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
                      <XCircle className="w-3 h-3 mr-1" />
                      BLACKLISTED
                    </Badge>
                  )}
                  {result.whitelistStatus.isWhitelisted && (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      WHITELISTED
                    </Badge>
                  )}
                </div>
                {result.profile && (
                  <CardTitle className="text-2xl mt-2">
                    {result.profile.displayName}
                    {result.profile.kycVerified && (
                      <Badge className="ml-2 bg-blue-500/20 text-blue-400">✓ KYC</Badge>
                    )}
                  </CardTitle>
                )}
                {result.resolvedWallet && (
                  <CardDescription className="font-mono text-sm">
                    Wallet: {result.resolvedWallet}
                    <a 
                      href={`https://solscan.io/account/${result.resolvedWallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 inline-flex items-center text-violet-400 hover:text-violet-300"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Recommendation */}
                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <p className="text-lg">{result.recommendation}</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <div className="text-2xl font-bold">{result.stats.totalTokens}</div>
                    <div className="text-xs text-muted-foreground">Total Tokens</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-green-500/10">
                    <div className="text-2xl font-bold text-green-400">{result.stats.successfulTokens}</div>
                    <div className="text-xs text-muted-foreground">Successes</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-yellow-500/10">
                    <div className="text-2xl font-bold text-yellow-400">{result.stats.failedTokens}</div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-500/10">
                    <div className="text-2xl font-bold text-red-400">{result.stats.rugPulls}</div>
                    <div className="text-xs text-muted-foreground">Rug Pulls</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-orange-500/10">
                    <div className="text-2xl font-bold text-orange-400">{result.stats.slowDrains}</div>
                    <div className="text-xs text-muted-foreground">Slow Drains</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <div className="text-2xl font-bold">{result.stats.avgLifespanHours?.toFixed(0) || 'N/A'}h</div>
                    <div className="text-xs text-muted-foreground">Avg Lifespan</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Network Associations */}
            {(result.network.linkedWallets.length > 0 || 
              result.network.linkedXAccounts.length > 0 || 
              result.network.relatedTokens.length > 0 ||
              result.network.sharedMods.length > 0) && (
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="w-5 h-5 text-violet-400" />
                    Network Associations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {result.network.devTeam && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                        <Users className="w-4 h-4" /> Dev Team
                      </h4>
                      <Badge variant="outline">{result.network.devTeam.name}</Badge>
                    </div>
                  )}
                  
                  {result.network.linkedWallets.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">Linked Wallets</h4>
                      <div className="flex flex-wrap gap-2">
                        {result.network.linkedWallets.map((wallet, i) => (
                          <Badge key={i} variant="outline" className="font-mono text-xs">
                            {truncateAddress(wallet)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {result.network.linkedXAccounts.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">X Accounts</h4>
                      <div className="flex flex-wrap gap-2">
                        {result.network.linkedXAccounts.map((handle, i) => (
                          <Badge key={i} variant="outline" className="text-violet-400">
                            @{handle}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {result.network.relatedTokens.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                        <Coins className="w-4 h-4" /> Related Tokens
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {result.network.relatedTokens.map((token, i) => (
                          <Badge key={i} variant="secondary">{token}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.network.sharedMods.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">Shared Moderators</h4>
                      <div className="flex flex-wrap gap-2">
                        {result.network.sharedMods.map((mod, i) => (
                          <Badge key={i} variant="outline" className="text-yellow-400">
                            @{mod}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Blacklist/Whitelist Details */}
            {(result.blacklistStatus.isBlacklisted || result.whitelistStatus.isWhitelisted) && (
              <Card className={`border ${result.blacklistStatus.isBlacklisted ? 'border-red-500/50' : 'border-green-500/50'}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {result.blacklistStatus.isBlacklisted ? (
                      <>
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                        Blacklist Entry
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        Whitelist Entry
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {result.blacklistStatus.isBlacklisted && result.blacklistStatus.reason && (
                    <p className="text-red-400">{result.blacklistStatus.reason}</p>
                  )}
                  {result.whitelistStatus.isWhitelisted && result.whitelistStatus.reason && (
                    <p className="text-green-400">{result.whitelistStatus.reason}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* No Data Found */}
            {!result.found && (
              <Card className="border-border/50">
                <CardContent className="py-8 text-center">
                  <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium">No Reputation Data Found</h3>
                  <p className="text-muted-foreground mt-2">
                    This entity has no recorded history in our system. This could mean they're new or haven't been tracked yet.
                  </p>
                  <p className="text-sm text-yellow-400 mt-4">
                    ⚠️ Proceed with caution - unknown developers carry higher risk
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Info Section when no result */}
        {!result && !isLoading && (
          <div className="max-w-4xl mx-auto mt-8">
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="border-border/50 bg-gradient-to-br from-background to-muted/10">
                <CardContent className="pt-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                    <XCircle className="w-6 h-6 text-red-400" />
                  </div>
                  <h3 className="font-semibold">Rug Detection</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Identifies serial ruggers and slow drain scammers across multiple tokens
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-gradient-to-br from-background to-muted/10">
                <CardContent className="pt-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
                    <Network className="w-6 h-6 text-violet-400" />
                  </div>
                  <h3 className="font-semibold">Network Mapping</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Traces connections between wallets, X accounts, and token communities
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-gradient-to-br from-background to-muted/10">
                <CardContent className="pt-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-6 h-6 text-green-400" />
                  </div>
                  <h3 className="font-semibold">Verified Builders</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Highlights trusted developers with consistent track records
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Oracle;
