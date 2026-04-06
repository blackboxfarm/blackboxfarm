import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';

// Persistent session ID per browser tab
const SESSION_ID = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

interface TrackEventOptions {
  eventType?: 'page_view' | 'feature_use' | 'error' | 'action' | 'bot_command';
  metadata?: Record<string, unknown>;
  pagePath?: string;
}

export function useJourneyTracker() {
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRoles();
  const location = useLocation();
  const pageEnteredAt = useRef<number>(Date.now());
  const lastPath = useRef<string>('');

  const trackEvent = useCallback(
    async (eventName: string, options: TrackEventOptions = {}) => {
      if (!user?.id) return;

      const {
        eventType = 'action',
        metadata = {},
        pagePath,
      } = options;

      try {
        await supabase.from('user_journey_events').insert({
          user_id: user.id,
          session_id: SESSION_ID,
          event_type: eventType,
          event_name: eventName,
          page_path: pagePath || location.pathname,
          metadata,
        } as any);
      } catch {
        // Silent — tracking should never break the app
      }
    },
    [user?.id, location.pathname]
  );

  // Auto-track page views
  useEffect(() => {
    if (!user?.id) return;
    const currentPath = location.pathname;

    // Log duration for previous page
    if (lastPath.current && lastPath.current !== currentPath) {
      const duration = Math.round((Date.now() - pageEnteredAt.current) / 1000);
      if (duration > 0 && duration < 3600) {
        supabase.from('user_journey_events').insert({
          user_id: user.id,
          session_id: SESSION_ID,
          event_type: 'page_view',
          event_name: `visited_${lastPath.current.replace(/\//g, '_').replace(/^_/, '')}`,
          page_path: lastPath.current,
          duration_seconds: duration,
        } as any).then();
      }
    }

    // Track new page view
    lastPath.current = currentPath;
    pageEnteredAt.current = Date.now();

    trackEvent(
      `visited_${currentPath.replace(/\//g, '_').replace(/^_/, '') || 'home'}`,
      { eventType: 'page_view' }
    );
  }, [location.pathname, user?.id]);

  return { trackEvent, sessionId: SESSION_ID };
}
