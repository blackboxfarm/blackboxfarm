import { useState, useEffect } from "react";

// Preview-only super admin bypass
// Returns true only on lovable.dev/lovable.app when enabled via URL/localStorage
export function usePreviewSuperAdmin(): boolean {
  const [isPreviewAdmin, setIsPreviewAdmin] = useState<boolean>(() => {
    // Initialize synchronously to prevent flash
    if (typeof window === 'undefined') return false;
    
    const host = window.location.hostname || '';
    const isLovable =
      /(^|\.)lovable\.app$/.test(host) ||
      /(^|\.)lovable\.dev$/.test(host) ||
      /(^|\.)lovableproject\.com$/.test(host);
    
    if (!isLovable) return false;
    
    // Check URL param first (takes priority)
    try {
      const url = new URL(window.location.href);
      const qp = url.searchParams.get('preview_admin');
      if (qp === '0' || qp === 'false') {
        return false;
      }
      if (qp === '1' || qp === 'true') {
        return true;
      }
    } catch {}
    
    // Check localStorage
    const pref = localStorage.getItem('PREVIEW_SUPER_ADMIN');
    // Default ON in lovable preview unless explicitly disabled
    return pref === null || pref === 'true';
  });

  // Handle URL param changes and persist to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const host = window.location.hostname || '';
    const isLovable =
      /(^|\.)lovable\.app$/.test(host) ||
      /(^|\.)lovable\.dev$/.test(host) ||
      /(^|\.)lovableproject\.com$/.test(host);
    
    if (!isLovable) {
      setIsPreviewAdmin(false);
      return;
    }

    try {
      const url = new URL(window.location.href);
      const qp = url.searchParams.get('preview_admin');
      if (qp === '1' || qp === 'true') {
        localStorage.setItem('PREVIEW_SUPER_ADMIN', 'true');
        setIsPreviewAdmin(true);
      } else if (qp === '0' || qp === 'false') {
        localStorage.removeItem('PREVIEW_SUPER_ADMIN');
        setIsPreviewAdmin(false);
      } else {
        // No URL param - check localStorage, default to true on lovable domains
        const pref = localStorage.getItem('PREVIEW_SUPER_ADMIN');
        const enabled = pref === null || pref === 'true';
        setIsPreviewAdmin(enabled);
      }
    } catch {
      // Default to enabled on lovable domains
      setIsPreviewAdmin(true);
    }
  }, []);

  return isPreviewAdmin;
}
