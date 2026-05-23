// SINGLE AUTH LISTENER — do not add another `supabase.auth.onAuthStateChange`
// elsewhere in the app. Duplicate listeners contend for the Supabase storage
// lock on tab focus / token refresh and freeze the browser. Other hooks must
// consume `useAuth()` (or `useAuthContext()`) instead of subscribing again.
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, redirectUrl?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
  resendVerification: (email: string) => Promise<{ error: Error | null }>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Avoid churning state on tab focus / token refresh — only update when
        // the user identity or access token actually changes. Otherwise React
        // sees a brand-new `user` object reference, which cascades through
        // contexts (e.g. UserRoles) and unmounts forms mid-edit.
        setSession(prev => {
          if (prev?.access_token === session?.access_token && prev?.user?.id === session?.user?.id) {
            return prev;
          }
          return session;
        });
        setUser(prev => {
          const nextId = session?.user?.id ?? null;
          const prevId = prev?.id ?? null;
          if (prevId === nextId) return prev;
          return session?.user ?? null;
        });

        if (event !== 'INITIAL_SESSION') {
          setLoading(false);
        }

        // Track login activity
        if (event === 'SIGNED_IN' && session?.user?.id) {
          supabase.rpc('track_user_login', { p_user_id: session.user.id }).then();
          if (session.user.email) {
            try { localStorage.setItem('bbx_last_email', session.user.email.toLowerCase().trim()); } catch {}
          }
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
      })
      .catch((err) => {
        console.error('[Auth] getSession failed:', err);
      })
      .finally(() => setLoading(false));

    // Safety watchdog — if auth bootstrap stalls (network blip, token refresh
    // failure), force loading=false so gated routes (Super Admin etc.) render
    // instead of hanging on a spinner forever. The auth listener will still
    // update session/user state if/when the network recovers.
    const watchdog = setTimeout(() => {
      setLoading((prev) => {
        if (prev) console.warn('[Auth] bootstrap watchdog fired — forcing loading=false');
        return false;
      });
    }, 5000);

    // Detect OAuth error params in URL (from failed provider callbacks)
    const detectOAuthErrors = () => {
      const hash = window.location.hash;
      const search = window.location.search;
      const params = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : '');
      const searchParams = new URLSearchParams(search);

      // Check both hash and search params
      const error = params.get('error') || searchParams.get('error');
      const errorDescription = params.get('error_description') || searchParams.get('error_description');
      const errorCode = params.get('error_code') || searchParams.get('error_code');

      if (error) {
        const description = errorDescription
          ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
          : `Error code: ${errorCode || 'unknown'}`;

        toast.error(`Login failed: ${error}`, {
          description,
          duration: 10000,
        });

        // Clear error params from URL without reload
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
    };

    detectOAuthErrors();

    return () => {
      clearTimeout(watchdog);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, redirectUrl?: string) => {
    const redirectTo = redirectUrl || window.location.href;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    return { error };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  };

  const resendVerification = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: `${window.location.origin}/`
      }
    });
    return { error };
  };

  const value: AuthContextValue = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    resendVerification,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
