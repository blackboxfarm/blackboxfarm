import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

/**
 * Auto-purge stale Service Worker on Lovable preview domains.
 * This runs ONCE per stale SW scenario, clears all caches, then reloads.
 */
(async () => {
  if (!('serviceWorker' in navigator)) return;

  const host = window.location.hostname || '';
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  if (isLocalhost) return;

  const url = new URL(window.location.href);
  const path = window.location.pathname || '';

  // Allow manual ?purge-sw=1 trigger anytime
  const forceManual = url.searchParams.get('purge-sw') === '1';

  /**
   * HARD GUARANTEE (Super Admin only):
   * Even if there is NO service worker anymore, users can still be pinned to an
   * old build via CDN/HTTP-cached HTML.
   *
   * So when entering /super-admin, we force a ONE-TIME per-tab cache-busted reload.
   */
  const isSuperAdminRoute = path.startsWith('/super-admin');
  const hasCb = url.searchParams.has('__cb');

  if (isSuperAdminRoute && !hasCb) {
    sessionStorage.setItem('__BB_SW_PURGED__', '1');

    // Best-effort SW + CacheStorage purge BEFORE reload (safe even if none exist)
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all([
        ...regs.map((r) => r.unregister()),
        typeof caches !== 'undefined'
          ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          : Promise.resolve(),
      ]);
    } catch {
      // ignore
    }

    if (forceManual) url.searchParams.delete('purge-sw');

    url.searchParams.set('__cb', Date.now().toString(36));
    window.location.replace(url.toString());
    return;
  }

  // Clean up our one-time cache-buster param (no reload)
  if (hasCb) {
    url.searchParams.delete('__cb');
    window.history.replaceState(null, '', url.toString());
  }

  /**
   * General SW purge (all other routes):
   * Runs ONCE per stale SW scenario, clears all caches, then reloads.
   */
  const alreadyPurgedThisSession = sessionStorage.getItem('__BB_SW_PURGED__') === '1';
  if (alreadyPurgedThisSession && !forceManual) return;

  const regs = await navigator.serviceWorker.getRegistrations();
  const hasAnySW = regs.length > 0;

  // If there is no SW, do nothing unless manually requested.
  if (!hasAnySW && !forceManual) return;

  sessionStorage.setItem('__BB_SW_PURGED__', '1');

  // Unregister all SWs and clear all caches
  await Promise.all([
    ...regs.map((r) => r.unregister()),
    typeof caches !== 'undefined'
      ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      : Promise.resolve(),
  ]);

  // Clean URL if manual param was used
  if (forceManual) {
    url.searchParams.delete('purge-sw');
  }

  // Single reload to fetch fresh assets (cache-busted once)
  url.searchParams.set('__cb', Date.now().toString(36));
  window.location.replace(url.toString());
})();

createRoot(document.getElementById("root")!).render(<App />);
