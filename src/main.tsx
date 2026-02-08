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
  const isLovablePreview =
    /(^|\.)lovable\.app$/.test(host) ||
    /(^|\.)lovable\.dev$/.test(host) ||
    /(^|\.)lovableproject\.com$/.test(host);

  // Only auto-purge on Lovable preview domains
  if (!isLovablePreview) return;

  // Also allow manual ?purge-sw=1 trigger
  const url = new URL(window.location.href);
  const forceManual = url.searchParams.get('purge-sw') === '1';

  const regs = await navigator.serviceWorker.getRegistrations();
  if (regs.length === 0 && !forceManual) return; // No SW to purge

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

  // Single reload to fetch fresh assets
  window.location.replace(url.toString());
})();

createRoot(document.getElementById("root")!).render(<App />);
