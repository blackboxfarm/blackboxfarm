import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const usePasswordAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Check if user is already authenticated from localStorage
    const authStatus = localStorage.getItem('passwordAuth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const authenticate = async (password: string): Promise<boolean> => {
    try {
      // Use the secure function instead of direct database access
      const { data, error } = await supabase.rpc('verify_access_password', { 
        input_password: password 
      });

      if (error) {
        console.error('Authentication error:', error);
        return false;
      }

      if (data === true) {
        setIsAuthenticated(true);
        localStorage.setItem('passwordAuth', 'true');
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
    localStorage.removeItem('passwordAuth');
  };

  return {
    isAuthenticated,
    isLoading,
    authenticate,
    logout
  };
};