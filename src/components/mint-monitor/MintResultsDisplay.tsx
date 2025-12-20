import React from 'react';
import { ExternalLink, Rocket, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface TokenMint {
  mint: string;
  name?: string;
  symbol?: string;
  image?: string;
  timestamp: number;
}

interface MintResultsDisplayProps {
  mints: TokenMint[];
  walletAddress: string;
  isLoading?: boolean;
}

export function MintResultsDisplay({ mints, walletAddress, isLoading }: MintResultsDisplayProps) {
  if (isLoading) {
    return (
      <div className="p-4 bg-muted/50 rounded-lg animate-pulse">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Search className="h-4 w-4 animate-spin" />
          Scanning wallet for new mints...
        </div>
      </div>
    );
  }

  if (!mints || mints.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mt-3">
      <div className="flex items-center gap-2">
        <Rocket className="h-4 w-4 text-green-500" />
        <span className="text-sm font-medium">
          Found {mints.length} Token{mints.length > 1 ? 's' : ''} Minted
        </span>
      </div>
      
      <div className="grid gap-2">
        {mints.map((mint) => (
          <Card key={mint.mint} className="p-3 bg-gradient-to-r from-green-500/10 to-transparent border-green-500/30">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {mint.image ? (
                  <img 
                    src={mint.image} 
                    alt={mint.symbol || 'Token'} 
                    className="w-10 h-10 rounded-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Rocket className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{mint.symbol || 'Unknown'}</span>
                    {mint.name && (
                      <span className="text-sm text-muted-foreground">{mint.name}</span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {mint.mint.slice(0, 12)}...{mint.mint.slice(-8)}
                  </div>
                  {mint.timestamp && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Minted: {new Date(mint.timestamp * 1000).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <a
                  href={`https://pump.fun/coin/${mint.mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline" className="w-full text-xs gap-1">
                    <img src="/launchpad-logos/pumpfun.png" alt="pump.fun" className="w-4 h-4" />
                    pump.fun
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </a>
                <a
                  href={`https://solscan.io/token/${mint.mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline" className="w-full text-xs gap-1">
                    <Search className="h-3 w-3" />
                    Solscan
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </a>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
