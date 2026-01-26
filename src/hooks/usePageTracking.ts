import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

interface TrackingData {
  tokenPreloaded?: string;
  versionParam?: string;
}

// Parse user agent to get device info
function parseUserAgent(ua: string) {
  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  const isTablet = /Tablet|iPad/i.test(ua);
  
  let browser = 'Unknown';
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';
  else if (ua.includes('Opera')) browser = 'Opera';
  
  let os = 'Unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  
  return {
    deviceType: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
    browser,
    os,
  };
}

// Extract domain from referrer
function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

// Parse UTM parameters
function parseUtmParams(search: string) {
  const params = new URLSearchParams(search);
  return {
    utmSource: params.get('utm_source'),
    utmMedium: params.get('utm_medium'),
    utmCampaign: params.get('utm_campaign'),
    utmContent: params.get('utm_content'),
    utmTerm: params.get('utm_term'),
  };
}

// Get or create session ID
function getSessionId(): string {
  let sessionId = sessionStorage.getItem('site_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('site_session_id', sessionId);
  }
  return sessionId;
}

function safeUUID(prefix: string) {
  try {
    return crypto.randomUUID();
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

// Get visitor fingerprint (simple version)
async function getVisitorFingerprint(): Promise<string> {
  let fingerprint = localStorage.getItem('visitor_fingerprint');
  if (fingerprint) return fingerprint;
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fingerprint', 2, 2);
  }
  
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    canvas.toDataURL(),
  ];
  
  const str = components.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  fingerprint = 'vf_' + Math.abs(hash).toString(36);
  localStorage.setItem('visitor_fingerprint', fingerprint);
  return fingerprint;
}

export const usePageTracking = (pageName: string, trackingData: TrackingData = {}) => {
  const { user } = useAuth();
  const visitIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const reportsCountRef = useRef<number>(0);
  const tokensAnalyzedRef = useRef<Set<string>>(new Set());
  const isTrackingRef = useRef(false);

  // Track a report being generated (for holders page)
  const trackReportGenerated = useCallback((tokenMint: string) => {
    reportsCountRef.current += 1;
    tokensAnalyzedRef.current.add(tokenMint);
    
    if (visitIdRef.current) {
      supabase
        .from('holders_page_visits')
        .update({
          reports_generated: reportsCountRef.current,
          tokens_analyzed: Array.from(tokensAnalyzedRef.current),
        })
        .eq('id', visitIdRef.current)
        .then(() => {});
    }
  }, []);

  useEffect(() => {
    if (isTrackingRef.current) return;
    isTrackingRef.current = true;

    const initTracking = async () => {
      console.log(`[Page Tracking] Starting tracking for page: ${pageName}`);
      
      let sessionId: string;
      const visitId = safeUUID('visit');
      let fingerprint: string;
      
      try {
        sessionId = getSessionId();
      } catch (e) {
        console.error('[Page Tracking] Failed to get session ID:', e);
        sessionId = 'fallback_' + Date.now();
      }
      
      try {
        fingerprint = await getVisitorFingerprint();
      } catch (e) {
        console.error('[Page Tracking] Failed to get fingerprint:', e);
        fingerprint = 'fallback_fp_' + Date.now();
      }
      
      try {
        const userAgent = navigator.userAgent;
        const { deviceType, browser, os } = parseUserAgent(userAgent);
        const referrer = document.referrer;
        const referrerDomain = referrer ? extractDomain(referrer) : null;
        const utmParams = parseUtmParams(window.location.search);
        
        const urlParams = new URLSearchParams(window.location.search);
        const tokenPreloaded = trackingData.tokenPreloaded || urlParams.get('token');
        const versionParam = trackingData.versionParam || urlParams.get('v');
        const hasOgImage = !!versionParam;

        let currentUser = null;
        try {
          const { data: authData } = await supabase.auth.getUser();
          currentUser = authData?.user;
        } catch (authErr) {
          console.log('[Page Tracking] Auth check failed (expected for anon):', authErr);
        }

        const getAuthMethod = (): string => {
          if (!currentUser) return 'anonymous';
          const provider = currentUser.app_metadata?.provider;
          if (provider === 'google') return 'google';
          if (provider === 'github') return 'github';
          if (provider === 'twitter') return 'twitter';
          if (currentUser.email) return 'email';
          return 'unknown';
        };

        const visitData = {
          id: visitId,
          page_name: pageName,
          session_id: sessionId,
          visitor_fingerprint: fingerprint,
          user_agent: userAgent,
          user_id: currentUser?.id || null,
          referrer: referrer || null,
          referrer_domain: referrerDomain,
          utm_source: utmParams.utmSource,
          utm_medium: utmParams.utmMedium,
          utm_campaign: utmParams.utmCampaign,
          utm_content: utmParams.utmContent,
          utm_term: utmParams.utmTerm,
          token_preloaded: tokenPreloaded || null,
          version_param: versionParam || null,
          has_og_image: hasOgImage,
          full_url: window.location.href,
          device_type: deviceType,
          browser,
          os,
          screen_width: screen.width,
          screen_height: screen.height,
          reports_generated: 0,
          tokens_analyzed: [] as string[],
          is_authenticated: !!currentUser,
          auth_method: getAuthMethod(),
        };

        console.log(`[Page Tracking] Inserting visit for ${pageName}`);
        
        const { error } = await supabase
          .from('holders_page_visits')
          .insert(visitData);

        if (error) {
          console.error('[Page Tracking] Insert error:', error.message);
          
          // Fallback to direct REST API
          const fallbackResponse = await fetch('https://apxauapuusmgwbbzjgfl.supabase.co/rest/v1/holders_page_visits', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify(visitData),
          });
          
          if (fallbackResponse.ok) {
            console.log('[Page Tracking] Fallback insert succeeded');
            visitIdRef.current = visitId;
          } else {
            console.error('[Page Tracking] Fallback insert failed:', fallbackResponse.status);
          }
        } else {
          console.log(`[Page Tracking] Visit recorded for ${pageName}:`, visitId);
          visitIdRef.current = visitId;

          if (tokenPreloaded) {
            tokensAnalyzedRef.current.add(tokenPreloaded);
          }
        }
      } catch (err) {
        console.error('[Page Tracking] Unexpected error:', err);
      }
    };

    initTracking();

    const handleBeforeUnload = () => {
      if (visitIdRef.current) {
        const timeOnPage = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        const updateData = {
          time_on_page_seconds: timeOnPage,
          exited_at: new Date().toISOString(),
          exit_type: 'close',
          reports_generated: reportsCountRef.current,
          tokens_analyzed: Array.from(tokensAnalyzedRef.current),
        };
        
        fetch(`https://apxauapuusmgwbbzjgfl.supabase.co/rest/v1/holders_page_visits?id=eq.${visitIdRef.current}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(updateData),
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      if (visitIdRef.current) {
        const timeOnPage = Math.floor((Date.now() - startTimeRef.current) / 1000);
        supabase
          .from('holders_page_visits')
          .update({
            time_on_page_seconds: timeOnPage,
            exited_at: new Date().toISOString(),
            exit_type: 'navigation',
            reports_generated: reportsCountRef.current,
            tokens_analyzed: Array.from(tokensAnalyzedRef.current),
          })
          .eq('id', visitIdRef.current)
          .then(() => {});
      }
    };
  }, [pageName, trackingData.tokenPreloaded, trackingData.versionParam]);

  return { trackReportGenerated };
};
