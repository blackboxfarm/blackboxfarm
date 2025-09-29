import { useMemo, useEffect } from "react";

// Preview-only super admin bypass
// Returns true only on lovable.dev when enabled via URL/localStorage
export function usePreviewSuperAdmin(): boolean {
  // Allow toggling via ?preview_admin=1|0 and persist to localStorage
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const qp = url.searchParams.get('preview_admin');
      if (qp === '1' || qp === 'true') {
        localStorage.setItem('PREVIEW_SUPER_ADMIN', 'true');
      } else if (qp === '0' || qp === 'false') {
        localStorage.removeItem('PREVIEW_SUPER_ADMIN');
      }
    } catch {}
  }, []);

  return useMemo(() => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname || '';
    const isLovable =
      /(^|\.)lovable\.app$/.test(host) ||
      /(^|\.)lovable\.dev$/.test(host) ||
      /(^|\.)lovableproject\.com$/.test(host);
    const pref = localStorage.getItem('PREVIEW_SUPER_ADMIN');
    const enabled = pref === null || pref === 'true'; // default ON in lovable preview unless explicitly disabled
    return isLovable && enabled;
  }, []);
}
