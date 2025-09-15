import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

// Super admin credentials - in production, this should be moved to environment variables
const SUPER_ADMIN_EMAIL = 'admin@blackbox.farm';
const SUPER_ADMIN_PASSWORD = 'SuperAdmin2024!';

export const useSuperAdminAuth = () => {
  const { user, signIn, loading } = useAuth();

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

  return { user, loading };
};