import { ReactNode } from 'react';
import { usePasswordAuth } from '@/hooks/usePasswordAuth';
import { PasswordLogin } from './PasswordLogin';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, authenticate, logout } = usePasswordAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PasswordLogin onAuthenticate={authenticate} />;
  }

  return (
    <div className="relative">
      <div className="absolute top-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
      {children}
    </div>
  );
};