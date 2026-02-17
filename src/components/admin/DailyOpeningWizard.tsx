import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, ChevronRight, ChevronLeft, Sparkles, Clock, Zap, AlertTriangle, Eye, Bot, TrendingUp, TrendingDown, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { StepIcon } from '@/components/ui/StepIcon';

interface WizardStep {
  id: string;
  title: string;
  description: string;
  category: 'automated' | 'manual' | 'review';
  cronStatus?: string;
  action?: () => void;
  actionLabel?: string;
  navigateTo?: string;
  tips: string[];
}

interface DailyStats {
  totalPositions: number;
  openPositions: number;
  closedToday: number;
  stopLossHits: number;
  profitExits: number;
  pendingCommentScans: number;
  rejectedTokens24h: number;
  watchlistCount: number;
}

export default function DailyOpeningWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDailyStats();
  }, []);

  async function fetchDailyStats() {
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [
        { count: totalPositions },
        { count: openPositions },
        { count: closedToday },
        { count: stopLossHits },
        { count: profitExits },
        { count: pendingCommentScans },
        { count: rejectedTokens24h },
        { count: watchlistCount },
      ] = await Promise.all([
        supabase.from('banker_pool_trades').select('*', { count: 'exact', head: true }),
        supabase.from('banker_pool_trades').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('banker_pool_trades').select('*', { count: 'exact', head: true }).eq('status', 'closed').gte('exited_at', yesterday.toISOString()),
        supabase.from('banker_pool_trades').select('*', { count: 'exact', head: true }).eq('exit_reason', 'stop_loss').gte('exited_at', yesterday.toISOString()),
        supabase.from('banker_pool_trades').select('*', { count: 'exact', head: true }).eq('exit_reason', 'take_profit').gte('exited_at', yesterday.toISOString()),
        supabase.from('pumpfun_watchlist').select('*', { count: 'exact', head: true }).is('comment_scan_at', null).in('status', ['watching', 'qualified', 'buy_now']),
        supabase.from('pumpfun_watchlist').select('*', { count: 'exact', head: true }).eq('status', 'rejected').gte('created_at', yesterday.toISOString()),
        supabase.from('pumpfun_watchlist').select('*', { count: 'exact', head: true }).in('status', ['watching', 'qualified', 'buy_now']),
      ]);

      setStats({
        totalPositions: totalPositions || 0,
        openPositions: openPositions || 0,
        closedToday: closedToday || 0,
        stopLossHits: stopLossHits || 0,
        profitExits: profitExits || 0,
        pendingCommentScans: pendingCommentScans || 0,
        rejectedTokens24h: rejectedTokens24h || 0,
        watchlistCount: watchlistCount || 0,
      });
    } catch (err) {
      console.error('Error fetching daily stats:', err);
    } finally {
      setLoading(false);
    }
  }

  const steps: WizardStep[] = [
    {
      id: 'overnight-summary',
      title: '📊 Overnight Summary',
      description: 'Review what happened while you were away — positions opened/closed, stop losses hit, profit exits taken.',
      category: 'review',
      tips: [
        `${stats?.openPositions || 0} open positions right now`,
        `${stats?.closedToday || 0} positions closed in last 24h`,
        `${stats?.stopLossHits || 0} stop-loss exits, ${stats?.profitExits || 0} profit exits`,
        'Check the Candidates tab for any new qualified tokens',
      ],
      navigateTo: 'candidates',
    },
    {
      id: 'stop-loss-recovery',
      title: '🔄 Stop-Loss Recovery Review',
      description: 'Check tokens that hit stop-loss — did any recover? Should we adjust thresholds?',
      category: 'automated',
      cronStatus: 'backcheck-stop-loss-4h — runs every 4 hours automatically',
      tips: [
        'Recovery tab shows tokens that bounced back after stop-loss exit',
        'Look for patterns: are stop-losses too tight on certain token types?',
        'Today\'s fix: Discovery Price Gate now prevents buying below discovery price',
      ],
      navigateTo: 'recovery',
    },
    {
      id: 'rejected-backcheck',
      title: '🚫 Rejected Tokens Backcheck',
      description: 'Did any rejected tokens moon? Learn from missed opportunities.',
      category: 'automated',
      cronStatus: 'backcheck-rejected-6h — runs every 6 hours automatically',
      tips: [
        `${stats?.rejectedTokens24h || 0} tokens rejected in last 24h`,
        'Look for false negatives — tokens that were rejected but pumped',
        'Use this to tune qualification thresholds',
      ],
      navigateTo: 'rejected',
    },
    {
      id: 'profit-exit-review',
      title: '💰 Profit Exit Review',
      description: 'Did we exit too early? Check if sold tokens kept pumping.',
      category: 'review',
      tips: [
        'Compare exit price vs current price for recent profit exits',
        'If many tokens kept pumping 2-5x after exit, consider loosening trailing stops',
        'Retrace tab shows detailed price action after your exits',
      ],
      navigateTo: 'profit-exits',
    },
    {
      id: 'comment-bot-scan',
      title: '🤖 Comment Bot Scanner Status',
      description: 'Review bot activity on watchlist tokens. Identify shill networks.',
      category: 'automated',
      cronStatus: 'pumpfun-comment-scanner-backfill — runs every 10 min, 3 tokens/batch',
      tips: [
        `${stats?.pendingCommentScans || 0} tokens still awaiting comment scan`,
        'Backfill is running automatically with rate limiting (3 tokens every 10 min)',
        'Today\'s fix: Username entropy is metadata-only, NOT used for bot detection',
        'Key signals: shill phrases ("iykyk", "send it") + cross-token duplicate messages',
      ],
    },
    {
      id: 'discovery-price-gate',
      title: '🚧 Discovery Price Gate Check',
      description: 'Verify the new gate is working — blocking buys below discovery price.',
      category: 'automated',
      cronStatus: 'Built into pumpfun-fantasy-executor (runs every minute)',
      tips: [
        'NEW TODAY: Tokens are now blocked if entry price < discovery price',
        'Check entry_flags in recent trades for "below_discovery" flags',
        'This prevents buying into downward momentum after initial discovery',
        'Config: block_below_discovery_enabled + block_below_discovery_pct in monitor config',
      ],
    },
    {
      id: 'watchlist-health',
      title: '👁️ Watchlist Health',
      description: 'Check pipeline flow — are tokens flowing through correctly?',
      category: 'review',
      tips: [
        `${stats?.watchlistCount || 0} tokens currently in watchlist pipeline`,
        'Pipeline: pending_triage → watching → qualified → buy_now',
        'Token discovery runs every minute (pumpfun-new-token-monitor)',
        'Watchlist monitor qualifies tokens every minute',
      ],
      navigateTo: 'candidates',
    },
  ];

  const progress = (completedSteps.size / steps.length) * 100;

  function toggleComplete(stepId: string) {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  }

  const categoryColors = {
    automated: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    manual: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    review: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  };

  const categoryLabels = {
    automated: '⚡ Automated (Cron)',
    manual: '👋 Manual Action',
    review: '👁️ Review & Decide',
  };

  if (loading) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="p-8 text-center text-muted-foreground">
          Loading daily stats...
        </CardContent>
      </Card>
    );
  }

  const step = steps[currentStep];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-primary" />
              <div>
                <CardTitle className="text-lg">Daily Opening Wizard</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-medium">{completedSteps.size}/{steps.length} complete</span>
              <Progress value={progress} className="w-32 mt-1 h-2" />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Step Navigation */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setCurrentStep(i)}
            className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              i === currentStep
                ? 'bg-primary text-primary-foreground'
                : completedSteps.has(s.id)
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {completedSteps.has(s.id) ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{s.title.replace(/^[^\s]+\s/, '')}</span>
            <span className="sm:hidden">{i + 1}</span>
          </button>
        ))}
      </div>

      {/* Current Step Detail */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{step.title.split(' ')[0]}</span>
              <div>
                <CardTitle className="text-base">{step.title.replace(/^[^\s]+\s/, '')}</CardTitle>
                <Badge variant="outline" className={`mt-1 text-xs ${categoryColors[step.category]}`}>
                  {categoryLabels[step.category]}
                </Badge>
              </div>
            </div>
            <Button
              variant={completedSteps.has(step.id) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleComplete(step.id)}
              className={completedSteps.has(step.id) ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            >
              {completedSteps.has(step.id) ? (
                <><CheckCircle2 className="h-4 w-4 mr-1" /> Done</>
              ) : (
                'Mark Done'
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{step.description}</p>

          {step.cronStatus && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/5 border border-emerald-500/10">
              <Zap className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              <span className="text-xs text-emerald-400 font-mono">{step.cronStatus}</span>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <Eye className="h-4 w-4" /> What to look for:
            </h4>
            <ul className="space-y-1.5">
              {step.tips.map((tip, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>

            {step.navigateTo && (
              <p className="text-xs text-muted-foreground">
                → Check the <span className="font-medium text-foreground">{step.navigateTo}</span> tab
              </p>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                toggleComplete(step.id);
                setCurrentStep(Math.min(steps.length - 1, currentStep + 1));
              }}
              disabled={currentStep === steps.length - 1}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Automation Summary */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-400" /> Active Cron Jobs (fully automated)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
            {[
              { name: 'pumpfun-new-token-monitor', schedule: 'Every 1 min' },
              { name: 'pumpfun-watchlist-monitor', schedule: 'Every 1 min' },
              { name: 'pumpfun-fantasy-executor', schedule: 'Every 1 min' },
              { name: 'pumpfun-fantasy-sell-monitor', schedule: 'Every 1 min' },
              { name: 'pumpfun-dev-wallet-monitor', schedule: 'Every 3 min' },
              { name: 'pumpfun-global-safeguards', schedule: 'Every 5 min' },
              { name: 'backcheck-stop-loss-4h', schedule: 'Every 4 hours' },
              { name: 'backcheck-rejected-6h', schedule: 'Every 6 hours' },
              { name: 'comment-scanner-backfill', schedule: 'Every 10 min' },
              { name: 'developer-integrity-hourly', schedule: 'Every 1 hour' },
            ].map(job => (
              <div key={job.name} className="flex items-center justify-between px-2 py-1.5 rounded bg-background/50">
                <span className="text-muted-foreground">{job.name}</span>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {job.schedule}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
