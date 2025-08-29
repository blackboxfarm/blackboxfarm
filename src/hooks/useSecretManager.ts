import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface SecretData {
  rpcUrl?: string;
  tradingPrivateKey?: string;
  functionToken?: string;
  tokenMint?: string;
}

interface SecretValidation {
  isValid: boolean;
  errors: string[];
}

export const useSecretManager = () => {
  const [secrets, setSecrets] = useState<SecretData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const validateSecrets = useCallback((data: SecretData): SecretValidation => {
    const errors: string[] = [];

    // Validate RPC URL
    if (data.rpcUrl) {
      try {
        const url = new URL(data.rpcUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('RPC URL must use HTTP or HTTPS protocol');
        }
      } catch {
        errors.push('Invalid RPC URL format');
      }
    }

    // Validate trading private key (basic length check for Solana keys)
    if (data.tradingPrivateKey) {
      const key = data.tradingPrivateKey.trim();
      if (key.length < 32 || key.length > 128) {
        errors.push('Trading private key appears to be invalid length');
      }
    }

    // Validate token mint (Solana address format)
    if (data.tokenMint) {
      const mint = data.tokenMint.trim();
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
        errors.push('Token mint must be a valid Solana address');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }, []);

  const loadSecrets = useCallback(async (): Promise<SecretData | null> => {
    if (!user?.id) {
      setError('User not authenticated');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase.rpc('get_user_secrets_decrypted', {
        user_id_param: user.id
      });

      if (fetchError) {
        throw fetchError;
      }

      if (data && data.length > 0) {
        const secretData = data[0];
        const secrets: SecretData = {
          rpcUrl: secretData.rpc_url,
          tradingPrivateKey: secretData.trading_private_key,
          functionToken: secretData.function_token
        };

        // Validate loaded secrets
        const validation = validateSecrets(secrets);
        if (!validation.isValid) {
          console.warn('Loaded secrets have validation issues:', validation.errors);
          setError(`Secret validation warnings: ${validation.errors.join(', ')}`);
        }

        setSecrets(secrets);
        return secrets;
      }

      setSecrets(null);
      return null;
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to load secrets';
      setError(errorMessage);
      console.error('Error loading secrets:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, validateSecrets]);

  const updateSecrets = useCallback(async (newSecrets: SecretData): Promise<boolean> => {
    if (!user?.id) {
      setError('User not authenticated');
      return false;
    }

    // Validate secrets before saving
    const validation = validateSecrets(newSecrets);
    if (!validation.isValid) {
      setError(`Validation failed: ${validation.errors.join(', ')}`);
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('user_secrets')
        .upsert({
          user_id: user.id,
          rpc_url: newSecrets.rpcUrl || '',
          trading_private_key: newSecrets.tradingPrivateKey || '',
          function_token: newSecrets.functionToken || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (updateError) {
        throw updateError;
      }

      setSecrets(newSecrets);

      // Log security event
      await supabase.functions.invoke('security-logger', {
        body: {
          event: 'SECRETS_UPDATED',
          details: {
            userId: user.id,
            secretsUpdated: Object.keys(newSecrets).filter(key => 
              newSecrets[key as keyof SecretData]
            ),
            timestamp: new Date().toISOString()
          }
        }
      });

      return true;
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to update secrets';
      setError(errorMessage);
      console.error('Error updating secrets:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, validateSecrets]);

  const deleteSecrets = useCallback(async (): Promise<boolean> => {
    if (!user?.id) {
      setError('User not authenticated');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('user_secrets')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        throw deleteError;
      }

      setSecrets(null);

      // Log security event
      await supabase.functions.invoke('security-logger', {
        body: {
          event: 'SECRETS_DELETED',
          details: {
            userId: user.id,
            timestamp: new Date().toISOString()
          }
        }
      });

      return true;
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to delete secrets';
      setError(errorMessage);
      console.error('Error deleting secrets:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const hasSecrets = useCallback((): boolean => {
    return !!(secrets?.rpcUrl && secrets?.tradingPrivateKey);
  }, [secrets]);

  const getSecretStatus = useCallback((): { [key: string]: boolean } => {
    return {
      rpcUrl: !!secrets?.rpcUrl,
      tradingPrivateKey: !!secrets?.tradingPrivateKey,
      functionToken: !!secrets?.functionToken,
      tokenMint: !!secrets?.tokenMint
    };
  }, [secrets]);

  // Load secrets when user changes
  useEffect(() => {
    if (user?.id) {
      loadSecrets();
    } else {
      setSecrets(null);
      setError(null);
    }
  }, [user?.id, loadSecrets]);

  return {
    secrets,
    isLoading,
    error,
    loadSecrets,
    updateSecrets,
    deleteSecrets,
    validateSecrets,
    hasSecrets,
    getSecretStatus,
    ready: !!secrets && hasSecrets()
  };
};