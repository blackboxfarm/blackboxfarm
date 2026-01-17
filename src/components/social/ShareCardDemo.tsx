import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Code2, Check, Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TokenStats {
  symbol: string;
  name: string;
  tokenAddress: string; // Added for CA display
  price: number;
  marketCap: number;
  healthScore: number;
  healthGrade: string;
  totalHolders: number;
  // New breakdown fields
  realHolders: number;
  whaleCount: number;
  strongCount: number;
  activeCount: number;
  dustCount: number;
  dustPercentage: number;
}

// Mock data for demo - realistic breakdown
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

export function ShareCardDemo({ tokenStats = mockTokenStats }: { tokenStats?: TokenStats }) {
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiImageUrl, setAiImageUrl] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [selectedApproach, setSelectedApproach] = useState<'A' | 'B' | null>(null);

  // Build the shareable URL - always point to blackbox.farm/holders with token param
  const getShareUrl = () => {
    return `https://blackbox.farm/holders?token=${encodeURIComponent(tokenStats.tokenAddress)}`;
  };

  // Truncate CA for display
  const truncateCA = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Open Twitter share dialog with Web Intent
  const shareToTwitter = () => {
    const tweetText = `🔎 Holder Analysis: $${tokenStats.symbol}

🏛 ${tokenStats.totalHolders.toLocaleString()} Total Wallets
✅ ${tokenStats.realHolders.toLocaleString()} Real Holders
🌫 ${tokenStats.dustPercentage}% Dust

🐋 ${tokenStats.whaleCount} Whales | 💪 ${tokenStats.strongCount} Strong | 🌱 ${tokenStats.activeCount.toLocaleString()} Active

Health Grade: ${tokenStats.healthGrade} (${tokenStats.healthScore}/100)

Free holder report on BlackBox Farm`;

    const shareUrl = getShareUrl();
    
    const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;
    
    window.open(twitterIntentUrl, '_blank', 'width=550,height=420');
  };

  // Generate AI card image and upload it
  const generateAICard = async () => {
    setIsGeneratingAI(true);
    setAiImageUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-share-card-image', {
        body: { tokenStats }
      });
      
      if (error) throw error;
      
      // Store both the base64 for display and the URL for sharing
      if (data?.imageBase64) {
        setAiImage(data.imageBase64);
      }
      if (data?.imageUrl) {
        setAiImageUrl(data.imageUrl);
        toast.success('Card generated and ready to share!');
      } else if (data?.imageBase64) {
        toast.success('Card generated! (Image preview only)');
      }
    } catch (err) {
      console.error('Failed to generate AI card:', err);
      toast.error('Failed to generate card');
    } finally {
      setIsGeneratingAI(false);
    }
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

  // Calculate percentages for the visual bars
  const whalePercent = (tokenStats.whaleCount / tokenStats.totalHolders) * 100;
  const strongPercent = (tokenStats.strongCount / tokenStats.totalHolders) * 100;
  const activePercent = (tokenStats.activeCount / tokenStats.totalHolders) * 100;
  const dustPercent = tokenStats.dustPercentage;

  return (
    <div className="space-y-6">
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Social Share Card Preview
          </CardTitle>
          <CardDescription>
            Compare two approaches for generating shareable social cards
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
                Uses AI to create artistic, unique cards with creative layouts and visual flair. 
                Each generation can be slightly different.
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
                    <p className="text-sm text-muted-foreground mb-2">
                      AI will generate an artistic card with:
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• Creative visual composition</li>
                      <li>• Stylized crypto-themed graphics</li>
                      <li>• Dynamic data visualization</li>
                      <li>• Unique artistic interpretation</li>
                    </ul>
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
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate AI Card
                  </>
                )}
              </Button>

              {aiImage && (
                <Button 
                  className="w-full bg-sky-500 hover:bg-sky-600"
                  onClick={() => shareToTwitter()}
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

            {/* Option B: HTML Template - REDESIGNED */}
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
                Uses precise HTML/CSS templates converted to images. 
                Pixel-perfect, consistent, and fast every time.
              </p>

              {/* REDESIGNED Template Preview */}
              <div className="aspect-[1200/628] bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 rounded-lg border border-border overflow-hidden relative">
                {/* Top Bar - Branding + Token Badge */}
                <div className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between">
                  {/* BlackBox Farm Logo */}
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-gradient-to-br from-emerald-400 to-green-600 rounded-md flex items-center justify-center shadow-lg shadow-emerald-500/20">
                      <span className="text-white text-[10px] font-black">BB</span>
                    </div>
                    <span className="text-white/70 text-[11px] font-medium tracking-wide">BlackBox Farm</span>
                  </div>
                  
                  {/* Token Badge - De-emphasized */}
                  <div className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-full">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center">
                      <span className="text-[7px] font-bold text-white">{tokenStats.symbol.slice(0, 1)}</span>
                    </div>
                    <span className="text-white/50 text-[10px]">${tokenStats.symbol}</span>
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="absolute inset-0 flex items-center justify-between px-5 pt-10 pb-8">
                  
                  {/* LEFT SIDE - Hero Numbers */}
                  <div className="flex-1 flex flex-col items-start justify-center">
                    {/* Total Wallets */}
                    <div className="mb-1">
                      <span className="text-white/40 text-[9px] uppercase tracking-wider">Total Wallets</span>
                    </div>
                    <div className="text-white text-3xl font-black tracking-tight leading-none">
                      {tokenStats.totalHolders.toLocaleString()}
                    </div>
                    
                    {/* Arrow down */}
                    <div className="my-1.5 text-emerald-400 text-lg">↓</div>
                    
                    {/* Real Holders - The HERO stat */}
                    <div className="mb-0.5">
                      <span className="text-emerald-400 text-[9px] uppercase tracking-wider font-semibold">Real Holders</span>
                    </div>
                    <div className="text-emerald-400 text-4xl font-black tracking-tight leading-none">
                      {tokenStats.realHolders.toLocaleString()}
                    </div>
                    
                    {/* Dust disclosure */}
                    <div className="mt-2 bg-gray-800/60 rounded-md px-2 py-1">
                      <span className="text-gray-400 text-[9px]">
                        <span className="text-amber-400/80">{tokenStats.dustPercentage}%</span> are dust from failed txns
                      </span>
                    </div>
                  </div>

                  {/* CENTER - Visual Breakdown Bars */}
                  <div className="flex-1 flex flex-col justify-center px-3 space-y-1.5">
                    {/* Whales */}
                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <span className="text-emerald-400 text-[11px] font-bold">{tokenStats.whaleCount}</span>
                        <span className="text-white/30 text-[9px] ml-1">Whales</span>
                      </div>
                      <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-sm"
                          style={{ width: `${Math.max(whalePercent * 5, 8)}%` }}
                        />
                      </div>
                      <span className="text-[10px] w-6">🐋</span>
                    </div>
                    
                    {/* Strong */}
                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <span className="text-blue-400 text-[11px] font-bold">{tokenStats.strongCount}</span>
                        <span className="text-white/30 text-[9px] ml-1">Strong</span>
                      </div>
                      <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-sm"
                          style={{ width: `${Math.max(strongPercent * 2, 15)}%` }}
                        />
                      </div>
                      <span className="text-[10px] w-6">💪</span>
                    </div>
                    
                    {/* Active */}
                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <span className="text-amber-400 text-[11px] font-bold">{tokenStats.activeCount.toLocaleString()}</span>
                        <span className="text-white/30 text-[9px] ml-1">Active</span>
                      </div>
                      <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-sm"
                          style={{ width: `${Math.max(activePercent, 40)}%` }}
                        />
                      </div>
                      <span className="text-[10px] w-6">🌱</span>
                    </div>
                    
                    {/* Divider */}
                    <div className="border-t border-dashed border-gray-700 my-0.5" />
                    
                    {/* Dust - grayed out */}
                    <div className="flex items-center gap-2 opacity-50">
                      <div className="w-20">
                        <span className="text-gray-400 text-[11px] font-bold">{tokenStats.dustCount.toLocaleString()}</span>
                        <span className="text-white/20 text-[9px] ml-1">Dust</span>
                      </div>
                      <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-gray-600 to-gray-500 rounded-sm"
                          style={{ width: `${dustPercent}%` }}
                        />
                      </div>
                      <span className="text-[10px] w-6">💨</span>
                    </div>
                  </div>

                  {/* RIGHT SIDE - Token + Health Grade Badge */}
                  <div className="flex flex-col items-center justify-center pl-3 space-y-2">
                    {/* Token Ticker */}
                    <div className="text-center">
                      <div className="text-white font-bold text-lg">${tokenStats.symbol}</div>
                      <div className="text-white/30 text-[7px] font-mono">{truncateCA(tokenStats.tokenAddress)}</div>
                    </div>
                    {/* Grade Box - smaller */}
                    <div className={`rounded-lg bg-gradient-to-b ${getGradeBgColor(tokenStats.healthGrade)} border px-3 py-2 text-center`}>
                      <div className="text-white/50 text-[7px] uppercase tracking-wider">Health</div>
                      <div className={`text-2xl font-black ${getGradeColor(tokenStats.healthGrade)}`}>
                        {tokenStats.healthGrade}
                      </div>
                      <div className="text-white/30 text-[8px]">{tokenStats.healthScore}/100</div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="absolute bottom-0 left-0 right-0 px-4 py-2.5 flex items-center justify-between bg-black/30">
                  <span className="text-emerald-400/70 text-[10px] font-medium">blackbox.farm/holders</span>
                  <span className="text-white/30 text-[9px]">Free Holder Analysis Report</span>
                </div>
              </div>

              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  // Open the card preview in a new window to simulate Twitter card
                  const cardWindow = window.open('', '_blank', 'width=620,height=350');
                  if (cardWindow) {
                    cardWindow.document.write(`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <title>Twitter Card Preview - ${tokenStats.symbol}</title>
                          <style>
                            * { margin: 0; padding: 0; box-sizing: border-box; }
                            body { 
                              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                              background: #15202b;
                              padding: 20px;
                            }
                            .twitter-card {
                              background: linear-gradient(135deg, #0a0a0a 0%, #111827 50%, #0a0a0a 100%);
                              border-radius: 16px;
                              overflow: hidden;
                              border: 1px solid #2f3336;
                              max-width: 560px;
                            }
                            .card-image {
                              aspect-ratio: 1200/628;
                              position: relative;
                              padding: 16px;
                            }
                            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
                            .logo { display: flex; align-items: center; gap: 8px; }
                            .logo-icon { width: 28px; height: 28px; background: linear-gradient(135deg, #34d399, #16a34a); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: 900; }
                            .logo-text { color: rgba(255,255,255,0.7); font-size: 11px; font-weight: 500; }
                            .token-badge { background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 20px; color: rgba(255,255,255,0.5); font-size: 10px; }
                            .main-content { display: flex; align-items: center; justify-content: space-between; flex: 1; }
                            .hero { flex: 1; }
                            .hero-label { color: rgba(255,255,255,0.4); font-size: 9px; text-transform: uppercase; letter-spacing: 1px; }
                            .hero-total { color: white; font-size: 32px; font-weight: 900; }
                            .hero-arrow { color: #34d399; font-size: 20px; margin: 4px 0; }
                            .hero-real-label { color: #34d399; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
                            .hero-real { color: #34d399; font-size: 40px; font-weight: 900; }
                            .dust-badge { background: rgba(31,41,55,0.6); border-radius: 6px; padding: 4px 8px; margin-top: 8px; display: inline-block; }
                            .dust-badge span { color: #9ca3af; font-size: 9px; }
                            .dust-badge .pct { color: rgba(251,191,36,0.8); }
                            .breakdown { flex: 1; padding: 0 16px; }
                            .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
                            .bar-label { width: 80px; font-size: 11px; }
                            .bar-label .count { font-weight: 700; }
                            .bar-label .text { color: rgba(255,255,255,0.3); font-size: 9px; margin-left: 4px; }
                            .bar-label.whale .count { color: #34d399; }
                            .bar-label.strong .count { color: #60a5fa; }
                            .bar-label.active .count { color: #fbbf24; }
                            .bar-label.dust .count { color: #9ca3af; }
                            .bar { flex: 1; height: 16px; background: #1f2937; border-radius: 2px; overflow: hidden; }
                            .bar-fill { height: 100%; border-radius: 2px; }
                            .bar-fill.whale { background: linear-gradient(90deg, #10b981, #34d399); }
                            .bar-fill.strong { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
                            .bar-fill.active { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
                            .bar-fill.dust { background: linear-gradient(90deg, #4b5563, #6b7280); }
                            .bar-icon { width: 24px; font-size: 10px; }
                            .divider { border-top: 1px dashed #374151; margin: 4px 0; }
                            .dust-row { opacity: 0.5; }
                            .grade { text-align: center; padding-left: 16px; }
                            .token-info { margin-bottom: 8px; }
                            .token-ticker { color: #fff; font-size: 18px; font-weight: 700; }
                            .token-ca { color: rgba(255,255,255,0.3); font-size: 7px; font-family: monospace; }
                            .grade-box { background: linear-gradient(180deg, rgba(59,130,246,0.2), rgba(59,130,246,0.1)); border: 1px solid rgba(59,130,246,0.4); border-radius: 8px; padding: 8px 12px; }
                            .grade-label { color: rgba(255,255,255,0.5); font-size: 7px; text-transform: uppercase; letter-spacing: 1px; }
                            .grade-value { color: #60a5fa; font-size: 24px; font-weight: 900; }
                            .grade-score { color: rgba(255,255,255,0.3); font-size: 8px; }
                            .grade-score { color: rgba(255,255,255,0.3); font-size: 10px; }
                            .footer { display: flex; justify-content: space-between; padding: 10px 16px; background: rgba(0,0,0,0.3); margin-top: 12px; }
                            .footer-url { color: rgba(52,211,153,0.7); font-size: 10px; font-weight: 500; }
                            .footer-text { color: rgba(255,255,255,0.3); font-size: 9px; }
                            .card-info { padding: 12px; background: #192734; border-top: 1px solid #2f3336; }
                            .card-url { color: #8899a6; font-size: 12px; }
                            .card-title { color: #fff; font-size: 14px; font-weight: 600; margin-top: 4px; }
                            .card-desc { color: #8899a6; font-size: 13px; margin-top: 2px; }
                          </style>
                        </head>
                        <body>
                          <div class="twitter-card">
                            <div class="card-image">
                              <div class="header">
                                <div class="logo">
                                  <div class="logo-icon">BB</div>
                                  <span class="logo-text">BlackBox Farm</span>
                                </div>
                                <div class="token-badge">$${tokenStats.symbol}</div>
                              </div>
                              <div class="main-content">
                                <div class="hero">
                                  <div class="hero-label">Total Wallets</div>
                                  <div class="hero-total">${tokenStats.totalHolders.toLocaleString()}</div>
                                  <div class="hero-arrow">↓</div>
                                  <div class="hero-real-label">Real Holders</div>
                                  <div class="hero-real">${tokenStats.realHolders.toLocaleString()}</div>
                                  <div class="dust-badge"><span><span class="pct">${tokenStats.dustPercentage}%</span> are dust from failed txns</span></div>
                                </div>
                                <div class="breakdown">
                                  <div class="bar-row">
                                    <div class="bar-label whale"><span class="count">${tokenStats.whaleCount}</span><span class="text">Whales</span></div>
                                    <div class="bar"><div class="bar-fill whale" style="width: ${Math.max(whalePercent * 5, 8)}%"></div></div>
                                    <div class="bar-icon">🐋</div>
                                  </div>
                                  <div class="bar-row">
                                    <div class="bar-label strong"><span class="count">${tokenStats.strongCount}</span><span class="text">Strong</span></div>
                                    <div class="bar"><div class="bar-fill strong" style="width: ${Math.max(strongPercent * 2, 15)}%"></div></div>
                                    <div class="bar-icon">💪</div>
                                  </div>
                                  <div class="bar-row">
                                    <div class="bar-label active"><span class="count">${tokenStats.activeCount.toLocaleString()}</span><span class="text">Active</span></div>
                                    <div class="bar"><div class="bar-fill active" style="width: ${Math.max(activePercent, 40)}%"></div></div>
                                    <div class="bar-icon">🌱</div>
                                  </div>
                                  <div class="divider"></div>
                                  <div class="bar-row dust-row">
                                    <div class="bar-label dust"><span class="count">${tokenStats.dustCount.toLocaleString()}</span><span class="text">Dust</span></div>
                                    <div class="bar"><div class="bar-fill dust" style="width: ${dustPercent}%"></div></div>
                                    <div class="bar-icon">💨</div>
                                  </div>
                                </div>
                                <div class="grade">
                                  <div class="token-info">
                                    <div class="token-ticker">$${tokenStats.symbol}</div>
                                    <div class="token-ca">${tokenStats.tokenAddress.slice(0, 6)}...${tokenStats.tokenAddress.slice(-4)}</div>
                                  </div>
                                  <div class="grade-box">
                                    <div class="grade-label">Health</div>
                                    <div class="grade-value">${tokenStats.healthGrade}</div>
                                    <div class="grade-score">${tokenStats.healthScore}/100</div>
                                  </div>
                                </div>
                              </div>
                              <div class="footer">
                                <span class="footer-url">blackbox.farm/holders</span>
                                <span class="footer-text">Free Holder Analysis Report</span>
                              </div>
                            </div>
                            <div class="card-info">
                              <div class="card-url">blackbox.farm</div>
                              <div class="card-title">$${tokenStats.symbol} Holder Analysis - Only ${tokenStats.realHolders.toLocaleString()} Real Holders!</div>
                              <div class="card-desc">${tokenStats.dustPercentage}% of wallets are dust. See the real holder breakdown.</div>
                            </div>
                          </div>
                        </body>
                      </html>
                    `);
                    cardWindow.document.close();
                  }
                }}
              >
                <Code2 className="h-4 w-4 mr-2" />
                Preview Card Layout
              </Button>

              <Button 
                className="w-full bg-sky-500 hover:bg-sky-600"
                onClick={() => shareToTwitter()}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share on Twitter
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
