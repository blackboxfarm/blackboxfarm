const PREVIEW_HOST_PATTERNS = [
  /^id-preview--.*\.lovable\.app$/,
  /(^|\.)lovable\.dev$/,
  /(^|\.)lovableproject\.com$/,
];

function isPreviewLikeEnvironment() {
  if (typeof window === "undefined") return false;

  const host = window.location.hostname || "";
  const isPreviewHost = PREVIEW_HOST_PATTERNS.some((pattern) => pattern.test(host));

  try {
    return isPreviewHost || window.self !== window.top;
  } catch {
    return true;
  }
}

export function purgePreviewCaches() {
  if (typeof window === "undefined") return;
  if (!isPreviewLikeEnvironment()) return;

  const sessionKey = `preview-cache-purged:${window.location.origin}`;
  if (window.sessionStorage.getItem(sessionKey) === "true") return;
  window.sessionStorage.setItem(sessionKey, "true");

  queueMicrotask(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.allSettled(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
    }

    if ("caches" in window) {
      caches.keys()
        .then((cacheKeys) => Promise.allSettled(cacheKeys.map((cacheKey) => caches.delete(cacheKey))))
        .catch(() => undefined);
    }
  });
}
