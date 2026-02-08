/*
  Legacy service worker kill-switch.

  If any users previously registered a SW at /service-worker.js,
  this file forces it to unregister itself and clear all CacheStorage.

  Note: this file does NOTHING unless a browser already has a registration
  pointing to /service-worker.js.
*/

self.addEventListener('install', (event) => {
  // Activate immediately
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      // ignore
    }

    try {
      // Take control, then unregister
      await self.clients.claim();
    } catch {
      // ignore
    }

    try {
      await self.registration.unregister();
    } catch {
      // ignore
    }

    // Force open tabs to refresh so they fetch latest assets
    try {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        try {
          client.navigate(client.url);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  })());
});
