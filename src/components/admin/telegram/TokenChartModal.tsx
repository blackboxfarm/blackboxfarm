import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LineChart, ExternalLink, Loader2 } from 'lucide-react';

interface TokenChartModalProps {
  tokenMint: string;
  tokenSymbol?: string | null;
  trigger?: React.ReactNode;
}

export function TokenChartModal({ tokenMint, tokenSymbol, trigger }: TokenChartModalProps) {
  const [open, setOpen] = useState(false);
  const [chartSource, setChartSource] = useState<'dexscreener' | 'geckoterminal'>('dexscreener');
  const [loading, setLoading] = useState(true);

  const dexScreenerUrl = `https://dexscreener.com/solana/${tokenMint}?embed=1&theme=dark&trades=0&info=0`;
  const geckoTerminalUrl = `https://www.geckoterminal.com/solana/tokens/${tokenMint}?embed=1&info=false&swaps=false`;

  const chartUrl = chartSource === 'dexscreener' ? dexScreenerUrl : geckoTerminalUrl;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View Chart">
            <LineChart className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5" />
            {tokenSymbol || 'Token'} Chart
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Tabs value={chartSource} onValueChange={(v) => {
              setLoading(true);
              setChartSource(v as 'dexscreener' | 'geckoterminal');
            }}>
              <TabsList className="h-8">
                <TabsTrigger value="dexscreener" className="text-xs">DexScreener</TabsTrigger>
                <TabsTrigger value="geckoterminal" className="text-xs">GeckoTerminal</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => window.open(
                chartSource === 'dexscreener' 
                  ? `https://dexscreener.com/solana/${tokenMint}` 
                  : `https://www.geckoterminal.com/solana/tokens/${tokenMint}`,
                '_blank'
              )}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open
            </Button>
          </div>
        </DialogHeader>
        <div className="relative flex-1 h-full min-h-[500px]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <iframe
            src={chartUrl}
            className="w-full h-full border-0"
            onLoad={() => setLoading(false)}
            title={`${tokenSymbol || 'Token'} Chart`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
