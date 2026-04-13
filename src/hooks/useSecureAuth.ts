import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Get device fingerprint if available
const getDeviceFingerprint = async (): Promise<string | undefined> => {
  try {
    const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    return result.visitorId;
  } catch {
    return undefined;
  }
};

interface AuthError {
  message: string;
  code?: string;
  details?: any;
}

interface RateLimitState {
  attempts: number;
  lastAttempt: number;
  isBlocked: boolean;
  blockUntil: number;
}

const MAX_ATTEMPTS = 5;
const BLOCK_DURATION = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW = 5 * 60 * 1000; // 5 minutes

export const useSecureAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>({
    attempts: 0,
    lastAttempt: 0,
    isBlocked: false,
    blockUntil: 0
  });

  // Initialize rate limit state from localStorage
  useEffect(() => {
    const storedState = localStorage.getItem('auth_rate_limit');
    if (storedState) {
      try {
        const parsed = JSON.parse(storedState);
        const now = Date.now();
        
        // Check if block period has expired
        if (parsed.blockUntil && now > parsed.blockUntil) {
          setRateLimitState({
            attempts: 0,
            lastAttempt: 0,
            isBlocked: false,
            blockUntil: 0
          });
          localStorage.removeItem('auth_rate_limit');
        } else {
          setRateLimitState(parsed);
        }
      } catch (error) {
        console.error('Error parsing rate limit state:', error);
        localStorage.removeItem('auth_rate_limit');
      }
    }
  }, []);

  // Enhanced auth state management
  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Log authentication events for audit
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          try {
            await logSecurityEvent(event, {
              userId: session?.user?.id,
              timestamp: new Date().toISOString(),
              userAgent: navigator.userAgent
            });

            // Run anomaly detection on sign-in
            if (event === 'SIGNED_IN' && session?.user?.id) {
              runAnomalyDetection(session.user.id).catch(err =>
                console.error('Anomaly detection failed:', err)
              );
            }
          } catch (error) {
            console.error('Failed to log security event:', error);
          }
        }

        // Reset rate limiting on successful sign in
        if (event === 'SIGNED_IN') {
          setRateLimitState({
            attempts: 0,
            lastAttempt: 0,
            isBlocked: false,
            blockUntil: 0
          });
          localStorage.removeItem('auth_rate_limit');
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const updateRateLimit = useCallback((success: boolean) => {
    const now = Date.now();
    
    setRateLimitState(prev => {
      const newState = { ...prev };
      
      if (success) {
        // Reset on success
        newState.attempts = 0;
        newState.lastAttempt = 0;
        newState.isBlocked = false;
        newState.blockUntil = 0;
      } else {
        // Increment attempts on failure
        if (now - prev.lastAttempt > ATTEMPT_WINDOW) {
          // Reset attempts if outside window
          newState.attempts = 1;
        } else {
          newState.attempts = prev.attempts + 1;
        }
        
        newState.lastAttempt = now;
        
        // Block if too many attempts
        if (newState.attempts >= MAX_ATTEMPTS) {
          newState.isBlocked = true;
          newState.blockUntil = now + BLOCK_DURATION;
        }
      }
      
      // Persist to localStorage
      if (newState.attempts > 0 || newState.isBlocked) {
        localStorage.setItem('auth_rate_limit', JSON.stringify(newState));
      } else {
        localStorage.removeItem('auth_rate_limit');
      }
      
      return newState;
    });
  }, []);

  const validateInput = (email: string, password: string): AuthError | null => {
    if (!email || !email.trim()) {
      return { message: 'Email is required' };
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { message: 'Please enter a valid email address' };
    }
    
    if (!password || password.length < 6) {
      return { message: 'Password must be at least 6 characters long' };
    }
    
    if (password.length > 128) {
      return { message: 'Password is too long' };
    }
    
    return null;
  };

  const signUp = async (email: string, password: string) => {
    // Input validation
    const validationError = validateInput(email, password);
    if (validationError) {
      return { error: validationError };
    }

    // Rate limiting check
    if (rateLimitState.isBlocked) {
      const timeLeft = Math.ceil((rateLimitState.blockUntil - Date.now()) / 60000);
      return {
        error: {
          message: `Too many failed attempts. Please try again in ${timeLeft} minutes.`,
          code: 'RATE_LIMITED'
        }
      };
    }

    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      });

      if (error) {
        updateRateLimit(false);
        return { 
          error: {
            message: error.message,
            code: error.message?.includes('already') ? 'USER_EXISTS' : 'SIGNUP_FAILED'
          }
        };
      }

      updateRateLimit(true);
      return { error: null };
    } catch (error: any) {
      updateRateLimit(false);
      return { 
        error: {
          message: 'An unexpected error occurred. Please try again.',
          details: error
        }
      };
    }
  };

  const signIn = async (email: string, password: string) => {
    // Input validation
    const validationError = validateInput(email, password);
    if (validationError) {
      return { error: validationError };
    }

    // Rate limiting check
    if (rateLimitState.isBlocked) {
      const timeLeft = Math.ceil((rateLimitState.blockUntil - Date.now()) / 60000);
      return {
        error: {
          message: `Too many failed attempts. Please try again in ${timeLeft} minutes.`,
          code: 'RATE_LIMITED'
        }
      };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (error) {
        updateRateLimit(false);
        return { 
          error: {
            message: error.message,
            code: error.message?.includes('Invalid') ? 'INVALID_CREDENTIALS' : 'SIGNIN_FAILED'
          }
        };
      }

      updateRateLimit(true);
      return { error: null };
    } catch (error: any) {
      updateRateLimit(false);
      return { 
        error: {
          message: 'An unexpected error occurred. Please try again.',
          details: error
        }
      };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      return { error };
    } catch (error: any) {
      return { 
        error: {
          message: 'Failed to sign out. Please try again.',
          details: error
        }
      };
    }
  };

  const resetPassword = async (email: string) => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: { message: 'Please enter a valid email address' } };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`
      });
      return { error };
    } catch (error: any) {
      return { 
        error: {
          message: 'Failed to send reset email. Please try again.',
          details: error
        }
      };
    }
  };

  const updatePassword = async (password: string) => {
    if (!password || password.length < 6) {
      return { error: { message: 'Password must be at least 6 characters long' } };
    }

    try {
      const { error } = await supabase.auth.updateUser({ password });
      return { error };
    } catch (error: any) {
      return { 
        error: {
          message: 'Failed to update password. Please try again.',
          details: error
        }
      };
    }
  };

  const resendVerification = async (email: string) => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: { message: 'Please enter a valid email address' } };
    }

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      });
      return { error };
    } catch (error: any) {
      return { 
        error: {
          message: 'Failed to resend verification email. Please try again.',
          details: error
        }
      };
    }
  };

  const logSecurityEvent = async (event: string, details: any) => {
    try {
      // This would typically go to a security logging service
      // For now, we'll use Supabase edge function
      await supabase.functions.invoke('security-logger', {
        body: {
          event,
          details,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  };

  const runAnomalyDetection = async (userId: string) => {
    try {
      const fingerprint = await getDeviceFingerprint();
      
      const { data, error } = await supabase.functions.invoke('login-anomaly-detector', {
        body: {
          user_id: userId,
          device_fingerprint: fingerprint,
          device_name: navigator.platform || navigator.userAgent.substring(0, 50),
          user_agent: navigator.userAgent,
          login_method: 'password',
        }
      });

      if (error) {
        console.error('Anomaly detection error:', error);
        return;
      }

      // If account is locked, sign out immediately
      if (data?.blocked) {
        console.warn('Account is locked:', data.reason);
        await supabase.auth.signOut();
      }

      if (data?.suspicious) {
        console.warn('Suspicious login detected:', data.reasons);
      }
    } catch (err) {
      console.error('Failed to run anomaly detection:', err);
    }
  };

  const checkAccountLockdown = async (userId: string): Promise<boolean> => {
    try {
      const { data } = await supabase
        .from('account_lockdowns')
        .select('id')
        .eq('user_id', userId)
        .eq('is_locked', true)
        .maybeSingle();
      return !!data;
    } catch {
      return false;
    }
  };

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    resendVerification,
    isAuthenticated: !!user,
    rateLimitState,
    isRateLimited: rateLimitState.isBlocked,
    checkAccountLockdown
  };
};