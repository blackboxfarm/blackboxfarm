import { Share2, MessageCircle, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { getTemplate, processTemplate, HOLDERS_SHARE_URL, type TokenShareData } from "@/lib/share-template";

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

  // Build token data for template processing
  const tokenData: TokenShareData = {
    ticker,
    name: tokenName,
    tokenAddress: tokenMint,
    totalWallets,
    realHolders,
    dustCount: dustWallets,
    dustPercentage: dustPct,
    whales,
    serious,
    realRetail: 0,  // Not available in this context - use ShareCardDemo for full data
    casual: 0,      // Not available in this context - use ShareCardDemo for full data
    retail,
    healthGrade,
    healthScore,
  };

  // Get processed share text from the single template
  const getShareText = () => {
    const template = getTemplate();
    return processTemplate(template, tokenData);
  };

  const handleShareToX = () => {
    const tweetText = getShareText();
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`,
      '_blank'
    );
  };

  const handleCopyForDiscord = () => {
    const shareText = getShareText();
    navigator.clipboard.writeText(shareText);
    toast({
      title: "Copied!",
      description: "Share text copied to clipboard",
    });
  };

  const handleShareToTelegram = () => {
    const shareText = getShareText();
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(HOLDERS_SHARE_URL)}&text=${encodeURIComponent(shareText)}`,
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
