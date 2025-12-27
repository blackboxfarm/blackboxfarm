import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from './AuthContext';
import { usePreviewSuperAdmin } from '@/hooks/usePreviewSuperAdmin';

type UserRole = 'super_admin' | 'admin' | 'moderator' | 'user';

interface UserRolesContextValue {
  roles: UserRole[];
  isLoading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  hasRole: (role: UserRole) => boolean;
  refreshRoles: () => Promise<void>;
}

const UserRolesContext = createContext<UserRolesContextValue | null>(null);

export const UserRolesProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated, loading: authLoading } = useAuthContext();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isPreviewAdmin = usePreviewSuperAdmin();

  const fetchUserRoles = useCallback(async () => {
    // Preview bypass grants super_admin without requiring auth/session
    if (isPreviewAdmin) {
      setRoles(['super_admin']);
      setIsLoading(false);
      return;
    }

    // Don't decide roles until auth has finished bootstrapping; prevents "flash logout".
    if (authLoading) {
      setIsLoading(true);
      return;
    }

    if (!user || !isAuthenticated) {
      setRoles([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Prefer RPC to bypass potential RLS on user_roles
      const { data: isSA, error: saError } = await supabase.rpc('is_super_admin', { _user_id: user.id });
      if (saError) {
        console.warn('RPC is_super_admin failed, falling back to user_roles SELECT:', saError);
      }
      const isSuper = isSA === true || (typeof isSA === 'string' && (isSA === 'true' || isSA === 't')) || (typeof isSA === 'number' && isSA === 1);
      if (isSuper) {
        setRoles(['super_admin']);
      } else {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (error) {
          console.error('Error fetching user roles:', error);
          setRoles([]);
        } else {
          setRoles(data?.map(item => item.role) || []);
        }
      }
    } catch (error) {
      console.error('Error fetching user roles:', error);
      setRoles([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, isAuthenticated, isPreviewAdmin, authLoading]);

  useEffect(() => {
    fetchUserRoles();
  }, [fetchUserRoles]);

  const hasRole = useCallback((role: UserRole): boolean => {
    return roles.includes(role);
  }, [roles]);

  const isSuperAdmin = roles.includes('super_admin');
  const isAdmin = roles.includes('admin') || isSuperAdmin;

  const value: UserRolesContextValue = {
    roles,
    isLoading,
    isSuperAdmin,
    isAdmin,
    hasRole,
    refreshRoles: fetchUserRoles,
  };

  return (
    <UserRolesContext.Provider value={value}>
      {children}
    </UserRolesContext.Provider>
  );
};

export const useUserRolesContext = () => {
  const context = useContext(UserRolesContext);
  if (!context) {
    throw new Error('useUserRolesContext must be used within a UserRolesProvider');
  }
  return context;
};
