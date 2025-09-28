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
    const isLovable = typeof window !== 'undefined' && window.location.host.includes('lovable.dev');
    const flag = typeof window !== 'undefined' && localStorage.getItem('PREVIEW_SUPER_ADMIN') === 'true';
    return isLovable && flag;
  }, []);
}
