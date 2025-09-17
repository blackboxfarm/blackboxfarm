import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Search, ExternalLink, Globe, Twitter, MessageCircle, Github, Check, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface TokenProfile {
  mint: string;
  name?: string;
  symbol?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  github?: string;
  icon?: string;
  source: string;
  url: string;
  verified?: boolean;
  fetchedAt: string;
}

interface ScanResults {
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
  profiles: TokenProfile[];
  consensus: {
    name?: string;
    symbol?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    github?: string;
    icon?: string;
  };
}

export const BreadCrumbsInterface = () => {
  const [tokenAddress, setTokenAddress] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ScanResults | null>(null);
  const { toast } = useToast();

  const validateTokenAddress = (address: string): boolean => {
    // Basic Solana address validation
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  };

  const handleScan = async () => {
    if (!tokenAddress.trim()) {
      toast({
        title: "Error",
        description: "Please enter a token address",
        variant: "destructive",
      });
      return;
    }

    if (!validateTokenAddress(tokenAddress.trim())) {
      toast({
        title: "Error", 
        description: "Please enter a valid Solana token address",
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);
    setProgress(0);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('breadcrumbs-scanner', {
        body: { 
          tokenMint: tokenAddress.trim()
        }
      });

      if (error) throw error;

      setResults(data);
      setProgress(100);

      toast({
        title: "Scan Complete",
        description: `Successfully scanned ${data.summary.successful} out of ${data.summary.total} platforms`,
      });

    } catch (error: any) {
      console.error('Breadcrumbs scan error:', error);
      toast({
        title: "Scan Failed",
        description: error.message || "Failed to scan token metadata",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const getSocialIcon = (type: string) => {
    switch (type) {
      case 'website': return <Globe className="h-4 w-4" />;
      case 'twitter': return <Twitter className="h-4 w-4" />;
      case 'telegram': return <MessageCircle className="h-4 w-4" />;
      case 'discord': return <MessageCircle className="h-4 w-4" />;
      case 'github': return <Github className="h-4 w-4" />;
      default: return <ExternalLink className="h-4 w-4" />;
    }
  };

  const getSourceColor = (source: string) => {
    const priority = {
      'onchain': 'bg-green-500',
      'coingecko': 'bg-blue-500',
      'coinmarketcap': 'bg-purple-500',
      'dexscreener': 'bg-orange-500',
      'birdeye': 'bg-yellow-500',
      'solscan': 'bg-cyan-500',
      'geckoterminal': 'bg-pink-500',
    };
    return priority[source.toLowerCase()] || 'bg-gray-500';
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Scanner Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Token BreadCrumbs Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter Solana token address (e.g., So11111111111111111111111111111111111111112)"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              disabled={isScanning}
            />
            <Button 
              onClick={handleScan} 
              disabled={isScanning}
              className="min-w-[100px]"
            >
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scanning
                </>
              ) : (
                'Scan'
              )}
            </Button>
          </div>
          
          {isScanning && (
            <div className="space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground text-center">
                Scanning across 50+ platforms for token metadata and socials...
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Tabs defaultValue="consensus" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="consensus">Consensus View</TabsTrigger>
            <TabsTrigger value="platforms">Platform Results</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* Consensus View */}
          <TabsContent value="consensus" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Token Consensus Data</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Aggregated data from {results.summary.successful} successful platform scans
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Name</label>
                    <p className="text-lg font-semibold">{results.consensus.name || 'Unknown'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Symbol</label>
                    <p className="text-lg font-semibold">{results.consensus.symbol || 'Unknown'}</p>
                  </div>
                </div>

                {/* Socials */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-3 block">Social Links</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(results.consensus).map(([key, value]) => {
                      if (!value || ['name', 'symbol', 'icon'].includes(key)) return null;
                      return (
                        <div key={key} className="flex items-center gap-2 p-2 border rounded">
                          {getSocialIcon(key)}
                          <span className="text-sm font-medium capitalize">{key}:</span>
                          <a 
                            href={value} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline truncate flex-1"
                          >
                            {value}
                          </a>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Platform Results */}
          <TabsContent value="platforms" className="space-y-4">
            <div className="grid gap-4">
              {results.profiles.map((profile, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={`${getSourceColor(profile.source)} text-white`}>
                          {profile.source}
                        </Badge>
                        {profile.verified && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <Check className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                      </div>
                      <a 
                        href={profile.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm"
                      >
                        View Source <ExternalLink className="h-3 w-3 inline ml-1" />
                      </a>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Name:</span>
                        <span className="ml-2">{profile.name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Symbol:</span>
                        <span className="ml-2">{profile.symbol || 'N/A'}</span>
                      </div>
                    </div>

                    {/* Socials */}
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(profile).map(([key, value]) => {
                        if (!value || !['website', 'twitter', 'telegram', 'discord', 'github'].includes(key)) return null;
                        return (
                          <a
                            key={key}
                            href={value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs hover:bg-muted/80"
                          >
                            {getSocialIcon(key)}
                            <span className="capitalize">{key}</span>
                          </a>
                        );
                      })}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Fetched: {new Date(profile.fetchedAt).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Scan Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total Platforms:</span>
                      <span className="font-medium">{results.summary.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-600">Successful:</span>
                      <span className="font-medium text-green-600">{results.summary.successful}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-600">Failed:</span>
                      <span className="font-medium text-red-600">{results.summary.failed}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Success Rate:</span>
                      <span>{Math.round((results.summary.successful / results.summary.total) * 100)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Data Completeness</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Name:</span>
                      <span className={results.consensus.name ? "text-green-600" : "text-red-600"}>
                        {results.consensus.name ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Symbol:</span>
                      <span className={results.consensus.symbol ? "text-green-600" : "text-red-600"}>
                        {results.consensus.symbol ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Website:</span>
                      <span className={results.consensus.website ? "text-green-600" : "text-red-600"}>
                        {results.consensus.website ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Twitter:</span>
                      <span className={results.consensus.twitter ? "text-green-600" : "text-red-600"}>
                        {results.consensus.twitter ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Source Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {Object.entries(
                      results.profiles.reduce((acc, profile) => {
                        acc[profile.source] = (acc[profile.source] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([source, count]) => (
                      <div key={source} className="flex justify-between">
                        <span className="capitalize">{source}:</span>
                        <span className="font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};