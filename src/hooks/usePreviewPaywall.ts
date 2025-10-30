import { useMemo, useEffect } from "react";

// Preview paywall feature gates even when authenticated
// Toggle via ?preview_paywall=1|0 in URL
export function usePreviewPaywall(): boolean {
  // Allow toggling via ?preview_paywall=1|0 and persist to localStorage
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const qp = url.searchParams.get('preview_paywall');
      if (qp === '1' || qp === 'true') {
        localStorage.setItem('PREVIEW_PAYWALL', 'true');
      } else if (qp === '0' || qp === 'false') {
        localStorage.removeItem('PREVIEW_PAYWALL');
      }
    } catch {}
  }, []);

  return useMemo(() => {
    if (typeof window === 'undefined') return false;
    const pref = localStorage.getItem('PREVIEW_PAYWALL');
    return pref === 'true';
  }, []);
}
