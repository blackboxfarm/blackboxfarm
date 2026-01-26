import { useEffect } from "react";

export function useDomainRedirect() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const host = window.location.hostname;
    
    // Skip redirect for:
    // 1. Editor preview (id-preview--*.lovable.app)
    // 2. Already on custom domain
    // 3. Localhost
    const isEditorPreview = host.includes('id-preview--');
    const isCustomDomain = host === 'blackbox.farm' || host === 'www.blackbox.farm';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    
    if (isEditorPreview || isCustomDomain || isLocalhost) {
      return; // Don't redirect
    }
    
    // Redirect any lovable.app subdomain to custom domain
    const isLovableSubdomain = host.endsWith('.lovable.app');
    
    if (isLovableSubdomain) {
      const newUrl = `https://blackbox.farm${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(newUrl);
    }
  }, []);
}
