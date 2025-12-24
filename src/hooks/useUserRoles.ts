import { useUserRolesContext } from '@/contexts/UserRolesContext';

export type UserRole = 'super_admin' | 'admin' | 'moderator' | 'user';

export interface UserRoles {
  roles: UserRole[];
  isLoading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  hasRole: (role: UserRole) => boolean;
  refreshRoles: () => Promise<void>;
}

/**
 * Hook to access user roles.
 * This is now a thin wrapper around UserRolesContext for backwards compatibility.
 */
export const useUserRoles = (): UserRoles => {
  return useUserRolesContext();
};
