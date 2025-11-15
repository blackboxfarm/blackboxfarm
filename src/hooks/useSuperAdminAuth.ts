import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export const useSuperAdminAuth = () => {
  const { user, loading } = useAuth();
  const [authReady, setAuthReady] = useState(false);

  // Only claim preview data if user is authenticated (no auto-login)
  useEffect(() => {
    const claimPreviewData = async () => {
      if (user) {
        try {
          const { data, error } = await supabase.functions.invoke('claim-preview-data');
          if (error) {
            console.warn('Failed to claim preview data:', error);
          } else if (data?.reassigned && Object.values(data.reassigned).some((count: any) => (count as number) > 0)) {
            console.log('Preview data claimed:', data.reassigned);
            // Dispatch event to notify components to reload data
            window.dispatchEvent(new CustomEvent('preview-data-claimed', { detail: data.reassigned }));
          }
        } catch (error) {
          console.warn('Error claiming preview data:', error);
        }
      }
      setAuthReady(true);
    };

    claimPreviewData();
  }, [user, loading]);

  return { user, loading, authReady };
};