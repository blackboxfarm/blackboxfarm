import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePreviewSuperAdmin } from './usePreviewSuperAdmin';

type UserRole = 'super_admin' | 'admin' | 'moderator' | 'user';

interface UserRoles {
  roles: UserRole[];
  isLoading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  hasRole: (role: UserRole) => boolean;
  refreshRoles: () => Promise<void>;
}

export const useUserRoles = (): UserRoles => {
  const { user, isAuthenticated } = useAuth();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isPreviewAdmin = usePreviewSuperAdmin();

  const fetchUserRoles = async () => {
    // Preview bypass grants super_admin without requiring auth/session
    if (isPreviewAdmin) {
      setRoles(['super_admin']);
      setIsLoading(false);
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
      if (isSA === true) {
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
  };

  useEffect(() => {
    fetchUserRoles();
  }, [user, isAuthenticated, isPreviewAdmin]);

  const hasRole = (role: UserRole): boolean => {
    return roles.includes(role);
  };

  const isSuperAdmin = hasRole('super_admin');
  const isAdmin = hasRole('admin') || isSuperAdmin;

  return {
    roles,
    isLoading,
    isSuperAdmin,
    isAdmin,
    hasRole,
    refreshRoles: fetchUserRoles,
  };
};