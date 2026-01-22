import { Share2, MessageCircle, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface ShareToXButtonProps {
  ticker: string;
  tokenName: string;
  tokenMint: string;
  totalWallets: number;
  realHolders: number;
  dustWallets: number;
  whales: number;
  serious: number;
  retail: number;
  healthGrade: string;
  healthScore: number;
  shareCardPageUrl?: string;
  isGenerating?: boolean;
  variant?: "full" | "icon";
}

export function ShareToXButton({
  ticker,
  tokenName,
  tokenMint,
  totalWallets,
  realHolders,
  dustWallets,
  whales,
  serious,
  retail,
  healthGrade,
  healthScore,
  shareCardPageUrl,
  isGenerating = false,
  variant = "full",
}: ShareToXButtonProps) {
  const { toast } = useToast();
  
  const dustPct = totalWallets > 0 ? Math.round((dustWallets / totalWallets) * 100) : 0;
  const now = new Date();
  const utcTimestamp = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  // X/Twitter caches cards aggressively per-URL; bumping `v` forces a re-scrape.
  // Keep this stable unless OG metadata changes.
  const HOLDERS_SHARE_VERSION = "20260122";
  const holdersUrlForX = (() => {
    const url = new URL("https://blackbox.farm/holders");
    url.searchParams.set("v", HOLDERS_SHARE_VERSION);
    return url.toString();
  })();

  const tweetText = `🪙 HOLDER INTEL: $${ticker} (${tokenName})
CA: ${tokenMint}
Health: ${healthGrade} (${healthScore}/100)
✅ ${realHolders.toLocaleString()} Real Holders (${dustPct}% Dust)
🏛 ${totalWallets.toLocaleString()} Total Wallets
⏱️ [${utcTimestamp}] ⏱️
🐋 ${whales} Whales (>$1K)
😎 ${serious} Serious ($200-$1K)
🏪 ${retail.toLocaleString()} Retail ($1-$199)
💨 ${dustWallets.toLocaleString()} Dust (<$1) = ${dustPct}% Dust
More Holder Intel 👉 ${holdersUrlForX}`;

  const handleShareToX = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`,
      '_blank'
    );
  };

  const handleCopyForDiscord = () => {
    const discordText = `🔎 **HOLDER INTEL: $${ticker} (${tokenName})**
**CA:** \`${tokenMint}\`
**Health:** ${healthGrade} (${healthScore}/100)
✅ ${realHolders.toLocaleString()} Real Holders (${dustPct}% Dust)
🏛 ${totalWallets.toLocaleString()} Total Wallets
🐋 ${whales} Whales (>$1K) | 😎 ${serious} Serious | 🏪 ${retail.toLocaleString()} Retail | 💨 ${dustWallets.toLocaleString()} Dust
⏱️ ${utcTimestamp}
More Holder Intel 👉 ${holdersUrlForX}`;
    navigator.clipboard.writeText(discordText);
    toast({
      title: "Copied!",
      description: "Discord message copied to clipboard",
    });
  };

  const handleShareToTelegram = () => {
    const telegramText = `🔎 HOLDER INTEL: $${ticker} (${tokenName}) | ${healthGrade} (${healthScore}/100) | ${realHolders.toLocaleString()} Real Holders | 🐋${whales} 😎${serious} 🏪${retail} | ${utcTimestamp}`;
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(holdersUrlForX)}&text=${encodeURIComponent(telegramText)}`,
      '_blank'
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className={variant === "full" ? "w-full gap-2 text-sm" : "h-8 w-8"} 
          size={variant === "icon" ? "icon" : "default"}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {variant === "full" && "Preparing Share Card..."}
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" />
              {variant === "full" && `Share $${ticker} Report`}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-48">
        <DropdownMenuItem onClick={handleShareToX}>
          <span className="w-5 h-5 bg-foreground rounded-full flex items-center justify-center mr-2">
            <span className="text-background text-xs font-bold">𝕏</span>
          </span>
          Share on X
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyForDiscord}>
          <MessageCircle className="h-4 w-4 mr-2" />
          Copy for Discord
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShareToTelegram}>
          <Send className="h-4 w-4 mr-2" />
          Share on Telegram
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
