import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// If a previously-installed PWA/service worker cached an old build (HTML/JS),
// production can appear “stuck” even after publishing. Purge once per tab.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const SW_PURGE_KEY = 'bb_sw_purged_v1';
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
        // Reload so the browser fetches the latest published assets.
        window.location.reload();
      })
      .catch(() => {
        // If anything fails, just continue to app render.
      });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
