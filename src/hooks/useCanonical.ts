import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = 'https://blackbox.farm';

/**
 * Dynamically sets the <link rel="canonical"> tag based on the current route.
 * Place in a top-level layout component so every page gets a proper canonical.
 */
export function useCanonical() {
  const { pathname } = useLocation();

  useEffect(() => {
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }

    // Normalize: strip trailing slash except for root
    const cleanPath = pathname === '/' ? '' : pathname.replace(/\/+$/, '');
    canonical.href = `${SITE_URL}${cleanPath}`;
  }, [pathname]);
}
