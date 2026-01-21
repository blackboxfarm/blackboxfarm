import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Code2, Check, Share2, Copy, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TokenStats {
  symbol: string;
  name: string;
  tokenAddress: string;
  price: number;
  marketCap: number;
  healthScore: number;
  healthGrade: string;
  totalHolders: number;
  realHolders: number;
  whaleCount: number;
  strongCount: number;
  activeCount: number;
  dustCount: number;
  dustPercentage: number;
}

// Mock data for demo
const mockTokenStats: TokenStats = {
  symbol: 'DEMO',
  name: 'Demo Token',
  tokenAddress: 'DemoToken1234567890abcdefghijklmnopqrstuvwxyz',
  price: 0.00001234,
  marketCap: 1250000,
  healthScore: 78,
  healthGrade: 'B+',
  totalHolders: 2847,
  realHolders: 1423,
  whaleCount: 12,
  strongCount: 284,
  activeCount: 1127,
  dustCount: 1424,
  dustPercentage: 50,
};

const DEFAULT_TWEET_TEMPLATE = `🔎 Holder Analysis: $\{ticker}
CA:{ca}

🏛 {totalWallets} Total Wallets
✅ {realHolders} Real Holders
🌫 {dustPct}% Dust

🐋 {whales} Whales | 💪 {strong} Strong | 🌱 {active} Active

Health: {healthGrade} ({healthScore}/100)

Free analysis 👇`;

const TEMPLATE_VARIABLES = [
  { var: '{ticker}', desc: 'Token symbol' },
  { var: '{ca}', desc: 'Contract address' },
  { var: '{totalWallets}', desc: 'Total wallet count' },
  { var: '{realHolders}', desc: 'Real holder count' },
  { var: '{dustPct}', desc: 'Dust percentage' },
  { var: '{whales}', desc: 'Whale count' },
  { var: '{strong}', desc: 'Strong holder count' },
  { var: '{active}', desc: 'Active holder count' },
  { var: '{healthGrade}', desc: 'Grade (A+, B+, etc)' },
  { var: '{healthScore}', desc: 'Score (0-100)' },
];

export function ShareCardDemo({ tokenStats = mockTokenStats }: { tokenStats?: TokenStats }) {
  // AI card state
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiImageUrl, setAiImageUrl] = useState<string | null>(null);
  const [aiSharePageUrl, setAiSharePageUrl] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  
  // Satori card state
  const [satoriImageUrl, setSatoriImageUrl] = useState<string | null>(null);
  const [satoriSharePageUrl, setSatoriSharePageUrl] = useState<string | null>(null);
  const [isGeneratingSatori, setIsGeneratingSatori] = useState(false);
  
  // Selection and template state
  const [selectedApproach, setSelectedApproach] = useState<'A' | 'B' | null>(null);
  const [tweetTemplate, setTweetTemplate] = useState(DEFAULT_TWEET_TEMPLATE);

  const getShareUrl = () => {
    return `https://blackbox.farm/holders?token=${encodeURIComponent(tokenStats.tokenAddress)}`;
  };

  const truncateCA = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Process template with actual values
  const processTemplate = (template: string): string => {
    return template
      .replace(/\{ticker\}/g, tokenStats.symbol)
      .replace(/\{ca\}/g, tokenStats.tokenAddress)
      .replace(/\{totalWallets\}/g, tokenStats.totalHolders.toLocaleString())
      .replace(/\{realHolders\}/g, tokenStats.realHolders.toLocaleString())
      .replace(/\{dustPct\}/g, tokenStats.dustPercentage.toString())
      .replace(/\{whales\}/g, tokenStats.whaleCount.toString())
      .replace(/\{strong\}/g, tokenStats.strongCount.toString())
      .replace(/\{active\}/g, tokenStats.activeCount.toLocaleString())
      .replace(/\{healthGrade\}/g, tokenStats.healthGrade)
      .replace(/\{healthScore\}/g, tokenStats.healthScore.toString());
  };

  // Open Twitter with custom text and share URL
  const shareToTwitter = (sharePageUrl?: string | null) => {
    const tweetText = processTemplate(tweetTemplate);
    const url = sharePageUrl || getShareUrl();
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };

  // Generate AI card
  const generateAICard = async () => {
    setIsGeneratingAI(true);
    setAiImageUrl(null);
    setAiSharePageUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-share-card-image', {
        body: { tokenStats },
      });

      if (error) throw error;

      if (data?.imageBase64) {
        setAiImage(data.imageBase64);
      }
      if (data?.imageUrl) {
        setAiImageUrl(data.imageUrl);
      }
      if (data?.sharePageUrl) {
        setAiSharePageUrl(data.sharePageUrl);
        toast.success('AI card generated — ready to share!');
      } else if (data?.imageUrl) {
        toast.success('Card generated!');
      }
    } catch (err) {
      console.error('Failed to generate AI card:', err);
      toast.error('Failed to generate card');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Generate Satori card
  const generateSatoriCard = async () => {
    setIsGeneratingSatori(true);
    setSatoriImageUrl(null);
    setSatoriSharePageUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-share-card-satori', {
        body: { tokenStats },
      });

      if (error) throw error;

      if (data?.imageUrl) {
        setSatoriImageUrl(data.imageUrl);
      }
      if (data?.sharePageUrl) {
        setSatoriSharePageUrl(data.sharePageUrl);
        toast.success('Satori card generated — ready to share!');
      }
    } catch (err) {
      console.error('Failed to generate Satori card:', err);
      toast.error('Failed to generate card');
    } finally {
      setIsGeneratingSatori(false);
    }
  };

  // Handle share for Option B - generate if not ready, then share
  const handleSatoriShare = async () => {
    if (satoriSharePageUrl) {
      shareToTwitter(satoriSharePageUrl);
      return;
    }
    
    // Generate first, then share
    setIsGeneratingSatori(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-share-card-satori', {
        body: { tokenStats },
      });

      if (error) throw error;

      if (data?.imageUrl) {
        setSatoriImageUrl(data.imageUrl);
      }
      if (data?.sharePageUrl) {
        setSatoriSharePageUrl(data.sharePageUrl);
        toast.success('Card generated!');
        // Now share
        shareToTwitter(data.sharePageUrl);
      } else {
        toast.error('Failed to generate share page');
        shareToTwitter(); // Fallback to SPA URL
      }
    } catch (err) {
      console.error('Failed to generate Satori card:', err);
      toast.error('Generation failed, sharing basic link');
      shareToTwitter(); // Fallback
    } finally {
      setIsGeneratingSatori(false);
    }
  };

  const copyTemplate = () => {
    navigator.clipboard.writeText(processTemplate(tweetTemplate));
    toast.success('Tweet text copied!');
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'text-emerald-400';
    if (grade.startsWith('B')) return 'text-blue-400';
    if (grade.startsWith('C')) return 'text-amber-400';
    return 'text-red-400';
  };

  const getGradeBgColor = (grade: string) => {
    if (grade.startsWith('A')) return 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/40';
    if (grade.startsWith('B')) return 'from-blue-500/20 to-blue-600/10 border-blue-500/40';
    if (grade.startsWith('C')) return 'from-amber-500/20 to-amber-600/10 border-amber-500/40';
    return 'from-red-500/20 to-red-600/10 border-red-500/40';
  };

  const whalePercent = (tokenStats.whaleCount / tokenStats.totalHolders) * 100;
  const strongPercent = (tokenStats.strongCount / tokenStats.totalHolders) * 100;
  const activePercent = (tokenStats.activeCount / tokenStats.totalHolders) * 100;
  const dustPercent = tokenStats.dustPercentage;

  return (
    <div className="space-y-6">
      {/* Tweet Template Editor */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            ✏️ Tweet Template
          </CardTitle>
          <CardDescription>
            Customize the text that appears when sharing. Use variables like {'{ticker}'} to insert dynamic data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tweet-template">Template</Label>
              <Textarea
                id="tweet-template"
                value={tweetTemplate}
                onChange={(e) => setTweetTemplate(e.target.value)}
                placeholder="Enter your tweet template..."
                rows={8}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTweetTemplate(DEFAULT_TWEET_TEMPLATE)}
                  className="text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyTemplate}
                  className="text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy Text
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="p-3 bg-muted/50 rounded-lg border text-sm whitespace-pre-wrap min-h-[180px]">
                {processTemplate(tweetTemplate)}
              </div>
            </div>
          </div>
          
          {/* Variables reference */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">Available variables:</p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_VARIABLES.map((v) => (
                <Badge 
                  key={v.var} 
                  variant="outline" 
                  className="text-xs cursor-pointer hover:bg-muted"
                  onClick={() => {
                    navigator.clipboard.writeText(v.var);
                    toast.success(`Copied ${v.var}`);
                  }}
                  title={v.desc}
                >
                  {v.var}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Generation Options */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Social Share Card Preview
          </CardTitle>
          <CardDescription>
            Choose how to generate the image card for Twitter previews
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Option A: AI Generated */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30 text-purple-400">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Option A
                  </Badge>
                  <span className="text-sm font-medium">AI Generated (Gemini)</span>
                </div>
                {selectedApproach === 'A' && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    <Check className="h-3 w-3 mr-1" /> Selected
                  </Badge>
                )}
              </div>
              
              <p className="text-xs text-muted-foreground">
                Uses AI to create artistic, unique cards. Each generation is different.
              </p>

              {/* AI Preview Area */}
              <div className="aspect-[1200/628] bg-gradient-to-br from-purple-900/30 via-background to-blue-900/30 rounded-lg border border-purple-500/20 overflow-hidden relative">
                {aiImage ? (
                  <img src={aiImage} alt="AI Generated Card" className="w-full h-full object-cover" />
                ) : isGeneratingAI ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                    <span className="text-sm text-purple-300">AI is painting your card...</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                    <Sparkles className="h-12 w-12 text-purple-400/50 mb-3" />
                    <p className="text-sm text-muted-foreground">Click "Generate AI Card" to create</p>
                  </div>
                )}
              </div>

              <Button 
                onClick={generateAICard} 
                disabled={isGeneratingAI}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {isGeneratingAI ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating (~10s)...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate AI Card
                  </>
                )}
              </Button>

              {aiSharePageUrl && (
                <Button 
                  className="w-full bg-sky-500 hover:bg-sky-600"
                  onClick={() => shareToTwitter(aiSharePageUrl)}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share on Twitter
                </Button>
              )}

              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setSelectedApproach('A')}
                disabled={selectedApproach === 'A'}
              >
                {selectedApproach === 'A' ? 'Selected ✓' : 'Choose This Approach'}
              </Button>
            </div>

            {/* Option B: Satori Template */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-400">
                    <Code2 className="h-3 w-3 mr-1" />
                    Option B
                  </Badge>
                  <span className="text-sm font-medium">HTML Template (Satori)</span>
                </div>
                {selectedApproach === 'B' && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    <Check className="h-3 w-3 mr-1" /> Selected
                  </Badge>
                )}
              </div>
              
              <p className="text-xs text-muted-foreground">
                Pixel-perfect HTML/CSS template. Fast, consistent, and reliable.
              </p>

              {/* Satori Preview Area */}
              <div className="aspect-[1200/628] bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 rounded-lg border border-border overflow-hidden relative">
                {satoriImageUrl ? (
                  <img src={satoriImageUrl} alt="Satori Generated Card" className="w-full h-full object-cover" />
                ) : isGeneratingSatori ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                    <span className="text-sm text-blue-300">Generating card...</span>
                  </div>
                ) : (
                  <>
                    {/* Static preview of template */}
                    <div className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-emerald-400 to-green-600 rounded-md flex items-center justify-center shadow-lg shadow-emerald-500/20">
                          <span className="text-white text-[10px] font-black">BB</span>
                        </div>
                        <span className="text-white/70 text-[11px] font-medium tracking-wide">BlackBox Farm</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-full">
                        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center">
                          <span className="text-[7px] font-bold text-white">{tokenStats.symbol.slice(0, 1)}</span>
                        </div>
                        <span className="text-white/50 text-[10px]">${tokenStats.symbol}</span>
                      </div>
                    </div>

                    <div className="absolute inset-0 flex items-center justify-between px-5 pt-10 pb-8">
                      <div className="flex-1 flex flex-col items-start justify-center">
                        <div className="mb-1">
                          <span className="text-white/40 text-[9px] uppercase tracking-wider">Total Wallets</span>
                        </div>
                        <div className="text-white text-3xl font-black tracking-tight leading-none">
                          {tokenStats.totalHolders.toLocaleString()}
                        </div>
                        <div className="my-1.5 text-emerald-400 text-lg">↓</div>
                        <div className="mb-0.5">
                          <span className="text-emerald-400 text-[9px] uppercase tracking-wider font-semibold">Real Holders</span>
                        </div>
                        <div className="text-emerald-400 text-4xl font-black tracking-tight leading-none">
                          {tokenStats.realHolders.toLocaleString()}
                        </div>
                        <div className="mt-2 bg-gray-800/60 rounded-md px-2 py-1">
                          <span className="text-gray-400 text-[9px]">
                            <span className="text-amber-400/80">{tokenStats.dustPercentage}%</span> are dust
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col justify-center px-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-20">
                            <span className="text-emerald-400 text-[11px] font-bold">{tokenStats.whaleCount}</span>
                            <span className="text-white/30 text-[9px] ml-1">Whales</span>
                          </div>
                          <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-sm" style={{ width: `${Math.max(whalePercent * 5, 8)}%` }} />
                          </div>
                          <span className="text-[10px] w-6">🐋</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-20">
                            <span className="text-blue-400 text-[11px] font-bold">{tokenStats.strongCount}</span>
                            <span className="text-white/30 text-[9px] ml-1">Strong</span>
                          </div>
                          <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-sm" style={{ width: `${Math.max(strongPercent * 2, 15)}%` }} />
                          </div>
                          <span className="text-[10px] w-6">💪</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-20">
                            <span className="text-amber-400 text-[11px] font-bold">{tokenStats.activeCount.toLocaleString()}</span>
                            <span className="text-white/30 text-[9px] ml-1">Active</span>
                          </div>
                          <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-sm" style={{ width: `${Math.max(activePercent, 40)}%` }} />
                          </div>
                          <span className="text-[10px] w-6">🌱</span>
                        </div>
                        <div className="border-t border-dashed border-gray-700 my-0.5" />
                        <div className="flex items-center gap-2 opacity-50">
                          <div className="w-20">
                            <span className="text-gray-400 text-[11px] font-bold">{tokenStats.dustCount.toLocaleString()}</span>
                            <span className="text-white/20 text-[9px] ml-1">Dust</span>
                          </div>
                          <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-gray-600 to-gray-500 rounded-sm" style={{ width: `${dustPercent}%` }} />
                          </div>
                          <span className="text-[10px] w-6">💨</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center pl-3 space-y-2">
                        <div className="text-center">
                          <div className="text-white font-bold text-lg">${tokenStats.symbol}</div>
                          <div className="text-white/30 text-[7px] font-mono">{truncateCA(tokenStats.tokenAddress)}</div>
                        </div>
                        <div className={`rounded-lg bg-gradient-to-b ${getGradeBgColor(tokenStats.healthGrade)} border px-3 py-2 text-center`}>
                          <div className="text-white/50 text-[7px] uppercase tracking-wider">Health</div>
                          <div className={`text-2xl font-black ${getGradeColor(tokenStats.healthGrade)}`}>
                            {tokenStats.healthGrade}
                          </div>
                          <div className="text-white/30 text-[8px]">{tokenStats.healthScore}/100</div>
                        </div>
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 px-4 py-2.5 flex items-center justify-between bg-black/30">
                      <span className="text-emerald-400/70 text-[10px] font-medium">blackbox.farm/holders</span>
                      <span className="text-white/30 text-[9px]">Free Holder Analysis Report</span>
                    </div>
                  </>
                )}
              </div>

              <Button 
                onClick={generateSatoriCard} 
                disabled={isGeneratingSatori}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isGeneratingSatori ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Code2 className="h-4 w-4 mr-2" />
                    Generate Satori Card
                  </>
                )}
              </Button>

              <Button 
                className="w-full bg-sky-500 hover:bg-sky-600"
                onClick={handleSatoriShare}
                disabled={isGeneratingSatori}
              >
                {isGeneratingSatori ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating & Sharing...
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4 mr-2" />
                    {satoriSharePageUrl ? 'Share on Twitter' : 'Generate & Share on Twitter'}
                  </>
                )}
              </Button>

              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setSelectedApproach('B')}
                disabled={selectedApproach === 'B'}
              >
                {selectedApproach === 'B' ? 'Selected ✓' : 'Choose This Approach'}
              </Button>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="mt-8 border-t border-border pt-6">
            <h4 className="text-sm font-semibold mb-4">Feature Comparison</h4>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="font-medium text-muted-foreground">Feature</div>
              <div className="font-medium text-purple-400 text-center">A: AI (Gemini)</div>
              <div className="font-medium text-blue-400 text-center">B: Template (Satori)</div>
              
              <div className="text-muted-foreground">Generation Speed</div>
              <div className="text-center">~5-10s</div>
              <div className="text-center text-green-400">~1-2s</div>
              
              <div className="text-muted-foreground">Consistency</div>
              <div className="text-center text-yellow-400">Varies</div>
              <div className="text-center text-green-400">Pixel Perfect</div>
              
              <div className="text-muted-foreground">Uniqueness</div>
              <div className="text-center text-green-400">Every card unique</div>
              <div className="text-center">Template-based</div>
              
              <div className="text-muted-foreground">Brand Control</div>
              <div className="text-center text-yellow-400">Prompt-guided</div>
              <div className="text-center text-green-400">Full control</div>
              
              <div className="text-muted-foreground">Cost</div>
              <div className="text-center text-yellow-400">AI credits</div>
              <div className="text-center text-green-400">Minimal</div>
            </div>
          </div>

          {selectedApproach && (
            <div className="mt-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="text-sm text-green-400">
                ✓ You selected <strong>Option {selectedApproach}</strong>. 
                {selectedApproach === 'A' 
                  ? ' AI-generated artistic cards will be used for social sharing.'
                  : ' Pixel-perfect template cards will be used for social sharing.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
