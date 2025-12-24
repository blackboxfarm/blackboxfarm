import { useAuthContext } from '@/contexts/AuthContext';

/**
 * Hook to access authentication state and methods.
 * This is now a thin wrapper around AuthContext for backwards compatibility.
 */
export const useAuth = () => {
  return useAuthContext();
};
