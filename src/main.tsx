import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// PWA/service-worker note:
// A previously-installed service worker can cache an old build and make the UI look “stuck”.
// However, auto-purging + auto-reloading can cause lockups in the Lovable preview.
//
// Manual fix (only runs if you add ?purge-sw=1 to the URL):
//   https://blackboxfarm.lovable.app/super-admin?purge-sw=1
//
// This unregisters SW + clears CacheStorage ONCE, then removes the query param and reloads.
if ('serviceWorker' in navigator) {
  const url = new URL(window.location.href);
  const shouldPurge = url.searchParams.get('purge-sw') === '1';

  if (shouldPurge) {
    url.searchParams.delete('purge-sw');
    const cleanedUrl = url.toString();

    Promise.all([
      navigator.serviceWorker.getRegistrations().then((regs) =>
        Promise.all(regs.map((r) => r.unregister()))
      ),
      typeof caches !== 'undefined'
        ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        : Promise.resolve(),
    ])
      .then(() => {
        // Navigate without the query param; this causes a single fresh load.
        window.location.replace(cleanedUrl);
      })
      .catch(() => {
        // If anything fails, just continue to app render.
      });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
