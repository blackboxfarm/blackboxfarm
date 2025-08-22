import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Secrets = {
  rpcUrl: string;
  tradingPrivateKey: string;
  functionToken?: string;
};

export function useUserSecrets() {
  const [secrets, setSecrets] = useState<Secrets | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ready, setReady] = useState(false);

  // Load secrets from database
  const loadSecrets = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSecrets(null);
        setReady(false);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_secrets')
        .select('rpc_url, trading_private_key, function_token')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading secrets:', error);
        setSecrets(null);
        setReady(false);
      } else if (data) {
        const loadedSecrets: Secrets = {
          rpcUrl: data.rpc_url,
          tradingPrivateKey: data.trading_private_key,
          functionToken: data.function_token || undefined
        };
        setSecrets(loadedSecrets);
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

  // Save secrets to database
  const update = useCallback(async (newSecrets: Secrets) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('user_secrets')
        .upsert({
          user_id: user.id,
          rpc_url: newSecrets.rpcUrl,
          trading_private_key: newSecrets.tradingPrivateKey,
          function_token: newSecrets.functionToken || null
        });

      if (error) {
        throw error;
      }

      setSecrets(newSecrets);
      setReady(true);
    } catch (error) {
      console.error('Error saving secrets:', error);
      throw error;
    }
  }, []);

  // Clear secrets from database
  const reset = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('user_secrets')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadSecrets();
    });

    return () => subscription.unsubscribe();
  }, [loadSecrets]);

  return { secrets, ready, update, reset, isLoading } as const;
}