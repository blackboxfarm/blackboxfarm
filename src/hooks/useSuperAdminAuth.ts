import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePreviewSuperAdmin } from './usePreviewSuperAdmin';

const SUPER_ADMIN_EMAIL = 'admin@blackbox.farm';
const SUPER_ADMIN_PASSWORD = 'SuperAdmin2024!';

export const useSuperAdminAuth = () => {
  const { user, loading, signIn } = useAuth();
  const [authReady, setAuthReady] = useState(false);
  const isPreviewAdmin = usePreviewSuperAdmin();

  // Auto-login for preview mode
  useEffect(() => {
    const autoLogin = async () => {
      // If in preview mode and not authenticated, auto-login
      if (isPreviewAdmin && !user && !loading) {
        try {
          await signIn(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
        } catch (error) {
          console.warn('Preview auto-login failed:', error);
        }
      }
    };

    if (!loading) {
      autoLogin();
    }
  }, [isPreviewAdmin, user, loading, signIn]);

  // Claim preview data if user is authenticated
  useEffect(() => {
    const claimPreviewData = async () => {
      if (user) {
        try {
          const { data, error } = await supabase.functions.invoke('claim-preview-data');
          if (error) {
            console.warn('Failed to claim preview data:', error);
          } else if (data?.reassigned && Object.values(data.reassigned).some((count: any) => (count as number) > 0)) {
            console.log('Preview data claimed:', data.reassigned);
            window.dispatchEvent(new CustomEvent('preview-data-claimed', { detail: data.reassigned }));
          }
        } catch (error) {
          console.warn('Error claiming preview data:', error);
        }
      }
      setAuthReady(true);
    };

    if (!loading) {
      claimPreviewData();
    }
  }, [user, loading]);

  return { user, loading, authReady };
};