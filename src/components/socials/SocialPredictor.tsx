import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Brain, 
  Globe, 
  Sparkles, 
  Loader2, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  Search,
  RefreshCw,
  Copy,
  ExternalLink
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface PredictorResult {
  summary: string;
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  confidence: number;
  keyInsights: string[];
  riskFactors: string[];
  opportunities: string[];
  sources: string[];
  fullAnalysis: string;
}

export function SocialPredictor() {
  const [inputType, setInputType] = useState<'url' | 'topic'>('topic');
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PredictorResult | null>(null);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    if (!inputValue.trim()) {
      toast({
        title: 'Input Required',
        description: 'Please enter a URL or topic to analyze.',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('social-predictor-ai', {
        body: { 
          input: inputValue.trim(),
          type: inputType
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setResult(data);
      toast({
        title: 'Analysis Complete',
        description: 'AI has generated your predictive commentary.',
      });

    } catch (err) {
      console.error('Analysis error:', err);
      toast({
        title: 'Analysis Failed',
        description: err instanceof Error ? err.message : 'Failed to generate analysis',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'bearish': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'mixed': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            AI Social Predictor
          </h1>
        </div>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Generate intelligent observations and predictive commentary on any topic or URL using advanced AI analysis.
        </p>
      </div>

      {/* Input Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Analysis Input
          </CardTitle>
          <CardDescription>
            Enter a URL to analyze a specific page, or a topic for broader market/social analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={inputType} onValueChange={(v) => setInputType(v as 'url' | 'topic')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="topic" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Topic
              </TabsTrigger>
              <TabsTrigger value="url" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                URL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="topic" className="mt-4">
              <div className="space-y-2">
                <Label htmlFor="topic">Topic or Query</Label>
                <Textarea
                  id="topic"
                  placeholder="e.g., Solana meme coin market trends, AI crypto tokens analysis, NFT market sentiment..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
            </TabsContent>

            <TabsContent value="url" className="mt-4">
              <div className="space-y-2">
                <Label htmlFor="url">URL to Analyze</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://twitter.com/... or any article URL"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
              </div>
            </TabsContent>
          </Tabs>

          <Button 
            onClick={handleAnalyze} 
            disabled={isLoading || !inputValue.trim()}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                Generate AI Commentary
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-12 text-center">
            <div className="space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <Brain className="absolute inset-0 m-auto h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">AI is analyzing your input...</p>
                <p className="text-sm text-muted-foreground">
                  Performing multiple searches and generating intelligent observations
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary Card */}
          <Card className="border-primary/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  AI Prediction Summary
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className={getSentimentColor(result.sentiment)}>
                    {result.sentiment.toUpperCase()}
                  </Badge>
                  <Badge variant="outline">
                    {result.confidence}% Confidence
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-lg leading-relaxed">{result.summary}</p>
              <div className="mt-4 flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copyToClipboard(result.summary)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Summary
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setResult(null);
                    handleAnalyze();
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Insights Grid */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Key Insights */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  Key Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.keyInsights.map((insight, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Opportunities */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-green-500" />
                  Opportunities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.opportunities.map((opp, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <span>{opp}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Risk Factors */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Risk Factors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.riskFactors.map((risk, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Full Analysis */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Full AI Analysis
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copyToClipboard(result.fullAnalysis)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Full Report
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{result.fullAnalysis}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>

          {/* Sources */}
          {result.sources.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Analysis Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.sources.map((source, i) => (
                    <a
                      key={i}
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-muted text-xs hover:bg-muted/80 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {new URL(source).hostname.replace('www.', '')}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
