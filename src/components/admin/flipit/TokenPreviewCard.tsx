import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExternalLink, Globe, Twitter, Send, Users, Loader2 } from "lucide-react";

interface DexPaidStatus {
  hasPaidProfile?: boolean;
  hasCTO?: boolean;
  activeBoosts?: number;
  hasActiveAds?: boolean;
}

interface TokenPreviewCardProps {
  mint: string;
  symbol: string | null;
  name: string | null;
  image: string | null;
  price: number | null;
  marketCap?: number | null;
  liquidity?: number | null;
  holders?: number | null;
  dexStatus?: DexPaidStatus | null;
  twitterUrl?: string | null;
  websiteUrl?: string | null;
  telegramUrl?: string | null;
  isLoading?: boolean;
}

export function TokenPreviewCard({
  mint,
  symbol,
  name,
  image,
  price,
  marketCap,
  liquidity,
  holders,
  dexStatus,
  twitterUrl,
  websiteUrl,
  telegramUrl,
  isLoading = false,
}: TokenPreviewCardProps) {
  if (!mint || mint.length < 32) return null;

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const pumpFunUrl = `https://pump.fun/coin/${mint}`;
  const padreUrl = `https://trade.padre.gg/trade/solana/${mint}`;
  const dexScreenerUrl = `https://dexscreener.com/solana/${mint}`;

  return (
    <Card className="p-3 bg-muted/30 border-muted">
      <div className="flex gap-3">
        {/* Token Image */}
        <div className="flex-shrink-0">
          {image ? (
            <img
              src={image}
              alt={symbol || "Token"}
              className="w-12 h-12 rounded-lg object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs">
              {symbol?.slice(0, 2) || "?"}
            </div>
          )}
        </div>

        {/* Token Info */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Header row: Name + Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm truncate">
              {symbol || mint.slice(0, 8) + "..."}
            </span>
            {name && <span className="text-xs text-muted-foreground truncate">{name}</span>}
            
            {/* DEX Status Badges */}
            {dexStatus?.hasPaidProfile && (
              <Badge className="text-[9px] px-1 py-0 bg-blue-900 hover:bg-blue-800 text-white">
                DEX
              </Badge>
            )}
            {dexStatus?.hasCTO && (
              <Badge className="text-[9px] px-1 py-0 bg-yellow-700 hover:bg-yellow-600 text-white">
                CTO
              </Badge>
            )}
            {(dexStatus?.activeBoosts ?? 0) > 0 && (
              <Badge className="text-[9px] px-1 py-0 bg-orange-500 hover:bg-orange-600">
                x{dexStatus?.activeBoosts}
              </Badge>
            )}
            {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>

          {/* Price + Stats row */}
          <div className="flex items-center gap-3 text-xs">
            {price !== null && (
              <span className="font-bold text-green-400">
                ${price.toFixed(10).replace(/\.?0+$/, "")}
              </span>
            )}
            {marketCap && (
              <span className="text-muted-foreground">
                MC: {formatNumber(marketCap)}
              </span>
            )}
            {liquidity && (
              <span className="text-muted-foreground">
                Liq: {formatNumber(liquidity)}
              </span>
            )}
            {holders && (
              <span className="text-muted-foreground">
                <Users className="inline h-3 w-3 mr-0.5" />
                {holders.toLocaleString()}
              </span>
            )}
          </div>

          {/* Links row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Platform links */}
            <a
              href={pumpFunUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
              title="View on Pump.fun"
            >
              <span className="text-orange-400">🎃</span> pump.fun
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
            <a
              href={padreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
              title="Terminal"
            >
              <img src="https://trade.padre.gg/logo.svg" alt="Padre" className="h-3 w-3" />
              padre.gg
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
            <a
              href={dexScreenerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
              title="View on DexScreener"
            >
              <span className="text-green-400">📊</span> dexscreener
              <ExternalLink className="h-2.5 w-2.5" />
            </a>

            {/* Social links */}
            {twitterUrl && (
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 transition-colors"
                title={twitterUrl}
              >
                <Twitter className="h-3.5 w-3.5" />
              </a>
            )}
            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-400 transition-colors"
                title={websiteUrl}
              >
                <Globe className="h-3.5 w-3.5" />
              </a>
            )}
            {telegramUrl && (
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 transition-colors"
                title={telegramUrl}
              >
                <Send className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
