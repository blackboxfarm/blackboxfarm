import { useState, useEffect } from 'react';

/**
 * Detects if the app is running inside Telegram's in-app browser (WebView)
 * Telegram WebView user agents typically contain "Telegram" or run in a limited browser context
 */
export function useTelegramWebView() {
  const [isTelegramWebView, setIsTelegramWebView] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const detectTelegramWebView = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      
      // Check for Telegram WebView indicators
      const isTelegram = 
        userAgent.includes('telegram') ||
        userAgent.includes('tgweb') ||
        // Telegram Desktop WebView
        (userAgent.includes('electron') && document.referrer.includes('telegram')) ||
        // Check if running in a WebView context with Telegram-like behavior
        (window as any).TelegramWebviewProxy !== undefined ||
        (window as any).Telegram !== undefined;
      
      setIsTelegramWebView(isTelegram);
      setIsLoading(false);
    };

    detectTelegramWebView();
  }, []);

  const openInExternalBrowser = () => {
    // Get the current URL
    const currentUrl = window.location.href;
    
    // Try to open in external browser
    // On mobile Telegram, this prompts to open in default browser
    window.open(currentUrl, '_blank');
  };

  return {
    isTelegramWebView,
    isLoading,
    openInExternalBrowser,
  };
}
