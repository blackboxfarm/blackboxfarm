import { Share2, MessageCircle, Send, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { fetchTemplate, processTemplate, getShareUrl, DEFAULT_TEMPLATES, type TokenShareData } from "@/lib/share-template";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  realRetail?: number;
  casual?: number;
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
  realRetail = 0,
  casual = 0,
  healthGrade,
  healthScore,
  shareCardPageUrl,
  isGenerating = false,
  variant = "full",
}: ShareToXButtonProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [template, setTemplate] = useState(DEFAULT_TEMPLATES.shares);
  
  // Get utm_community from URL if present
  const utmCommunity = typeof window !== 'undefined' 
    ? new URLSearchParams(window.location.search).get('utm_community') || undefined
    : undefined;
  
  // Fetch the shares template from database on mount
  useEffect(() => {
    fetchTemplate('shares').then(setTemplate);
  }, []);
  
  const dustPct = totalWallets > 0 ? Math.round((dustWallets / totalWallets) * 100) : 0;

  // Track share click to analytics
  const trackShareClick = async (platform: 'x' | 'discord' | 'telegram' | 'copy_link') => {
    try {
      await supabase.from('feature_usage_analytics').insert({
        user_id: user?.id || null,
        feature_name: `share_${platform}`,
        token_mint: tokenMint,
        session_id: sessionStorage.getItem('session_id') || crypto.randomUUID(),
      });
    } catch (err) {
      console.error('Failed to track share click:', err);
    }
  };

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
    realRetail,
    casual,
    retail,
    healthGrade,
    healthScore,
  };

  // Get processed share text from the shares template
  const getShareText = () => {
    return processTemplate(template, tokenData);
  };

  // Get the edge function URL for social sharing (shows token banner in previews)
  const getEdgeFunctionUrl = () => {
    return getShareUrl(tokenMint, utmCommunity);
  };

  const handleCopyLink = () => {
    trackShareClick('copy_link');
    const shareLink = getEdgeFunctionUrl();
    navigator.clipboard.writeText(shareLink);
    toast({
      title: "Link copied!",
      description: "Share link copied - Twitter will show the token banner",
    });
  };

  const handleShareToX = () => {
    trackShareClick('x');
    const tweetText = getShareText();
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`,
      '_blank'
    );
  };

  const handleCopyForDiscord = () => {
    trackShareClick('discord');
    const shareText = getShareText();
    navigator.clipboard.writeText(shareText);
    toast({
      title: "Copied!",
      description: "Share text copied to clipboard",
    });
  };

  const handleShareToTelegram = () => {
    trackShareClick('telegram');
    const shareText = getShareText();
    const shareUrl = getEdgeFunctionUrl();
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
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
        <DropdownMenuItem onClick={handleCopyLink}>
          <Link2 className="h-4 w-4 mr-2" />
          Copy Link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
