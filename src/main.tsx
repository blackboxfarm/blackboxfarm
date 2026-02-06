import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// If a previously-installed PWA/service worker cached an old build (HTML/JS),
// the app can appear “stuck” even after publishing + hard refresh.
// Purge once per tab on Lovable preview/published domains (and in PROD).
if ('serviceWorker' in navigator) {
  const isLovableHost =
    window.location.hostname.includes('lovable.app') ||
    window.location.hostname.includes('lovableproject.com');

  const shouldPurge = import.meta.env.PROD || isLovableHost;

  if (shouldPurge) {
    const SW_PURGE_KEY = 'bb_sw_purged_v2';
    if (!sessionStorage.getItem(SW_PURGE_KEY)) {
      sessionStorage.setItem(SW_PURGE_KEY, '1');

      Promise.all([
        navigator.serviceWorker.getRegistrations().then((regs) =>
          Promise.all(regs.map((r) => r.unregister()))
        ),
        typeof caches !== 'undefined'
          ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          : Promise.resolve(),
      ])
        .then(() => {
          // Reload so the browser fetches the latest assets.
          window.location.reload();
        })
        .catch(() => {
          // If anything fails, just continue to app render.
        });
    }
  }
}

createRoot(document.getElementById("root")!).render(<App />);
