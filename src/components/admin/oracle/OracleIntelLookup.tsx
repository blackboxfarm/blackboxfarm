import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOracleLookup } from "@/hooks/useOracleLookup";
import { Search, AlertTriangle, CheckCircle, AlertCircle, Shield, Users, Coins, ExternalLink, Copy, Zap, Scan, Eye, ArrowDown, ArrowUp, Minus, Link2, GitBranch } from "lucide-react";
import { toast } from "sonner";

interface OracleIntelLookupProps {
  initialQuery?: string;
}

const solscanLink = (address: string) => `https://solscan.io/account/${address}`;
const isWalletAddress = (id: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id);

const OracleIntelLookup = ({ initialQuery }: OracleIntelLookupProps) => {
  const [query, setQuery] = useState(initialQuery || "");
  const { lookup, result, isLoading, error, reset } = useOracleLookup();

  // Auto-trigger lookup when initialQuery is provided
  React.useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      lookup(initialQuery.trim());
    }
  }, [initialQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLookup = (scanMode?: 'deep' | 'quick' | 'spider') => {
    if (!query.trim()) {
      toast.error("Please enter a token address, wallet, or @X handle");
      return;
    }
    lookup(query.trim(), scanMode);
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
      case 'UNKNOWN': return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
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

  const getPatternBadge = (pattern: string) => {
    switch (pattern) {
      case 'serial_spammer':
        return <Badge variant="destructive">🚨 Serial Spammer</Badge>;
      case 'fee_farmer':
        return <Badge variant="destructive">💸 Fee Farmer</Badge>;
      case 'test_launcher':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">🧪 Test Launcher</Badge>;
      case 'legitimate_builder':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50">✅ Legitimate Builder</Badge>;
      case 'mixed_track_record':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/50">📊 Mixed Record</Badge>;
      case 'low_success_newcomer':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50">⚠️ Low Success Dev</Badge>;
      case 'moderate_launcher':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/50">🔄 Moderate Launcher</Badge>;
      case 'unknown':
        return <Badge className="bg-muted text-muted-foreground border-border">🆕 Not Yet Profiled</Badge>;
      default:
        return null;
    }
  };

  const getOutcomeBadge = (outcome: string) => {
    switch (outcome) {
      case 'graduated': return <Badge className="bg-green-500/20 text-green-400 border-green-500/50 text-[10px]">Graduated</Badge>;
      case 'success': return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50 text-[10px]">Success</Badge>;
      case 'failed': return <Badge variant="destructive" className="text-[10px]">Failed</Badge>;
      case 'rug_pull': return <Badge variant="destructive" className="text-[10px]">🚨 Rug Pull</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">{outcome}</Badge>;
    }
  };

  const getRelationshipLabel = (rel: string) => {
    switch (rel) {
      case 'funded_by': return '💰 Funded By';
      case 'same_kyc_root': return '🔗 Same KYC Root';
      case 'directly_funded': return '💸 Directly Funded';
      case 'satellite_of': return '🛰️ Satellite Of';
      case 'created': return '🪙 Created';
      case 'co_mod': return '👥 Co-Mod';
      case 'linked': return '🔗 Linked';
      case 'same_team': return '👥 Same Team';
      default: return rel.replace(/_/g, ' ');
    }
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
            <Button onClick={() => handleLookup()} disabled={isLoading}>
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

      {/* Scan Required - Developer not in database */}
      {result && result.requiresScan && (
        <Card className="border-2 border-purple-500/50 bg-purple-500/10">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/50">
                  UNKNOWN DEVELOPER
                </Badge>
                <CardTitle className="text-xl">
                  Developer Found on Pump.fun
                </CardTitle>
              </div>
            </div>
            {result.resolvedWallet && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono">{result.resolvedWallet}</span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyToClipboard(result.resolvedWallet!)}>
                  <Copy className="h-3 w-3" />
                </Button>
                <a 
                  href={`https://pump.fun/profile/${result.resolvedWallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Quick Stats from Live Check */}
            {result.liveAnalysis && (
              <div className="p-4 rounded-lg bg-background/50 border">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-yellow-400" />
                  <span className="font-semibold">Quick Analysis (Live from Pump.fun)</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{result.liveAnalysis.tokensAnalyzed}</div>
                    <div className="text-xs text-muted-foreground">Total Tokens</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-500">{result.liveAnalysis.graduatedTokens}</div>
                    <div className="text-xs text-muted-foreground">Graduated</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{result.liveAnalysis.successRate.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">Success Rate</div>
                  </div>
                  <div className="text-center">
                    {getPatternBadge(result.liveAnalysis.pattern)}
                    <div className="text-xs text-muted-foreground mt-1">Pattern</div>
                  </div>
                </div>
              </div>
            )}

            {/* Recommendation */}
            <div className="p-4 rounded-lg bg-background/50 border border-yellow-500/30">
              <p className="text-lg">{result.recommendation}</p>
            </div>

            {/* Scan Options */}
            <div className="space-y-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Scan className="h-4 w-4" />
                Add to Database & Get Full Analysis
              </h4>
              <div className="grid md:grid-cols-3 gap-3">
                <Button 
                  onClick={() => handleLookup('deep')} 
                  disabled={isLoading}
                  className="h-auto py-4 flex flex-col items-center gap-2 bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  <Scan className="h-6 w-6" />
                  <span className="font-semibold">🔥 Deep Scan</span>
                  <span className="text-xs opacity-80">Full analysis - ATH, rug signals, patterns</span>
                  <span className="text-xs opacity-60">30-120s for prolific devs</span>
                </Button>
                
                <Button 
                  onClick={() => handleLookup('quick')} 
                  disabled={isLoading}
                  variant="secondary"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                >
                  <Zap className="h-6 w-6" />
                  <span className="font-semibold">⚡ Quick Check</span>
                  <span className="text-xs opacity-80">Basic stats & pattern detection</span>
                  <span className="text-xs opacity-60">5-15s</span>
                </Button>
                
                <Button 
                  onClick={() => handleLookup('spider')} 
                  disabled={isLoading}
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                >
                  <Eye className="h-6 w-6" />
                  <span className="font-semibold">🕸️ Spider Only</span>
                  <span className="text-xs opacity-80">Just add to database</span>
                  <span className="text-xs opacity-60">Instant</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Display - Full Data */}
      {result && !result.requiresScan && (
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
                  {result.liveAnalysis && getPatternBadge(result.liveAnalysis.pattern)}
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

              {/* Score Breakdown */}
              {result.scoreBreakdown && (
                <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border/50">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Coins className="h-4 w-4" />
                    Score Breakdown — Why {result.score}/100?
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded bg-background/50">
                      <span className="text-muted-foreground">Base Score</span>
                      <span className="font-mono font-bold">{result.scoreBreakdown.base}</span>
                    </div>
                    {result.scoreBreakdown.rugPullPenalty !== 0 && (
                      <div className="flex items-center justify-between p-2 rounded bg-red-500/10">
                        <span className="text-red-400 flex items-center gap-1"><ArrowDown className="h-3 w-3" />Rug Pulls</span>
                        <span className="font-mono font-bold text-red-400">{result.scoreBreakdown.rugPullPenalty}</span>
                      </div>
                    )}
                    {result.scoreBreakdown.slowDrainPenalty !== 0 && (
                      <div className="flex items-center justify-between p-2 rounded bg-red-500/10">
                        <span className="text-red-400 flex items-center gap-1"><ArrowDown className="h-3 w-3" />Slow Drains</span>
                        <span className="font-mono font-bold text-red-400">{result.scoreBreakdown.slowDrainPenalty}</span>
                      </div>
                    )}
                    {result.scoreBreakdown.failedTokenPenalty !== 0 && (
                      <div className="flex items-center justify-between p-2 rounded bg-orange-500/10">
                        <span className="text-orange-400 flex items-center gap-1"><ArrowDown className="h-3 w-3" />Failed Tokens</span>
                        <span className="font-mono font-bold text-orange-400">{result.scoreBreakdown.failedTokenPenalty}</span>
                      </div>
                    )}
                    {result.scoreBreakdown.lowLifespanPenalty !== 0 && (
                      <div className="flex items-center justify-between p-2 rounded bg-orange-500/10">
                        <span className="text-orange-400 flex items-center gap-1"><ArrowDown className="h-3 w-3" />Low Lifespan</span>
                        <span className="font-mono font-bold text-orange-400">{result.scoreBreakdown.lowLifespanPenalty}</span>
                      </div>
                    )}
                    {result.scoreBreakdown.blacklistPenalty !== 0 && (
                      <div className="flex items-center justify-between p-2 rounded bg-red-500/10">
                        <span className="text-red-400 flex items-center gap-1"><ArrowDown className="h-3 w-3" />Blacklisted</span>
                        <span className="font-mono font-bold text-red-400">{result.scoreBreakdown.blacklistPenalty}</span>
                      </div>
                    )}
                    {result.scoreBreakdown.successBonus > 0 && (
                      <div className="flex items-center justify-between p-2 rounded bg-green-500/10">
                        <span className="text-green-400 flex items-center gap-1"><ArrowUp className="h-3 w-3" />Successes</span>
                        <span className="font-mono font-bold text-green-400">+{result.scoreBreakdown.successBonus}</span>
                      </div>
                    )}
                    {result.scoreBreakdown.whitelistBonus > 0 && (
                      <div className="flex items-center justify-between p-2 rounded bg-green-500/10">
                        <span className="text-green-400 flex items-center gap-1"><ArrowUp className="h-3 w-3" />Whitelisted</span>
                        <span className="font-mono font-bold text-green-400">+{result.scoreBreakdown.whitelistBonus}</span>
                      </div>
                    )}
                    {result.scoreBreakdown.consistencyBonus > 0 && (
                      <div className="flex items-center justify-between p-2 rounded bg-green-500/10">
                        <span className="text-green-400 flex items-center gap-1"><ArrowUp className="h-3 w-3" />Consistency</span>
                        <span className="font-mono font-bold text-green-400">+{result.scoreBreakdown.consistencyBonus}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between p-2 rounded bg-background/80 border col-span-full md:col-span-1">
                      <span className="font-semibold">= Final Score</span>
                      <span className={`font-mono font-bold text-lg ${getScoreColor(result.scoreBreakdown.final)}`}>{result.scoreBreakdown.final}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Live Analysis Extra Info */}
              {result.liveAnalysis && (
                <div className="mt-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-4 w-4 text-purple-400" />
                    <span className="text-sm font-medium text-purple-400">Fresh Analysis</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Pattern: </span>
                      <span className="font-medium">{result.liveAnalysis.pattern.replace(/_/g, ' ')}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Graduated: </span>
                      <span className="font-medium text-green-400">{result.liveAnalysis.graduatedTokens}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Success Rate: </span>
                      <span className="font-medium">{result.liveAnalysis.successRate.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Always show rescan options */}
              <div className="mt-6 pt-4 border-t border-border/50">
                <h4 className="font-semibold flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                  <Scan className="h-4 w-4" />
                  Rescan / Update Data
                </h4>
                <div className="grid md:grid-cols-3 gap-3">
                  <Button 
                    onClick={() => handleLookup('deep')} 
                    disabled={isLoading}
                    size="sm"
                    className="h-auto py-3 flex flex-col items-center gap-1 bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    <Scan className="h-5 w-5" />
                    <span className="font-semibold text-xs">🔥 Deep Scan</span>
                    <span className="text-[10px] opacity-80">Full ATH + rug analysis</span>
                  </Button>
                  
                  <Button 
                    onClick={() => handleLookup('quick')} 
                    disabled={isLoading}
                    variant="secondary"
                    size="sm"
                    className="h-auto py-3 flex flex-col items-center gap-1"
                  >
                    <Zap className="h-5 w-5" />
                    <span className="font-semibold text-xs">⚡ Quick Check</span>
                    <span className="text-[10px] opacity-80">Basic pattern detection</span>
                  </Button>
                  
                  <Button 
                    onClick={() => handleLookup('spider')} 
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                    className="h-auto py-3 flex flex-col items-center gap-1"
                  >
                    <Eye className="h-5 w-5" />
                    <span className="font-semibold text-xs">🕸️ Spider Only</span>
                    <span className="text-[10px] opacity-80">Just refresh DB entry</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Token History */}
          {result.tokenHistory && result.tokenHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Coins className="h-4 w-4" />
                  Token History ({result.tokenHistory.length} tokens)
                </CardTitle>
                {result.upstreamChain && result.upstreamChain.length > 1 && (
                  <CardDescription className="text-xs">
                    Wallet chain: {result.upstreamChain.map((node, idx) => (
                      <span key={idx}>
                        {idx > 0 && <span className="text-muted-foreground"> → </span>}
                        <span className={`font-mono ${
                          node.role === 'kyc_root' ? 'text-amber-400' :
                          node.role === 'funder' ? 'text-green-400' :
                          'text-purple-400'
                        }`}>
                          {node.role === 'creator' ? '📡' : node.role === 'funder' ? '💰' : '🔑'}
                          {node.wallet.slice(0, 4)}...{node.wallet.slice(-4)}
                        </span>
                      </span>
                    ))}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {result.tokenHistory.map((token: any, i: number) => {
                    const directCreator = token.creatorWallet || result.resolvedWallet;
                    return (
                    <div key={i} className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-muted/30 border border-border/30 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-sm">{token.symbol}</span>
                          <code className="text-muted-foreground font-mono truncate max-w-[180px]">{token.mint}</code>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 flex-shrink-0" onClick={() => copyToClipboard(token.mint)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                          <a href={`https://pump.fun/coin/${token.mint}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary flex-shrink-0">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {getOutcomeBadge(token.outcome)}
                          {token.isActive && <Badge className="bg-green-500/20 text-green-400 border-green-500/50 text-[10px]">Active</Badge>}
                        </div>
                      </div>
                      
                      {/* Wallet chain: Direct Creator → Funder → KYC Root */}
                      <div className="flex flex-col gap-0.5 ml-1">
                        {/* Direct creator (pump.fun dev wallet) */}
                        {directCreator && (
                          <div className="flex items-center gap-1.5 pl-2 border-l-2 border-purple-500/30">
                            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/40 text-[9px] px-1 py-0">📡 Creator</Badge>
                            <a href={solscanLink(directCreator)} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-blue-400 hover:text-blue-300 underline decoration-dotted">
                              {directCreator.slice(0, 6)}...{directCreator.slice(-4)}
                            </a>
                            <a href={`https://pump.fun/profile/${directCreator}`} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300" title="Pump.fun profile">
                              <span className="text-[9px]">🟢PF</span>
                            </a>
                            <a href={solscanLink(directCreator)} target="_blank" rel="noopener noreferrer" className="hover:text-primary" title="Solscan">
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                            <Button variant="ghost" size="sm" className="h-4 w-4 p-0 flex-shrink-0" onClick={() => copyToClipboard(directCreator)}>
                              <Copy className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                        )}
                        
                        {/* Upstream chain (funder → KYC root) */}
                        {result.upstreamChain && result.upstreamChain.slice(1).map((node, idx) => (
                          <div key={idx} className={`flex items-center gap-1.5 pl-2 border-l-2 ${
                            node.role === 'kyc_root' ? 'border-amber-500/40' : 'border-green-500/30'
                          }`}>
                            <Badge className={`text-[9px] px-1 py-0 ${
                              node.role === 'kyc_root' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' :
                              'bg-green-500/20 text-green-400 border-green-500/40'
                            }`}>
                              {node.role === 'kyc_root' ? '🔑 KYC Root' : '💰 Funder'}
                            </Badge>
                            <span className="text-[9px] text-muted-foreground">↑ {node.relationship.replace(/_/g, ' ')}</span>
                            <a href={solscanLink(node.wallet)} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-blue-400 hover:text-blue-300 underline decoration-dotted">
                              {node.wallet.slice(0, 6)}...{node.wallet.slice(-4)}
                            </a>
                            <a href={`https://pump.fun/profile/${node.wallet}`} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300" title="Pump.fun profile">
                              <span className="text-[9px]">🟢PF</span>
                            </a>
                            <a href={solscanLink(node.wallet)} target="_blank" rel="noopener noreferrer" className="hover:text-primary" title="Solscan">
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                            <Button variant="ghost" size="sm" className="h-4 w-4 p-0 flex-shrink-0" onClick={() => copyToClipboard(node.wallet)}>
                              <Copy className="h-2.5 w-2.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-4 p-0 px-1 flex-shrink-0 text-[9px] text-purple-400 hover:text-purple-300" onClick={() => { setQuery(node.wallet); handleLookup(); }}>
                              🔍
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mesh Relationships */}
          {result.network?.meshLinks && result.network.meshLinks.length > 0 && (
            <Card className="border-purple-500/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-purple-400" />
                  Reputation Mesh ({result.network.meshLinks.length} links)
                </CardTitle>
                <CardDescription className="text-xs">
                  Upstream parents, KYC roots, funding chains, and associated entities. Wallets link to Solscan & Pump.fun.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {result.network.meshLinks.map((link: any, i: number) => {
                    const isKycLink = ['same_kyc_root', 'kyc_root', 'funded_by'].includes(link.relationship);
                    const isSatellite = ['satellite_of', 'child_wallet'].includes(link.relationship);
                    const isCoMod = link.relationship === 'co_mod';
                    
                    // Determine hierarchy role for source & linked
                    const getWalletRole = (id: string, isSource: boolean) => {
                      if (id === result.resolvedWallet) return '⭐ SUBJECT';
                      if (isKycLink && !isSource) return '🔑 KYC ROOT';
                      if (isKycLink && isSource) return '📡 SATELLITE';
                      if (isSatellite && isSource) return '📡 SATELLITE';
                      if (isSatellite && !isSource) return '🔑 PARENT';
                      if (link.relationship === 'directly_funded' && !isSource) return '💰 FUNDER';
                      if (link.relationship === 'directly_funded' && isSource) return '📡 FUNDED';
                      return null;
                    };

                    const sourceRole = getWalletRole(link.sourceId, true);
                    const linkedRole = getWalletRole(link.linkedId, false);

                    // Direction arrow based on relationship
                    const getDirectionArrow = () => {
                      if (['funded_by', 'satellite_of', 'child_wallet'].includes(link.relationship)) return '← funded by';
                      if (['directly_funded', 'funds'].includes(link.relationship)) return '→ funds';
                      if (['same_kyc_root', 'kyc_root'].includes(link.relationship)) return '↔ same KYC';
                      if (['co_mod', 'same_team'].includes(link.relationship)) return '↔ linked';
                      return '→';
                    };

                    const renderWalletCell = (id: string, type: string, role: string | null) => (
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px] flex-shrink-0">{type}</Badge>
                          {role && (
                            <Badge className={`text-[9px] px-1 py-0 ${
                              role.includes('KYC') || role.includes('PARENT') ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' :
                              role.includes('SATELLITE') || role.includes('FUNDED') ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' :
                              role.includes('FUNDER') ? 'bg-green-500/20 text-green-400 border-green-500/40' :
                              role.includes('SUBJECT') ? 'bg-purple-500/20 text-purple-400 border-purple-500/40' :
                              'bg-muted/50 text-muted-foreground'
                            }`}>
                              {role}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {isWalletAddress(id) ? (
                            <>
                              <a href={solscanLink(id)} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-400 hover:text-blue-300 underline decoration-dotted text-[11px]" title={id}>
                                {id.slice(0, 6)}...{id.slice(-4)}
                              </a>
                              <a href={`https://pump.fun/profile/${id}`} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-green-400 hover:text-green-300" title="View on Pump.fun">
                                <span className="text-[9px]">🟢PF</span>
                              </a>
                              <a href={solscanLink(id)} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 hover:text-primary" title="View on Solscan">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              <Button variant="ghost" size="sm" className="h-4 w-4 p-0 flex-shrink-0" onClick={() => copyToClipboard(id)}>
                                <Copy className="h-2.5 w-2.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-4 p-0 px-1 flex-shrink-0 text-[9px] text-purple-400 hover:text-purple-300" onClick={() => { setQuery(id); handleLookup(); }}>
                                🔍
                              </Button>
                            </>
                          ) : (
                            <>
                              <code className="font-mono truncate max-w-[140px] text-muted-foreground text-[11px]">{id.length > 16 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id}</code>
                              <Button variant="ghost" size="sm" className="h-4 w-4 p-0 flex-shrink-0" onClick={() => copyToClipboard(id)}>
                                <Copy className="h-2.5 w-2.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );

                    return (
                      <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${
                        isKycLink ? 'bg-amber-500/10 border-amber-500/30' : 
                        isSatellite ? 'bg-blue-500/5 border-blue-500/20' :
                        'bg-muted/20 border-border/30'
                      }`}>
                        {renderWalletCell(link.sourceId, link.sourceType, sourceRole)}
                        
                        <div className="flex flex-col items-center flex-shrink-0 px-1">
                          <Badge className={`text-[9px] whitespace-nowrap ${
                            isKycLink ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 
                            isSatellite ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' :
                            'bg-purple-500/20 text-purple-400 border-purple-500/40'
                          }`}>
                            {getRelationshipLabel(link.relationship)}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground mt-0.5">{getDirectionArrow()}</span>
                        </div>
                        
                        {renderWalletCell(link.linkedId, link.linkedType, linkedRole)}
                        
                        <div className="flex-shrink-0 text-right">
                          <span className="text-muted-foreground text-[10px]">{link.confidence}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* No Mesh Links Warning */}
          {(!result.network?.meshLinks || result.network.meshLinks.length === 0) && (
            <Card className="border-dashed border-yellow-500/30">
              <CardContent className="py-4">
                <div className="flex items-center gap-3 text-yellow-500/80">
                  <GitBranch className="h-5 w-5" />
                  <div>
                    <p className="text-sm font-medium">No Mesh Links Found</p>
                    <p className="text-xs text-muted-foreground">
                      This wallet has no upstream parent, KYC root, or funding chain connections in the reputation mesh. 
                      Run a <strong>Deep Scan</strong> to spider the funding network and discover hidden connections.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
                    {result.network.linkedXAccounts.map((handle: string, i: number) => (
                      <Badge key={i} variant="outline">@{handle}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {result.network.sharedMods.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Shared Mods</span>
                  <div className="flex flex-wrap gap-2">
                    {result.network.sharedMods.slice(0, 10).map((mod: string, i: number) => (
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
                    {result.network.relatedTokens.slice(0, 10).map((token: string, i: number) => (
                      <Badge key={i} variant="outline" className="font-mono text-xs">{token}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {result.network.linkedWallets.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Linked Wallets (from Mesh)</span>
                  <div className="flex flex-wrap gap-2">
                    {result.network.linkedWallets.slice(0, 10).map((wallet: string, i: number) => (
                      <div key={i} className="flex items-center gap-1 p-1.5 rounded border border-border/40 bg-muted/20">
                        <Badge variant="outline" className="font-mono text-xs cursor-pointer hover:bg-muted" onClick={() => { setQuery(wallet); handleLookup(); }}>
                          {wallet.slice(0, 8)}...{wallet.slice(-4)}
                        </Badge>
                        <a href={solscanLink(wallet)} target="_blank" rel="noopener noreferrer" className="hover:text-primary" title="Solscan">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <a href={`https://pump.fun/profile/${wallet}`} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300" title="Pump.fun profile">
                          <span className="text-[9px]">🟢PF</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.meshLinksAdded > 0 && (
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  +{result.meshLinksAdded} new mesh links discovered
                </div>
              )}

              {/* Show if network is empty */}
              {!result.network.devTeam && 
               result.network.linkedXAccounts.length === 0 && 
               result.network.sharedMods.length === 0 && 
               result.network.relatedTokens.length === 0 && 
               result.network.linkedWallets.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No network associations found</p>
                  <p className="text-xs">Run a Deep Scan to discover connections</p>
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
