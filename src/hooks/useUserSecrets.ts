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

  // Load secrets from Supabase with secure decryption
  const loadSecrets = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setSecrets(null);
        setReady(false);
        setIsLoading(false);
        return;
      }

      // Use the decrypted function for fetching secrets
      const { data, error } = await supabase.rpc('get_user_secrets_decrypted', {
        user_id_param: user.id
      });

      if (error) {
        console.error('Error loading secrets:', error);
        setSecrets(null);
        setReady(false);
      } else if (data && data.length > 0) {
        const secretData = data[0];
        setSecrets({
          rpcUrl: secretData.rpc_url,
          tradingPrivateKey: secretData.trading_private_key,
          functionToken: secretData.function_token,
        });
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

  // Save secrets with automatic encryption
  const update = useCallback(async (newSecrets: Secrets) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Upsert secrets (encryption handled by database triggers)
      const { error } = await supabase
        .from('user_secrets')
        .upsert({
          user_id: user.id,
          rpc_url: newSecrets.rpcUrl,
          trading_private_key: newSecrets.tradingPrivateKey,
          function_token: newSecrets.functionToken || null,
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

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

      if (error) throw error;

      setSecrets(null);
      setReady(false);
    } catch (error) {
      console.error('Error clearing secrets:', error);
      throw error;
    }
  }, []);

  // Load secrets on mount and auth change
  useEffect(() => {
    // Set up auth state listener to reload secrets when auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          loadSecrets();
        } else if (event === 'SIGNED_OUT') {
          setSecrets(null);
          setReady(false);
          setIsLoading(false);
        }
      }
    );

    // Load secrets initially
    loadSecrets();

    return () => subscription.unsubscribe();
  }, [loadSecrets]);

  return { secrets, ready, update, reset, isLoading } as const;
}