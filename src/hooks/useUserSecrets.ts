import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Secrets = {
  rpcUrl: string;
  tradingPrivateKey: string;
  functionToken?: string;
  tokenMint?: string;
};

export function useUserSecrets() {
  const [secrets, setSecrets] = useState<Secrets | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ready, setReady] = useState(false);

  // Load secrets from localStorage for password-based auth
  const loadSecrets = useCallback(async () => {
    try {
      // Check if user is authenticated via password auth
      const authStatus = localStorage.getItem('passwordAuth');
      if (authStatus !== 'true') {
        setSecrets(null);
        setReady(false);
        setIsLoading(false);
        return;
      }

      // Load from localStorage for now since we're using password auth
      const storedSecrets = localStorage.getItem('tradingSecrets');
      if (storedSecrets) {
        const parsedSecrets = JSON.parse(storedSecrets);
        setSecrets(parsedSecrets);
        setReady(true);
      } else {
        setSecrets(null);
        setReady(false);
      }

    } catch (error) {
      console.error('Error loading secrets:', error);
      setSecrets(null);
      setReady(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save secrets to localStorage for password-based auth
  const update = useCallback(async (newSecrets: Secrets) => {
    try {
      // Check if user is authenticated via password auth
      const authStatus = localStorage.getItem('passwordAuth');
      if (authStatus !== 'true') {
        throw new Error('User not authenticated');
      }

      // Save to localStorage
      localStorage.setItem('tradingSecrets', JSON.stringify(newSecrets));
      setSecrets(newSecrets);
      setReady(true);
    } catch (error) {
      console.error('Error saving secrets:', error);
      throw error;
    }
  }, []);

  // Clear secrets from localStorage
  const reset = useCallback(async () => {
    try {
      // Check if user is authenticated via password auth
      const authStatus = localStorage.getItem('passwordAuth');
      if (authStatus !== 'true') {
        throw new Error('User not authenticated');
      }

      // Remove from localStorage
      localStorage.removeItem('tradingSecrets');
      setSecrets(null);
      setReady(false);
    } catch (error) {
      console.error('Error clearing secrets:', error);
      throw error;
    }
  }, []);

  // Load secrets on mount and auth change
  useEffect(() => {
    loadSecrets();

    // Listen for localStorage changes (auth status)
    const handleStorageChange = () => {
      loadSecrets();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadSecrets]);

  return { secrets, ready, update, reset, isLoading } as const;
}