import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Use sessionStorage instead of localStorage — clears on tab close, 
// and validate against Supabase auth session to prevent trivial bypass
export const usePasswordAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const validateSession = useCallback(async () => {
    // Must have both a Supabase session AND the password token
    const authToken = sessionStorage.getItem('passwordAuthToken');
    if (!authToken) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    // Verify the user still has a valid Supabase session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // No active session — clear the password auth
      sessionStorage.removeItem('passwordAuthToken');
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    // Validate token matches current session user
    const expectedToken = btoa(`${session.user.id}:passwordAuth`);
    if (authToken === expectedToken) {
      setIsAuthenticated(true);
    } else {
      sessionStorage.removeItem('passwordAuthToken');
      setIsAuthenticated(false);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    validateSession();
  }, [validateSession]);

  const authenticate = async (password: string): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No active session — cannot authenticate password');
        return false;
      }

      const { data, error } = await supabase.rpc('verify_access_password', { 
        input_password: password 
      });

      if (error) {
        console.error('Authentication error:', error);
        return false;
      }

      if (data === true) {
        // Create a session-bound token (not just 'true')
        const token = btoa(`${session.user.id}:passwordAuth`);
        setIsAuthenticated(true);
        sessionStorage.setItem('passwordAuthToken', token);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('passwordAuthToken');
    // Also clean up legacy localStorage key if present
    localStorage.removeItem('passwordAuth');
  };

  return {
    isAuthenticated,
    isLoading,
    authenticate,
    logout
  };
};