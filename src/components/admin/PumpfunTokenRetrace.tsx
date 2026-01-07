import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Search, 
  RefreshCw, 
  Network, 
  Twitter, 
  Globe, 
  MessageCircle,
  Users,
  Crown,
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  Trash2,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface TokenRetrace {
  id: string;
  token_mint: string;
  token_name: string;
  token_symbol: string;
  token_image: string;
  launched_at: string;
  is_graduated: boolean;
  current_market_cap_usd: number;
  mint_wallet: string;
  parent_wallet: string;
  grandparent_wallet: string;
  funding_source_type: string;
  funding_cex_name: string;
  wallet_genealogy_json: any;
  pumpfun_twitter: string;
  pumpfun_telegram: string;
  pumpfun_website: string;
  pumpfun_description: string;
  dexscreener_twitter: string;
  dexscreener_telegram: string;
  dexscreener_website: string;
  is_cto_detected: boolean;
  socials_changed: boolean;
  original_team_socials: any;
  total_replies: number;
  livestream_detected: boolean;
  community_sentiment: string;
  kols_involved: string[];
  kol_buy_count: number;
  kol_sell_count: number;
  kol_timeline: any[];
  developer_trust_level: string;
  developer_total_tokens: number;
  developer_success_rate: number;
  analysis_status: string;
  analysis_completed_at: string;
  created_at: string;
}

export default function PumpfunTokenRetrace() {
  const [tokenMint, setTokenMint] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [retraces, setRetraces] = useState<TokenRetrace[]>([]);
  const [selectedRetrace, setSelectedRetrace] = useState<TokenRetrace | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    genealogy: true,
    socials: true,
    kols: true,
    community: true,
    developer: true
  });

  useEffect(() => {
    fetchRetraces();
  }, []);

  const fetchRetraces = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('pumpfun-token-retrace', {
        body: { action: 'list' }
      });

      if (error) throw error;
      setRetraces(data?.data || []);
    } catch (error: any) {
      toast.error('Failed to fetch retraces: ' + error.message);
    }
  };

  const analyzeToken = async () => {
    if (!tokenMint.trim()) {
      toast.error('Please enter a token mint address');
      return;
    }

    setIsAnalyzing(true);
    toast.info('Starting token retrace analysis...');

    try {
      const { data, error } = await supabase.functions.invoke('pumpfun-token-retrace', {
        body: { action: 'analyze', tokenMint: tokenMint.trim() }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Analysis ${data.status}: ${data.data.token_name || tokenMint}`);
        setSelectedRetrace(data.data);
        fetchRetraces();
      } else {
        toast.error('Analysis failed: ' + (data?.error || 'Unknown error'));
      }
    } catch (error: any) {
      toast.error('Analysis error: ' + error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const deleteRetrace = async (mint: string) => {
    try {
      await supabase.functions.invoke('pumpfun-token-retrace', {
        body: { action: 'delete', tokenMint: mint }
      });
      toast.success('Retrace deleted');
      if (selectedRetrace?.token_mint === mint) {
        setSelectedRetrace(null);
      }
      fetchRetraces();
    } catch (error: any) {
      toast.error('Delete failed: ' + error.message);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const shortenAddress = (addr: string) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '-';

  const formatMcap = (mcap: number) => {
    if (!mcap) return '-';
    if (mcap >= 1e9) return `$${(mcap / 1e9).toFixed(2)}B`;
    if (mcap >= 1e6) return `$${(mcap / 1e6).toFixed(2)}M`;
    if (mcap >= 1e3) return `$${(mcap / 1e3).toFixed(2)}K`;
    return `$${mcap.toFixed(2)}`;
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return 'text-green-400';
      case 'bearish': return 'text-red-400';
      case 'mixed': return 'text-yellow-400';
      default: return 'text-muted-foreground';
    }
  };

  const getTrustBadge = (level: string) => {
    switch (level) {
      case 'trusted': return <Badge className="bg-green-500/20 text-green-400">Trusted</Badge>;
      case 'neutral': return <Badge variant="outline">Neutral</Badge>;
      case 'suspicious': return <Badge className="bg-yellow-500/20 text-yellow-400">Suspicious</Badge>;
      case 'risky': return <Badge className="bg-orange-500/20 text-orange-400">Risky</Badge>;
      case 'scammer': return <Badge className="bg-red-500/20 text-red-400">Scammer</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const renderWalletGenealogy = (genealogy: any, depth = 0) => {
    if (!genealogy || !genealogy.wallet) return null;

    return (
      <div className={`ml-${depth * 4} border-l-2 border-primary/30 pl-4 py-2`}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{shortenAddress(genealogy.wallet)}</span>
          {genealogy.cexName && (
            <Badge className="bg-blue-500/20 text-blue-400">{genealogy.cexName}</Badge>
          )}
          {genealogy.amountSol > 0 && (
            <span className="text-xs text-muted-foreground">{genealogy.amountSol.toFixed(2)} SOL</span>
          )}
          <a
            href={`https://solscan.io/account/${genealogy.wallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {genealogy.children?.map((child: any, i: number) => (
          <div key={i}>{renderWalletGenealogy(child, depth + 1)}</div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Token Retrace Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter pump.fun token mint address..."
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              className="flex-1 font-mono"
            />
            <Button onClick={analyzeToken} disabled={isAnalyzing}>
              {isAnalyzing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Retrace
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Analyze successful tokens to uncover mint wallet genealogy, original team socials (pre-CTO), KOL involvement, and community data.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Retraces List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm flex items-center justify-between">
              Recent Retraces
              <Button variant="ghost" size="sm" onClick={fetchRetraces}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {retraces.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No retraces yet. Analyze a token to start.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {retraces.map((retrace) => (
                    <div
                      key={retrace.id}
                      className={`p-3 cursor-pointer hover:bg-accent/50 transition-colors ${
                        selectedRetrace?.token_mint === retrace.token_mint ? 'bg-accent' : ''
                      }`}
                      onClick={() => setSelectedRetrace(retrace)}
                    >
                      <div className="flex items-center gap-2">
                        {retrace.token_image && (
                          <img
                            src={retrace.token_image}
                            alt={retrace.token_symbol}
                            className="w-8 h-8 rounded-full"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {retrace.token_symbol || retrace.token_name}
                            </span>
                            {retrace.is_cto_detected && (
                              <Badge variant="destructive" className="text-xs">CTO</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatMcap(retrace.current_market_cap_usd)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRetrace(retrace.token_mint);
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Selected Retrace Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">
              {selectedRetrace ? (
                <div className="flex items-center gap-3">
                  {selectedRetrace.token_image && (
                    <img
                      src={selectedRetrace.token_image}
                      alt={selectedRetrace.token_symbol}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span>{selectedRetrace.token_name}</span>
                      <span className="text-muted-foreground">({selectedRetrace.token_symbol})</span>
                      {selectedRetrace.is_graduated && (
                        <Badge className="bg-green-500/20 text-green-400">Graduated</Badge>
                      )}
                      {selectedRetrace.is_cto_detected && (
                        <Badge variant="destructive">CTO Detected</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {selectedRetrace.token_mint}
                    </div>
                  </div>
                </div>
              ) : (
                'Select a token to view details'
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedRetrace ? (
              <div className="text-center text-muted-foreground py-12">
                <Network className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Select a retrace from the list or analyze a new token</p>
              </div>
            ) : (
              <ScrollArea className="h-[450px] pr-4">
                <div className="space-y-4">
                  {/* Wallet Genealogy Section */}
                  <div className="border rounded-lg">
                    <button
                      className="w-full p-3 flex items-center justify-between hover:bg-accent/50"
                      onClick={() => toggleSection('genealogy')}
                    >
                      <div className="flex items-center gap-2">
                        <Network className="h-4 w-4 text-primary" />
                        <span className="font-medium">Wallet Genealogy</span>
                      </div>
                      {expandedSections.genealogy ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {expandedSections.genealogy && (
                      <div className="p-3 border-t bg-muted/30">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Mint Wallet:</span>
                            <a
                              href={`https://solscan.io/account/${selectedRetrace.mint_wallet}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-primary hover:underline flex items-center gap-1"
                            >
                              {shortenAddress(selectedRetrace.mint_wallet)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          {selectedRetrace.parent_wallet && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Parent Wallet:</span>
                              <a
                                href={`https://solscan.io/account/${selectedRetrace.parent_wallet}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-primary hover:underline flex items-center gap-1"
                              >
                                {shortenAddress(selectedRetrace.parent_wallet)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                          {selectedRetrace.funding_cex_name && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Funding Source:</span>
                              <Badge className="bg-blue-500/20 text-blue-400">
                                {selectedRetrace.funding_cex_name}
                              </Badge>
                            </div>
                          )}
                          {selectedRetrace.wallet_genealogy_json?.wallet && (
                            <div className="mt-3 pt-3 border-t">
                              <span className="text-xs text-muted-foreground">Funding Tree:</span>
                              {renderWalletGenealogy(selectedRetrace.wallet_genealogy_json)}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Socials Section */}
                  <div className="border rounded-lg">
                    <button
                      className="w-full p-3 flex items-center justify-between hover:bg-accent/50"
                      onClick={() => toggleSection('socials')}
                    >
                      <div className="flex items-center gap-2">
                        <Twitter className="h-4 w-4 text-sky-400" />
                        <span className="font-medium">Socials</span>
                        {selectedRetrace.socials_changed && (
                          <Badge variant="destructive" className="text-xs">Changed</Badge>
                        )}
                      </div>
                      {expandedSections.socials ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {expandedSections.socials && (
                      <div className="p-3 border-t bg-muted/30">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <h4 className="font-medium text-green-400 mb-2">Pump.fun (Original)</h4>
                            <div className="space-y-1">
                              {selectedRetrace.pumpfun_twitter ? (
                                <a
                                  href={selectedRetrace.pumpfun_twitter}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-sky-400 hover:underline"
                                >
                                  <Twitter className="h-3 w-3" />
                                  {selectedRetrace.pumpfun_twitter.split('/').pop()}
                                </a>
                              ) : (
                                <span className="text-muted-foreground">No Twitter</span>
                              )}
                              {selectedRetrace.pumpfun_telegram && (
                                <a
                                  href={selectedRetrace.pumpfun_telegram}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-400 hover:underline"
                                >
                                  <MessageCircle className="h-3 w-3" />
                                  Telegram
                                </a>
                              )}
                              {selectedRetrace.pumpfun_website && (
                                <a
                                  href={selectedRetrace.pumpfun_website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-primary hover:underline"
                                >
                                  <Globe className="h-3 w-3" />
                                  Website
                                </a>
                              )}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-yellow-400 mb-2">
                              DexScreener (Current)
                              {selectedRetrace.is_cto_detected && (
                                <span className="text-xs text-red-400 ml-2">⚠️ CTO</span>
                              )}
                            </h4>
                            <div className="space-y-1">
                              {selectedRetrace.dexscreener_twitter ? (
                                <a
                                  href={selectedRetrace.dexscreener_twitter}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-sky-400 hover:underline"
                                >
                                  <Twitter className="h-3 w-3" />
                                  {selectedRetrace.dexscreener_twitter.split('/').pop()}
                                </a>
                              ) : (
                                <span className="text-muted-foreground">No Twitter</span>
                              )}
                              {selectedRetrace.dexscreener_telegram && (
                                <a
                                  href={selectedRetrace.dexscreener_telegram}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-400 hover:underline"
                                >
                                  <MessageCircle className="h-3 w-3" />
                                  Telegram
                                </a>
                              )}
                              {selectedRetrace.dexscreener_website && (
                                <a
                                  href={selectedRetrace.dexscreener_website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-primary hover:underline"
                                >
                                  <Globe className="h-3 w-3" />
                                  Website
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* KOL Involvement Section */}
                  <div className="border rounded-lg">
                    <button
                      className="w-full p-3 flex items-center justify-between hover:bg-accent/50"
                      onClick={() => toggleSection('kols')}
                    >
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-yellow-400" />
                        <span className="font-medium">KOL Involvement</span>
                        {selectedRetrace.kols_involved?.length > 0 && (
                          <Badge>{selectedRetrace.kols_involved.length} KOLs</Badge>
                        )}
                      </div>
                      {expandedSections.kols ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {expandedSections.kols && (
                      <div className="p-3 border-t bg-muted/30">
                        {selectedRetrace.kols_involved?.length > 0 ? (
                          <div className="space-y-2">
                            <div className="flex gap-4 text-sm">
                              <span className="text-green-400">
                                {selectedRetrace.kol_buy_count} buys
                              </span>
                              <span className="text-red-400">
                                {selectedRetrace.kol_sell_count} sells
                              </span>
                            </div>
                            <div className="space-y-1">
                              {selectedRetrace.kol_timeline?.map((event: any, i: number) => (
                                <div
                                  key={i}
                                  className={`text-xs p-2 rounded ${
                                    event.action === 'buy' ? 'bg-green-500/10' : 'bg-red-500/10'
                                  }`}
                                >
                                  <span className="font-medium">
                                    {event.name || shortenAddress(event.wallet)}
                                  </span>
                                  <span className={event.action === 'buy' ? 'text-green-400' : 'text-red-400'}>
                                    {' '}{event.action}
                                  </span>
                                  {event.amountSol && (
                                    <span className="text-muted-foreground">
                                      {' '}{event.amountSol.toFixed(2)} SOL
                                    </span>
                                  )}
                                  {event.chartKilled && (
                                    <Badge variant="destructive" className="ml-2 text-xs">
                                      Chart Kill
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center text-muted-foreground py-4">
                            No KOL activity detected
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Community Section */}
                  <div className="border rounded-lg">
                    <button
                      className="w-full p-3 flex items-center justify-between hover:bg-accent/50"
                      onClick={() => toggleSection('community')}
                    >
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-purple-400" />
                        <span className="font-medium">Community</span>
                      </div>
                      {expandedSections.community ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {expandedSections.community && (
                      <div className="p-3 border-t bg-muted/30">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <div className="text-2xl font-bold">{selectedRetrace.total_replies}</div>
                            <div className="text-xs text-muted-foreground">Replies</div>
                          </div>
                          <div>
                            <div className={`text-2xl font-bold ${getSentimentColor(selectedRetrace.community_sentiment)}`}>
                              {selectedRetrace.community_sentiment || 'Unknown'}
                            </div>
                            <div className="text-xs text-muted-foreground">Sentiment</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold">
                              {selectedRetrace.livestream_detected ? (
                                <CheckCircle className="h-6 w-6 text-green-400 mx-auto" />
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">Livestream</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Developer Section */}
                  <div className="border rounded-lg">
                    <button
                      className="w-full p-3 flex items-center justify-between hover:bg-accent/50"
                      onClick={() => toggleSection('developer')}
                    >
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-orange-400" />
                        <span className="font-medium">Developer</span>
                        {selectedRetrace.developer_trust_level && getTrustBadge(selectedRetrace.developer_trust_level)}
                      </div>
                      {expandedSections.developer ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {expandedSections.developer && (
                      <div className="p-3 border-t bg-muted/30">
                        {selectedRetrace.developer_trust_level ? (
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <div className="text-muted-foreground">Total Tokens</div>
                              <div className="font-medium">{selectedRetrace.developer_total_tokens || 0}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Success Rate</div>
                              <div className="font-medium">
                                {selectedRetrace.developer_success_rate?.toFixed(1) || 0}%
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center text-muted-foreground py-4">
                            No developer profile found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Data Availability Info */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            Pump.fun Data Availability (Post-Graduation)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h5 className="font-medium text-green-400 mb-1">✓ Available</h5>
              <ul className="text-muted-foreground space-y-1">
                <li>• Token metadata (name, symbol, image, description)</li>
                <li>• Original pump.fun socials (pre-CTO team)</li>
                <li>• Creator/mint wallet address</li>
                <li>• Community replies/chat history</li>
                <li>• Livestream clips (if any)</li>
                <li>• DexScreener current socials (may be CTO)</li>
              </ul>
            </div>
            <div>
              <h5 className="font-medium text-red-400 mb-1">✗ Limited</h5>
              <ul className="text-muted-foreground space-y-1">
                <li>• Bonding curve historical data (snapshots only)</li>
                <li>• Telegram group admins/mods (not accessible)</li>
                <li>• X/Twitter followers at launch time</li>
                <li>• Discord server ownership</li>
                <li>• Real-time bonding curve state (post-graduation)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
