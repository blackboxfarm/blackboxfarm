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

  // Clean up our one-time cache-buster param (no reload)
  if (url.searchParams.has('__cb')) {
    url.searchParams.delete('__cb');
    window.history.replaceState(null, '', url.toString());
  }

  // Allow manual ?purge-sw=1 trigger anytime
  const forceManual = url.searchParams.get('purge-sw') === '1';

  // Guard against reload loops: only auto-run once per tab session
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
