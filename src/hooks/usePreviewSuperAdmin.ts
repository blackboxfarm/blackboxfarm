import { useState, useEffect } from "react";

// Preview-only super admin bypass
// Returns true only on lovable.dev/lovable.app when enabled via URL/localStorage
/**
 * Preview-only super admin bypass.
 * ONLY active on Lovable's preview/dev domains (id-preview--*.lovable.app, *.lovable.dev, *.lovableproject.com).
 * NEVER active on custom/production domains like blackboxfarm.lovable.app.
 */
export function usePreviewSuperAdmin(): boolean {
  const [isPreviewAdmin, setIsPreviewAdmin] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return checkIsPreviewDomain();
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsPreviewAdmin(checkIsPreviewDomain());
  }, []);

  return isPreviewAdmin;
}

function checkIsPreviewDomain(): boolean {
  const host = window.location.hostname || '';
  
  // Only allow on Lovable's internal preview domains (id-preview--*.lovable.app)
  // and dev/project domains - NEVER on custom subdomains like blackboxfarm.lovable.app
  const isLovablePreview =
    /^id-preview--.*\.lovable\.app$/.test(host) ||
    /(^|\.)lovable\.dev$/.test(host) ||
    /(^|\.)lovableproject\.com$/.test(host);
  
  if (!isLovablePreview) return false;
  
  // Check URL param (opt-out)
  try {
    const url = new URL(window.location.href);
    const qp = url.searchParams.get('preview_admin');
    if (qp === '0' || qp === 'false') return false;
    if (qp === '1' || qp === 'true') return true;
  } catch {}
  
  // Check localStorage preference, default ON for preview domains
  const pref = localStorage.getItem('PREVIEW_SUPER_ADMIN');
  return pref === null || pref === 'true';
}
