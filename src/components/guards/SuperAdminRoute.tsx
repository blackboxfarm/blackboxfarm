import React from "react";
import { Navigate } from "react-router-dom";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAuth } from "@/hooks/useAuth";
import { PageLoader } from "@/components/ui/lazy-loader";

interface SuperAdminRouteProps {
  children: React.ReactNode;
}

export const SuperAdminRoute: React.FC<SuperAdminRouteProps> = ({ children }) => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: rolesLoading } = useUserRoles();

  // Wait for both auth and roles to finish loading
  if (authLoading || rolesLoading) {
    return <PageLoader />;
  }

  // Not logged in → send to auth
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  // Logged in but not super admin → 404 (don't reveal the route exists)
  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
