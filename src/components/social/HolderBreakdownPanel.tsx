import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export interface GranularTierCounts {
  // Summary
  totalHolders: number;
  dustCount: number;
  realHolders: number;
  lpCount: number;

  // Granular tiers from edge function
  smallCount: number;      // $1-$12
  mediumCount: number;     // $12-$25
  largeCount: number;      // $25-$49
  realCount: number;       // $50-$199
  bossCount: number;       // $200-$500
  kingpinCount: number;    // $500-$1K
  superBossCount: number;  // $1K-$2K
  babyWhaleCount: number;  // $2K-$5K
  trueWhaleCount: number;  // ≥$5K
}

interface HolderBreakdownPanelProps {
  stats: GranularTierCounts;
  symbol: string;
}

export function HolderBreakdownPanel({ stats, symbol }: HolderBreakdownPanelProps) {
  // Calculate grouped tiers based on user's requested boundaries
  const whales = stats.superBossCount + stats.babyWhaleCount + stats.trueWhaleCount; // ≥$1K
  const serious = stats.bossCount + stats.kingpinCount; // $200-$999
  const retail = stats.realCount; // $50-$199
  const casual = stats.smallCount + stats.mediumCount + stats.largeCount; // $1-$49
  const dust = stats.dustCount; // <$1

  const realWallets = stats.totalHolders - stats.dustCount;

  return (
    <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold">📊 Holder Breakdown</span>
        <Badge variant="outline" className="text-xs">${symbol}</Badge>
      </div>

      {/* Summary Math */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="p-2 bg-background/50 rounded border">
          <div className="text-muted-foreground text-xs">Total Wallets</div>
          <div className="font-bold text-lg">{stats.totalHolders.toLocaleString()}</div>
        </div>
        <div className="p-2 bg-background/50 rounded border">
          <div className="text-muted-foreground text-xs">Dust Wallets</div>
          <div className="font-bold text-lg text-orange-500">{dust.toLocaleString()}</div>
        </div>
        <div className="p-2 bg-background/50 rounded border">
          <div className="text-muted-foreground text-xs">Real Wallets</div>
          <div className="font-bold text-lg text-emerald-500">{realWallets.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total - Dust</div>
        </div>
      </div>

      <Separator />

      {/* Tier Breakdown */}
      <div className="space-y-3 text-sm">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Tier Breakdown
        </div>

        {/* Whales */}
        <div className="flex items-center justify-between p-2 bg-blue-500/10 rounded border border-blue-500/20">
          <div className="flex items-center gap-2">
            <span>🐋</span>
            <span className="font-medium">Whales (≥$1K)</span>
          </div>
          <Badge className="bg-blue-600">{whales.toLocaleString()}</Badge>
        </div>
        <div className="ml-6 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>└ Super Boss ($1K-$2K)</span>
            <span>{stats.superBossCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>└ Baby Whale ($2K-$5K)</span>
            <span>{stats.babyWhaleCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>└ True Whale (≥$5K)</span>
            <span>{stats.trueWhaleCount.toLocaleString()}</span>
          </div>
        </div>

        {/* Serious */}
        <div className="flex items-center justify-between p-2 bg-purple-500/10 rounded border border-purple-500/20">
          <div className="flex items-center gap-2">
            <span>💼</span>
            <span className="font-medium">Serious ($200-$999)</span>
          </div>
          <Badge className="bg-purple-600">{serious.toLocaleString()}</Badge>
        </div>
        <div className="ml-6 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>└ Boss ($200-$500)</span>
            <span>{stats.bossCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>└ Kingpin ($500-$1K)</span>
            <span>{stats.kingpinCount.toLocaleString()}</span>
          </div>
        </div>

        {/* Retail */}
        <div className="flex items-center justify-between p-2 bg-green-500/10 rounded border border-green-500/20">
          <div className="flex items-center gap-2">
            <span>🛒</span>
            <span className="font-medium">Retail ($50-$199)</span>
          </div>
          <Badge className="bg-green-600">{retail.toLocaleString()}</Badge>
        </div>
        <div className="ml-6 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>└ Real ($50-$199)</span>
            <span>{stats.realCount.toLocaleString()}</span>
          </div>
        </div>

        {/* Casual */}
        <div className="flex items-center justify-between p-2 bg-yellow-500/10 rounded border border-yellow-500/20">
          <div className="flex items-center gap-2">
            <span>👤</span>
            <span className="font-medium">Casual ($1-$49)</span>
          </div>
          <Badge className="bg-yellow-600">{casual.toLocaleString()}</Badge>
        </div>
        <div className="ml-6 space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>└ Small ($1-$12)</span>
            <span>{stats.smallCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>└ Medium ($12-$25)</span>
            <span>{stats.mediumCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>└ Large ($25-$49)</span>
            <span>{stats.largeCount.toLocaleString()}</span>
          </div>
        </div>

        {/* Dust */}
        <div className="flex items-center justify-between p-2 bg-orange-500/10 rounded border border-orange-500/20">
          <div className="flex items-center gap-2">
            <span>🧹</span>
            <span className="font-medium">Dust (&lt;$1)</span>
          </div>
          <Badge className="bg-orange-600">{dust.toLocaleString()}</Badge>
        </div>

        {/* LP */}
        {stats.lpCount > 0 && (
          <div className="flex items-center justify-between p-2 bg-cyan-500/10 rounded border border-cyan-500/20">
            <div className="flex items-center gap-2">
              <span>💧</span>
              <span className="font-medium">Liquidity Pools</span>
            </div>
            <Badge className="bg-cyan-600">{stats.lpCount.toLocaleString()}</Badge>
          </div>
        )}
      </div>
    </div>
  );
}
