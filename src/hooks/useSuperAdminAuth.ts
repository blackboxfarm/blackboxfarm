import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

// Super admin credentials - in production, this should be moved to environment variables
const SUPER_ADMIN_EMAIL = 'admin@blackbox.farm';
const SUPER_ADMIN_PASSWORD = 'SuperAdmin2024!';

export const useSuperAdminAuth = () => {
  const { user, signIn, loading } = useAuth();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const autoLoginSuperAdmin = async () => {
      // Only auto-login if not already authenticated and not loading
      if (!user && !loading) {
        try {
          // Ensure super admin exists and is confirmed before attempting sign-in
          try {
            await supabase.functions.invoke('ensure-super-admin', { body: {} });
          } catch (e) {
            console.warn('ensure-super-admin invocation failed (continuing):', e);
          }

          // Try to sign in directly with Supabase (more reliable than wrapper)
          const { error } = await supabase.auth.signInWithPassword({
            email: SUPER_ADMIN_EMAIL,
            password: SUPER_ADMIN_PASSWORD,
          });

          if (error) {
            // If login fails, try to create the super admin account first
            const { error: signUpError } = await supabase.auth.signUp({
              email: SUPER_ADMIN_EMAIL,
              password: SUPER_ADMIN_PASSWORD,
              options: {
                emailRedirectTo: `${window.location.origin}/`,
                data: {
                  role: 'super_admin'
                }
              }
            });
            
            if (!signUpError) {
              // After signup, try to sign in again
              await supabase.auth.signInWithPassword({
                email: SUPER_ADMIN_EMAIL,
                password: SUPER_ADMIN_PASSWORD,
              });
            }
          }
        } catch (error) {
          console.error('Super admin auto-login failed:', error);
        }
      }
    };

    autoLoginSuperAdmin();
  }, [user, loading]);

  // Claim preview data after successful authentication and set authReady
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
        } finally {
          setAuthReady(true);
        }
      } else if (!loading) {
        // If no user and not loading, set authReady to true
        setAuthReady(true);
      }
    };

    claimPreviewData();
  }, [user, loading]);

  return { user, loading, authReady };
};