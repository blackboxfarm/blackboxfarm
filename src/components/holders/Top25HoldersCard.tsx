import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Shield, Flag, ExternalLink } from 'lucide-react';

interface TokenHolder {
  owner: string;
  balance: number;
  usdValue: number;
  percentageOfSupply: number;
  isLiquidityPool: boolean;
}

interface PotentialDevWallet {
  address: string;
  balance: number;
  usdValue: number;
  percentageOfSupply: number;
  confidence: number;
  reason: string;
}

interface Top25HoldersCardProps {
  holders: TokenHolder[];
  potentialDevWallet?: PotentialDevWallet;
  walletFlags: { [address: string]: { flag: 'dev' | 'team' | 'suspicious'; timestamp: number } };
  onFlagWallet: (address: string) => void;
}

export function Top25HoldersCard({ holders, potentialDevWallet, walletFlags, onFlagWallet }: Top25HoldersCardProps) {
  // Filter out LPs and dev wallet, then get top 25
  const devWallet = potentialDevWallet?.address;
  const nonLPHolders = holders.filter(h => !h.isLiquidityPool && h.owner !== devWallet);
  const top25 = nonLPHolders.slice(0, 25);
  
  if (top25.length === 0) return null;
  
  const top25Percentage = top25.reduce((sum, h) => sum + h.percentageOfSupply, 0);

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatBalance = (value: number) => {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toFixed(2);
  };

  const getFlagBadge = (address: string) => {
    const flag = walletFlags[address];
    if (!flag) return null;
    
    const badgeConfig = {
      dev: { label: 'Dev', className: 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30' },
      team: { label: 'Team', className: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30' },
      suspicious: { label: 'Sus', className: 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30' }
    };
    
    const config = badgeConfig[flag.flag];
    return (
      <Badge variant="outline" className={`text-[10px] ${config.className}`}>
        <Flag className="h-2.5 w-2.5 mr-0.5" />
        {config.label}
      </Badge>
    );
  };

  const getPercentageColor = (pct: number) => {
    if (pct >= 5) return 'text-red-600 dark:text-red-400 font-bold';
    if (pct >= 2) return 'text-orange-600 dark:text-orange-400 font-semibold';
    if (pct >= 1) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-foreground';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Top 25 Holders Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="mb-4 p-4 bg-primary/10 rounded-lg border border-primary/20">
          <div className="text-2xl font-bold text-primary">
            {top25Percentage.toFixed(1)}%
          </div>
          <div className="text-sm text-muted-foreground">
            Top 25 wallets hold {top25Percentage.toFixed(1)}% of total supply
          </div>
        </div>
        
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="top25-list" className="border-none">
            <AccordionTrigger className="text-sm font-medium hover:no-underline py-2">
              View Top 25 Holders List
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-1 pt-2">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground px-2 py-1 bg-muted/30 rounded">
                  <div className="col-span-1">#</div>
                  <div className="col-span-4">Wallet</div>
                  <div className="col-span-3 text-right">Balance</div>
                  <div className="col-span-2 text-right">USD</div>
                  <div className="col-span-2 text-right">%</div>
                </div>
                
                {/* Rows */}
                {top25.map((holder, idx) => (
                  <div 
                    key={holder.owner} 
                    className="grid grid-cols-12 gap-2 items-center px-2 py-1.5 rounded hover:bg-muted/30 transition-colors text-xs group"
                  >
                    <div className="col-span-1 text-muted-foreground">{idx + 1}</div>
                    <div className="col-span-4 flex items-center gap-1">
                      <a
                        href={`https://solscan.io/account/${holder.owner}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-primary hover:underline"
                      >
                        {truncateAddress(holder.owner)}
                      </a>
                      {getFlagBadge(holder.owner)}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onFlagWallet(holder.owner)}
                      >
                        <Flag className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="col-span-3 text-right font-mono">
                      {formatBalance(holder.balance)}
                    </div>
                    <div className="col-span-2 text-right">
                      ${holder.usdValue >= 1000 
                        ? `${(holder.usdValue / 1000).toFixed(1)}k` 
                        : holder.usdValue.toFixed(0)}
                    </div>
                    <div className={`col-span-2 text-right ${getPercentageColor(holder.percentageOfSupply)}`}>
                      {holder.percentageOfSupply.toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
