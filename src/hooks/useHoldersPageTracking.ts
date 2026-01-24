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
  let sessionId = sessionStorage.getItem('holders_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('holders_session_id', sessionId);
  }
  return sessionId;
}

// Get visitor fingerprint (simple version)
async function getVisitorFingerprint(): Promise<string> {
  // Try to get existing fingerprint
  let fingerprint = localStorage.getItem('visitor_fingerprint');
  if (fingerprint) return fingerprint;
  
  // Create a simple fingerprint from available data
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
  
  // Simple hash
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

export const useHoldersPageTracking = (trackingData: TrackingData = {}) => {
  const { user } = useAuth();
  const visitIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const reportsCountRef = useRef<number>(0);
  const tokensAnalyzedRef = useRef<Set<string>>(new Set());
  const isTrackingRef = useRef(false);

  // Track a report being generated
  const trackReportGenerated = useCallback((tokenMint: string) => {
    reportsCountRef.current += 1;
    tokensAnalyzedRef.current.add(tokenMint);
    
    // Update the visit record
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
      const sessionId = getSessionId();
      const fingerprint = await getVisitorFingerprint();
      const userAgent = navigator.userAgent;
      const { deviceType, browser, os } = parseUserAgent(userAgent);
      const referrer = document.referrer;
      const referrerDomain = referrer ? extractDomain(referrer) : null;
      const utmParams = parseUtmParams(window.location.search);
      
      const urlParams = new URLSearchParams(window.location.search);
      const tokenPreloaded = trackingData.tokenPreloaded || urlParams.get('token');
      const versionParam = trackingData.versionParam || urlParams.get('v');
      
      // Check if this looks like it came from an OG share (has version param)
      const hasOgImage = !!versionParam;

      const visitData = {
        session_id: sessionId,
        visitor_fingerprint: fingerprint,
        user_agent: userAgent,
        user_id: user?.id || null,
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
      };

      const { data, error } = await supabase
        .from('holders_page_visits')
        .insert(visitData)
        .select('id')
        .single();

      if (!error && data) {
        visitIdRef.current = data.id;
        
        // If token was preloaded, track it
        if (tokenPreloaded) {
          tokensAnalyzedRef.current.add(tokenPreloaded);
        }
      }
    };

    initTracking();

    // Update time on page when leaving
    const handleBeforeUnload = () => {
      if (visitIdRef.current) {
        const timeOnPage = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        // Use sendBeacon for reliable unload tracking
        const updateData = {
          id: visitIdRef.current,
          time_on_page_seconds: timeOnPage,
          exited_at: new Date().toISOString(),
          exit_type: 'close',
          reports_generated: reportsCountRef.current,
          tokens_analyzed: Array.from(tokensAnalyzedRef.current),
        };
        
        navigator.sendBeacon(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/holders_page_visits?id=eq.${visitIdRef.current}`,
          JSON.stringify(updateData)
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Update on unmount
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
  }, [user, trackingData.tokenPreloaded, trackingData.versionParam]);

  return { trackReportGenerated };
};
