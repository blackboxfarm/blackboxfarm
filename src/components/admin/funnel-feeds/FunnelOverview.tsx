import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface SourceStats {
  source: string;
  label: string;
  emoji: string;
  total: number;
  posted: number;
  pending: number;
  unique: number; // tokens not seen from other sources
}

export function FunnelOverview() {
  const [stats, setStats] = useState<SourceStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUniqueTokens, setTotalUniqueTokens] = useState(0);

  const fetchStats = async () => {
    setLoading(true);

    // Fetch all post queue entries with trigger_source
    const { data: queue } = await supabase
      .from('holders_intel_post_queue')
      .select('token_mint, trigger_source, status')
      .order('scheduled_at', { ascending: false })
      .limit(5000);

    const items = queue || [];

    // Categorize by source channel
    const categories: Record<string, { label: string; emoji: string; filter: (s: string | null) => boolean }> = {
      funnel_feed: {
        label: 'Telegram MTProto',
        emoji: '📡',
        filter: (s) => s === 'funnel_feed' || (s || '').startsWith('funnel_feed:'),
      },
      dex_trending: {
        label: 'Dex/CloudFlare',
        emoji: '☁️',
        filter: (s) => s === 'dex_trending' || s === 'cloudflare' || (s || '').includes('trending'),
      },
      bubbles: {
        label: 'Bubbles/Holders',
        emoji: '🫧',
        filter: (s) => (s || '').includes('bubble') || (s || '').includes('holder') || s === 'public_query' || s === 'subscriber_query',
      },
      bot_dm: {
        label: 'Bot DM',
        emoji: '🤖',
        filter: (s) => (s || '').includes('bot') || (s || '').includes('telegram'),
      },
      other: {
        label: 'Other / Manual',
        emoji: '📋',
        filter: () => true, // catch-all
      },
    };

    // Track which tokens are seen in which category for uniqueness
    const tokensByCategory: Record<string, Set<string>> = {};
    const catKeys = Object.keys(categories);

    const results: SourceStats[] = [];

    for (const key of catKeys) {
      tokensByCategory[key] = new Set();
    }

    // Assign each item to first matching category
    const assigned = items.map(item => {
      for (const key of catKeys) {
        if (key === 'other') continue;
        if (categories[key].filter(item.trigger_source)) {
          tokensByCategory[key].add(item.token_mint);
          return { ...item, category: key };
        }
      }
      tokensByCategory['other'].add(item.token_mint);
      return { ...item, category: 'other' };
    });

    // All tokens across all categories
    const allTokens = new Set(items.map(i => i.token_mint));
    setTotalUniqueTokens(allTokens.size);

    for (const key of catKeys) {
      const catItems = assigned.filter(a => a.category === key);
      const catTokens = tokensByCategory[key];

      // Unique = tokens in this category NOT in any other
      let uniqueCount = 0;
      for (const mint of catTokens) {
        const inOther = catKeys.some(k => k !== key && tokensByCategory[k].has(mint));
        if (!inOther) uniqueCount++;
      }

      results.push({
        source: key,
        label: categories[key].label,
        emoji: categories[key].emoji,
        total: catItems.length,
        posted: catItems.filter(i => i.status === 'posted').length,
        pending: catItems.filter(i => i.status === 'pending').length,
        unique: uniqueCount,
      });
    }

    setStats(results.filter(r => r.total > 0));
    setLoading(false);
  };

  useEffect(() => { fetchStats(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Funnel source comparison · {totalUniqueTokens} unique tokens across all sources
        </p>
        <Button onClick={fetchStats} size="sm" variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Analyzing funnel sources…</div>
      ) : stats.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No post queue data to analyze.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map(s => (
            <Card key={s.source}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>{s.emoji}</span> {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total submissions</span>
                    <p className="text-lg font-bold">{s.total}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Unique originals</span>
                    <p className="text-lg font-bold text-primary">{s.unique}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Posted to X</span>
                    <Badge variant="outline" className="bg-green-500/20 text-green-400">{s.posted}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pending</span>
                    <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400">{s.pending}</Badge>
                  </div>
                </div>
                {s.total > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Conversion: {((s.posted / s.total) * 100).toFixed(1)}% posted · {((s.unique / s.total) * 100).toFixed(0)}% original
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
