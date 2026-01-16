import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Code2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface TokenStats {
  symbol: string;
  name: string;
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
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [selectedApproach, setSelectedApproach] = useState<'A' | 'B' | null>(null);

  // Generate AI artistic image
  const generateAICard = async () => {
    setIsGeneratingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-share-card-ai', {
        body: { tokenStats }
      });
      
      if (error) throw error;
      if (data?.imageUrl) {
        setAiImage(data.imageUrl);
      }
    } catch (err) {
      console.error('Failed to generate AI card:', err);
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
                      <span className="text-[10px] w-12 text-right">🐋</span>
                      <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-sm"
                          style={{ width: `${Math.max(whalePercent * 5, 8)}%` }}
                        />
                      </div>
                      <div className="text-right w-20">
                        <span className="text-emerald-400 text-[11px] font-bold">{tokenStats.whaleCount}</span>
                        <span className="text-white/30 text-[9px] ml-1">Whales</span>
                      </div>
                    </div>
                    
                    {/* Strong */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] w-12 text-right">💪</span>
                      <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-sm"
                          style={{ width: `${Math.max(strongPercent * 2, 15)}%` }}
                        />
                      </div>
                      <div className="text-right w-20">
                        <span className="text-blue-400 text-[11px] font-bold">{tokenStats.strongCount}</span>
                        <span className="text-white/30 text-[9px] ml-1">Strong</span>
                      </div>
                    </div>
                    
                    {/* Active */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] w-12 text-right">🌱</span>
                      <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-sm"
                          style={{ width: `${Math.max(activePercent, 40)}%` }}
                        />
                      </div>
                      <div className="text-right w-20">
                        <span className="text-amber-400 text-[11px] font-bold">{tokenStats.activeCount.toLocaleString()}</span>
                        <span className="text-white/30 text-[9px] ml-1">Active</span>
                      </div>
                    </div>
                    
                    {/* Divider */}
                    <div className="border-t border-dashed border-gray-700 my-0.5" />
                    
                    {/* Dust - grayed out */}
                    <div className="flex items-center gap-2 opacity-50">
                      <span className="text-[10px] w-12 text-right">💨</span>
                      <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-gray-600 to-gray-500 rounded-sm"
                          style={{ width: `${dustPercent}%` }}
                        />
                      </div>
                      <div className="text-right w-20">
                        <span className="text-gray-400 text-[11px] font-bold">{tokenStats.dustCount.toLocaleString()}</span>
                        <span className="text-white/20 text-[9px] ml-1">Dust</span>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT SIDE - Health Grade Badge */}
                  <div className="flex flex-col items-center justify-center pl-3">
                    <div className={`rounded-xl bg-gradient-to-b ${getGradeBgColor(tokenStats.healthGrade)} border p-3 text-center`}>
                      <div className="text-white/50 text-[8px] uppercase tracking-wider mb-0.5">Health</div>
                      <div className={`text-4xl font-black ${getGradeColor(tokenStats.healthGrade)}`}>
                        {tokenStats.healthGrade}
                      </div>
                      <div className="text-white/30 text-[10px] mt-0.5">{tokenStats.healthScore}/100</div>
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
                variant="outline" 
                className="w-full border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                disabled
              >
                <Code2 className="h-4 w-4 mr-2" />
                Template Preview (Live Above)
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
