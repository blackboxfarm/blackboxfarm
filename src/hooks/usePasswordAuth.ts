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
      const { data, error } = await supabase
        .from('access_passwords')
        .select('password_hash')
        .eq('password_hash', password)
        .eq('is_active', true)
        .single();

      if (!error && data) {
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