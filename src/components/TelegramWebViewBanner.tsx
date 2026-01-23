import React from 'react';
import { ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTelegramWebView } from '@/hooks/useTelegramWebView';

interface TelegramWebViewBannerProps {
  onDismiss?: () => void;
}

export function TelegramWebViewBanner({ onDismiss }: TelegramWebViewBannerProps) {
  const { isTelegramWebView, isLoading, openInExternalBrowser } = useTelegramWebView();
  const [dismissed, setDismissed] = React.useState(false);

  // Don't render if not in Telegram WebView or already dismissed
  if (isLoading || !isTelegramWebView || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-blue-500 text-white px-3 py-2 shadow-lg">
      <div className="flex items-center justify-between gap-2 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium truncate">
            📱 For the best experience, open in your browser
          </span>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={openInExternalBrowser}
            className="bg-white/20 hover:bg-white/30 text-white border-0 text-xs px-3 py-1 h-7"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Open in Browser
          </Button>
          
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
