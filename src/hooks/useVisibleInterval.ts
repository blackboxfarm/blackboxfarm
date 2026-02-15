import { useEffect, useRef } from 'react';

/**
 * Like setInterval, but automatically pauses when:
 * - The browser tab is hidden (document.visibilityState)
 * - The `enabled` flag is false (e.g. user switched to a different sub-tab)
 *
 * Resumes immediately when both conditions are met again.
 */
export function useVisibleInterval(
  callback: () => void,
  intervalMs: number,
  enabled: boolean = true
) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id !== null) return; // already running
      id = setInterval(() => savedCallback.current(), intervalMs);
    };

    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Fire immediately on return, then resume interval
        savedCallback.current();
        start();
      } else {
        stop();
      }
    };

    // Start only if currently visible
    if (document.visibilityState === 'visible') {
      start();
    }

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [intervalMs, enabled]);
}
