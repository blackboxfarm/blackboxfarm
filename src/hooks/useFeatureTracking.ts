import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export const useFeatureTracking = (featureName: string, tokenMint?: string) => {
  const { user } = useAuth();
  const startTime = useRef<number>(Date.now());
  const trackedRef = useRef(false);

  useEffect(() => {
    startTime.current = Date.now();
    trackedRef.current = false;

    return () => {
      if (!trackedRef.current) {
        const duration = Math.floor((Date.now() - startTime.current) / 1000);
        
        // Track feature usage
        supabase.from('feature_usage_analytics').insert({
          user_id: user?.id || null,
          feature_name: featureName,
          token_mint: tokenMint,
          duration_seconds: duration,
          session_id: sessionStorage.getItem('session_id') || crypto.randomUUID(),
        }).then(() => {
          trackedRef.current = true;
        });
      }
    };
  }, [featureName, tokenMint, user]);

  const trackView = async (viewedAsTeaser: boolean = false) => {
    await supabase.from('premium_feature_views').insert({
      feature_name: featureName,
      user_id: user?.id || null,
      viewed_as_teaser: viewedAsTeaser,
      token_mint: tokenMint,
    });
  };

  const trackConversion = async () => {
    if (user) {
      await supabase.from('premium_feature_views').insert({
        feature_name: featureName,
        user_id: user.id,
        viewed_as_teaser: false,
        converted_to_signup: true,
        token_mint: tokenMint,
      });
    }
  };

  return { trackView, trackConversion };
};
