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
  whalePercentage: number;
  dustPercentage: number;
  imageUrl?: string;
}

// Mock data for demo
const mockTokenStats: TokenStats = {
  symbol: 'DEMO',
  name: 'Demo Token',
  price: 0.00001234,
  marketCap: 1250000,
  healthScore: 78,
  healthGrade: 'B+',
  totalHolders: 2847,
  whalePercentage: 12.5,
  dustPercentage: 45.2,
  imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=100&h=100&fit=crop'
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

  const formatPrice = (price: number) => {
    if (price < 0.00001) return price.toExponential(4);
    if (price < 1) return price.toFixed(8).replace(/\.?0+$/, '');
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const formatMarketCap = (mc: number) => {
    if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}M`;
    if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}K`;
    return `$${mc.toFixed(0)}`;
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'text-green-400';
    if (grade.startsWith('B')) return 'text-blue-400';
    if (grade.startsWith('C')) return 'text-yellow-400';
    return 'text-red-400';
  };

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

            {/* Option B: HTML Template */}
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

              {/* Template Preview - This IS what it looks like */}
              <div className="aspect-[1200/628] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg border border-border overflow-hidden relative p-4">
                {/* BlackBox Farm Branding */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-emerald-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-xs font-bold">BB</span>
                  </div>
                  <span className="text-white/80 text-xs font-medium">BlackBox Farm</span>
                </div>

                {/* Main Content */}
                <div className="flex h-full items-center pt-6">
                  {/* Left: Token Info */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold">
                        {tokenStats.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-white font-bold text-lg">${tokenStats.symbol}</div>
                        <div className="text-white/60 text-xs">{tokenStats.name}</div>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="text-green-400 text-xl font-bold">${formatPrice(tokenStats.price)}</div>
                      <div className="text-white/60 text-xs">MCap: {formatMarketCap(tokenStats.marketCap)}</div>
                    </div>
                  </div>

                  {/* Right: Health Score */}
                  <div className="flex-1 flex flex-col items-center">
                    <div className="text-white/60 text-xs mb-1">Holder Health Score</div>
                    <div className={`text-4xl font-black ${getGradeColor(tokenStats.healthGrade)}`}>
                      {tokenStats.healthGrade}
                    </div>
                    <div className="text-white/40 text-xs">{tokenStats.healthScore}/100</div>
                  </div>

                  {/* Stats Column */}
                  <div className="flex-1 space-y-2 text-right pr-2">
                    <div>
                      <div className="text-white/60 text-xs">Holders</div>
                      <div className="text-white font-bold">{tokenStats.totalHolders.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-white/60 text-xs">Whale %</div>
                      <div className="text-red-400 font-bold">{tokenStats.whalePercentage}%</div>
                    </div>
                    <div>
                      <div className="text-white/60 text-xs">Dust %</div>
                      <div className="text-yellow-400 font-bold">{tokenStats.dustPercentage}%</div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  <span className="text-white/40 text-[10px]">blackboxfarm.lovable.app/holders</span>
                  <span className="text-white/40 text-[10px]">Holder Analysis Report</span>
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
