import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, RotateCcw, Share2, Search, Send, Loader2, Save, Check, Play, Square, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { IntelXBotActivityLog } from './IntelXBotActivityLog';
import { SurgeAlertsPanel } from '@/components/admin/SurgeAlertsPanel';
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_VARIABLES,
  processTemplate,
  fetchAllTemplates,
  updateTemplate,
  setActiveIntelTemplate,
  type TokenShareData,
  type TemplateName,
  type TemplateRecord,
} from '@/lib/share-template';
import { HolderBreakdownPanel, type GranularTierCounts } from './HolderBreakdownPanel';

interface CronStatus {
  schedulersActive: number;
  posterActive: boolean;
  lastChecked: Date | null;
  pendingQueue: number;
}

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

export function ShareCardDemo({ tokenStats: initialTokenStats = mockTokenStats }: { tokenStats?: TokenStats }) {
  const [activeTab, setActiveTab] = useState<TemplateName>('small');
  const [templates, setTemplates] = useState<Record<TemplateName, string>>(DEFAULT_TEMPLATES);
  const [activeIntelTemplate, setActiveIntelTemplateState] = useState<'small' | 'large'>('small');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState<Record<TemplateName, boolean>>({
    small: false,
    large: false,
    shares: false,
  });
  
  const [tokenMint, setTokenMint] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [fetchedStats, setFetchedStats] = useState<TokenStats | null>(null);
  const [granularTiers, setGranularTiers] = useState<GranularTierCounts | null>(null);

  // Intel XBot status
  const [cronStatus, setCronStatus] = useState<CronStatus>({
    schedulersActive: 0,
    posterActive: false,
    lastChecked: null,
    pendingQueue: 0,
  });
  const [isStartingXBot, setIsStartingXBot] = useState(false);
  const [isStoppingXBot, setIsStoppingXBot] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const tokenStats = fetchedStats || initialTokenStats;

  // Check Intel XBot status from database
  const checkXBotStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      // Query cron jobs status using RPC (cast to any since types may not be updated)
      const { data: cronData, error: cronError } = await (supabase.rpc as any)('get_cron_job_status');
      
      // Query pending queue items
      const { count: pendingCount } = await supabase
        .from('holders_intel_post_queue')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'processing']);

      if (cronError) {
        console.error('Failed to get cron status:', cronError);
        // Fallback: just check queue
        setCronStatus(prev => ({
          ...prev,
          pendingQueue: pendingCount || 0,
          lastChecked: new Date(),
        }));
      } else if (cronData) {
        const jobs = cronData as { jobname: string; active: boolean }[];
        const schedulers = jobs.filter(j => j.jobname.includes('scheduler') && j.active).length;
        const poster = jobs.some(j => j.jobname.includes('poster') && j.active);
        
        setCronStatus({
          schedulersActive: schedulers,
          posterActive: poster,
          lastChecked: new Date(),
          pendingQueue: pendingCount || 0,
        });
      }
    } catch (err) {
      console.error('Error checking XBot status:', err);
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);

  const handleStartXBot = async () => {
    setIsStartingXBot(true);
    try {
      const { data, error } = await supabase.functions.invoke('intel-xbot-start');
      if (error) throw error;
      toast.success(data?.message || 'Intel XBot started!');
      await checkXBotStatus();
    } catch (err: any) {
      console.error('Start XBot failed:', err);
      toast.error(`Failed to start: ${err.message}`);
    } finally {
      setIsStartingXBot(false);
    }
  };

  const handleStopXBot = async () => {
    setIsStoppingXBot(true);
    try {
      // Clear queue items
      const { data: cleared } = await supabase
        .from('holders_intel_post_queue')
        .update({ status: 'skipped', error_message: 'Manual stop' })
        .in('status', ['pending', 'processing'])
        .select('id');
      
      // Kill crons
      const { error } = await supabase.functions.invoke('intel-xbot-kill');
      if (error) console.warn('Kill function error:', error);
      
      toast.success(`Intel XBot stopped. Cleared ${cleared?.length || 0} queued items.`);
      await checkXBotStatus();
    } catch (err: any) {
      console.error('Stop XBot failed:', err);
      toast.error(`Failed to stop: ${err.message}`);
    } finally {
      setIsStoppingXBot(false);
    }
  };

  // Load templates and check XBot status on mount
  useEffect(() => {
    loadTemplates();
    checkXBotStatus();
  }, [checkXBotStatus]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const dbTemplates = await fetchAllTemplates();
      
      if (dbTemplates.length > 0) {
        const templateMap: Record<TemplateName, string> = { ...DEFAULT_TEMPLATES };
        let activeIntel: 'small' | 'large' = 'small';
        
        dbTemplates.forEach((t: TemplateRecord) => {
          templateMap[t.template_name] = t.template_text;
          if ((t.template_name === 'small' || t.template_name === 'large') && t.is_active) {
            activeIntel = t.template_name;
          }
        });
        
        setTemplates(templateMap);
        setActiveIntelTemplateState(activeIntel);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
      toast.error('Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveTemplate = async (name: TemplateName) => {
    setIsSaving(true);
    try {
      const success = await updateTemplate(name, templates[name]);
      if (success) {
        setSavedStatus(prev => ({ ...prev, [name]: true }));
        setTimeout(() => {
          setSavedStatus(prev => ({ ...prev, [name]: false }));
        }, 2000);
        toast.success(`${name.charAt(0).toUpperCase() + name.slice(1)} template saved!`);
      } else {
        toast.error('Failed to save template');
      }
    } catch (err) {
      toast.error('Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (name: 'small' | 'large') => {
    try {
      const success = await setActiveIntelTemplate(name);
      if (success) {
        setActiveIntelTemplateState(name);
        toast.success(`${name.charAt(0).toUpperCase() + name.slice(1)} template is now active for Intel XBot`);
      } else {
        toast.error('Failed to switch active template');
      }
    } catch (err) {
      toast.error('Failed to switch active template');
    }
  };

  const handleResetTemplate = (name: TemplateName) => {
    setTemplates(prev => ({ ...prev, [name]: DEFAULT_TEMPLATES[name] }));
    toast.info('Template reset to default (not saved yet)');
  };

  const tokenData: TokenShareData = {
    ticker: tokenStats.symbol,
    name: tokenStats.name,
    tokenAddress: tokenStats.tokenAddress,
    totalWallets: tokenStats.totalHolders,
    realHolders: tokenStats.realHolders,
    dustCount: tokenStats.dustCount,
    dustPercentage: tokenStats.dustPercentage,
    whales: tokenStats.whaleCount,
    serious: tokenStats.strongCount,
    realRetail: granularTiers?.realCount || 0,
    casual: (granularTiers?.smallCount || 0) + (granularTiers?.mediumCount || 0) + (granularTiers?.largeCount || 0),
    retail: tokenStats.activeCount,
    healthGrade: tokenStats.healthGrade,
    healthScore: tokenStats.healthScore,
  };

  const handleFetch = async () => {
    if (!tokenMint.trim()) {
      toast.error('Please enter a token address');
      return;
    }

    setIsFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('bagless-holders-report', {
        body: { tokenMint: tokenMint.trim() }
      });

      if (error) throw error;
      if (!data || !data.holders) throw new Error('No holder data returned');

      const totalHolders = data.totalHolders || 0;
      const dustCount = data.tierBreakdown?.dust ?? data.dustWallets ?? data.simpleTiers?.dust?.count ?? 0;
      const dustPercentage = totalHolders > 0 
        ? parseFloat(((dustCount / totalHolders) * 100).toFixed(2))
        : 0;

      const granular: GranularTierCounts = {
        totalHolders,
        dustCount,
        realHolders: data.realHolders ?? data.realWallets ?? 0,
        lpCount: data.liquidityPoolsDetected ?? 0,
        smallCount: data.smallWallets ?? 0,
        mediumCount: data.mediumWallets ?? 0,
        largeCount: data.largeWallets ?? 0,
        realCount: data.realWalletCount ?? data.tierBreakdown?.real ?? 0,
        bossCount: data.bossWallets ?? 0,
        kingpinCount: data.kingpinWallets ?? 0,
        superBossCount: data.superBossWallets ?? 0,
        babyWhaleCount: data.babyWhaleWallets ?? 0,
        trueWhaleCount: data.trueWhaleWallets ?? 0,
      };

      const stats: TokenStats = {
        symbol: data.tokenSymbol || data.symbol || 'UNKNOWN',
        name: data.tokenName || data.name || data.tokenSymbol || data.symbol || 'Unknown Token',
        tokenAddress: tokenMint.trim(),
        price: data.tokenPriceUSD || 0,
        marketCap: data.marketCap || (typeof data.totalBalance === 'number' && typeof data.tokenPriceUSD === 'number'
            ? data.totalBalance * data.tokenPriceUSD : 0),
        healthScore: data.stabilityScore ?? data.healthScore?.score ?? 0,
        healthGrade: data.stabilityGrade ?? data.healthScore?.grade ?? 'N/A',
        totalHolders,
        realHolders: granular.realHolders,
        whaleCount: data.tierBreakdown?.whale ?? data.simpleTiers?.whales?.count ?? 0,
        strongCount: data.tierBreakdown?.serious ?? data.simpleTiers?.serious?.count ?? 0,
        activeCount: data.tierBreakdown?.retail ?? data.simpleTiers?.retail?.count ?? 0,
        dustCount,
        dustPercentage,
      };

      setFetchedStats(stats);
      setGranularTiers(granular);
      toast.success(`Fetched data for $${stats.symbol}`);
    } catch (err: any) {
      console.error('Fetch error:', err);
      toast.error(err.message || 'Failed to fetch token data');
    } finally {
      setIsFetching(false);
    }
  };

  const handlePostToTwitter = async () => {
    if (!fetchedStats) {
      toast.error('Please fetch token data first');
      return;
    }

    setIsPosting(true);
    try {
      // Use the active template for posting
      const tweetText = processTemplate(templates[activeIntelTemplate], tokenData);

      const { data, error } = await supabase.functions.invoke('post-share-card-twitter', {
        body: { tweetText, twitterHandle: 'HoldersIntel' }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(
          <div>
            Tweet posted! <a href={data.tweetUrl} target="_blank" rel="noopener noreferrer" className="underline">View tweet</a>
          </div>
        );
      } else {
        throw new Error(data?.error || 'Failed to post tweet');
      }
    } catch (err: any) {
      console.error('Post error:', err);
      toast.error(err.message || 'Failed to post to Twitter');
    } finally {
      setIsPosting(false);
    }
  };

  const shareToTwitter = () => {
    const tweetText = processTemplate(templates.shares, tokenData);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };

  const copyTemplate = (name: TemplateName) => {
    navigator.clipboard.writeText(processTemplate(templates[name], tokenData));
    toast.success('Tweet text copied!');
  };

  if (isLoading) {
    return (
      <Card className="bg-card/50 border-border">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading templates...
        </CardContent>
      </Card>
    );
  }

  const isXBotRunning = cronStatus.posterActive && cronStatus.schedulersActive >= 3;

  return (
    <div className="space-y-6">
      {/* Intel XBot Control Panel */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                🤖 Intel XBot Controls
              </CardTitle>
              <CardDescription>
                Manage automated posting to @HoldersIntel
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Status Badge */}
              <Badge 
                variant={isXBotRunning ? "default" : "secondary"} 
                className={`${isXBotRunning ? 'bg-green-600 hover:bg-green-600' : 'bg-muted'}`}
              >
                {isXBotRunning ? '✓ RUNNING' : '⏹ STOPPED'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="text-center">
              <p className="text-2xl font-bold">{cronStatus.schedulersActive}</p>
              <p className="text-xs text-muted-foreground">Schedulers Active</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{cronStatus.posterActive ? '✓' : '✗'}</p>
              <p className="text-xs text-muted-foreground">Poster Job</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{cronStatus.pendingQueue}</p>
              <p className="text-xs text-muted-foreground">Queue Items</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-mono">
                {cronStatus.lastChecked 
                  ? cronStatus.lastChecked.toLocaleTimeString() 
                  : '--:--:--'}
              </p>
              <p className="text-xs text-muted-foreground">Last Checked</p>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleStartXBot}
              disabled={isStartingXBot || isStoppingXBot}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {isStartingXBot ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {isStartingXBot ? 'Starting...' : 'START'}
            </Button>
            <Button
              onClick={handleStopXBot}
              disabled={isStartingXBot || isStoppingXBot}
              variant="destructive"
              className="flex-1"
            >
              {isStoppingXBot ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Square className="h-4 w-4 mr-2" />
              )}
              {isStoppingXBot ? 'Stopping...' : 'STOP'}
            </Button>
            <Button
              onClick={checkXBotStatus}
              disabled={isCheckingStatus}
              variant="outline"
              size="icon"
            >
              <RefreshCw className={`h-4 w-4 ${isCheckingStatus ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <IntelXBotActivityLog />

      {/* Surge Alerts */}
      <SurgeAlertsPanel />

      {/* Tweet Templates Card */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            ✏️ Tweet Templates
          </CardTitle>
          <CardDescription>
            Manage templates for Intel XBot automatic posts and public sharing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TemplateName)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="small" className="relative">
              Small
              {activeIntelTemplate === 'small' && (
                <Badge variant="default" className="absolute -top-2 -right-2 text-[10px] px-1 py-0">
                  Active
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="large" className="relative">
              Large
              {activeIntelTemplate === 'large' && (
                <Badge variant="default" className="absolute -top-2 -right-2 text-[10px] px-1 py-0">
                  Active
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="shares">Shares</TabsTrigger>
          </TabsList>

          {(['small', 'large', 'shares'] as TemplateName[]).map((name) => (
            <TabsContent key={name} value={name} className="space-y-4">
              {/* Active toggle for small/large */}
              {(name === 'small' || name === 'large') && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <Label className="font-medium">Active for Intel XBot</Label>
                    <p className="text-xs text-muted-foreground">
                      {activeIntelTemplate === name 
                        ? 'This template is used for automatic posts' 
                        : 'Toggle to use this template for automatic posts'}
                    </p>
                  </div>
                  <Switch
                    checked={activeIntelTemplate === name}
                    onCheckedChange={() => handleToggleActive(name)}
                  />
                </div>
              )}

              {name === 'shares' && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <Label className="font-medium">Public Share Template</Label>
                  <p className="text-xs text-muted-foreground">
                    Used when users click the Share button on the holders page
                  </p>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Textarea
                    value={templates[name]}
                    onChange={(e) => setTemplates(prev => ({ ...prev, [name]: e.target.value }))}
                    rows={14}
                    className="font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResetTemplate(name)}
                      className="text-xs"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyTemplate(name)}
                      className="text-xs"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSaveTemplate(name)}
                      disabled={isSaving}
                      className="text-xs"
                    >
                      {savedStatus[name] ? (
                        <Check className="h-3 w-3 mr-1" />
                      ) : (
                        <Save className="h-3 w-3 mr-1" />
                      )}
                      {savedStatus[name] ? 'Saved!' : 'Save'}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>
                    Preview 
                    {fetchedStats && <Badge variant="secondary" className="ml-2">${fetchedStats.symbol}</Badge>}
                  </Label>
                  <div className="p-3 bg-muted/50 rounded-lg border text-sm whitespace-pre-wrap min-h-[300px]">
                    {processTemplate(templates[name], tokenData)}
                  </div>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
        
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

        {/* Test with Shares template */}
        <div className="pt-4 border-t border-border">
          <Button 
            className="w-full bg-sky-500 hover:bg-sky-600"
            onClick={shareToTwitter}
          >
            <Share2 className="h-4 w-4 mr-2" />
            Test Shares Template on X
          </Button>
        </div>

        {/* Token Fetch + API Post Section */}
        <div className="pt-4 border-t border-border space-y-3">
          <Label className="text-sm font-medium">
            Manual API Post (@HoldersIntel) - Uses {activeIntelTemplate.charAt(0).toUpperCase() + activeIntelTemplate.slice(1)} Template
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="Enter token address..."
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              className="flex-1 font-mono text-sm"
            />
            <Button
              variant="outline"
              onClick={handleFetch}
              disabled={isFetching || !tokenMint.trim()}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-2">Fetch</span>
            </Button>
          </div>
          
          <Button 
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            onClick={handlePostToTwitter}
            disabled={isPosting || !fetchedStats}
          >
            {isPosting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Post to @HoldersIntel ({activeIntelTemplate})
          </Button>

          {fetchedStats && granularTiers && (
            <HolderBreakdownPanel stats={granularTiers} symbol={fetchedStats.symbol} />
          )}
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
