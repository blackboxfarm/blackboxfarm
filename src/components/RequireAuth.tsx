import { ReactNode, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AuthModal } from './auth/AuthModal';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';


interface RequireAuthProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export const RequireAuth = ({ children, fallback }: RequireAuthProps) => {
  const { isAuthenticated, loading } = useAuth();
  
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <>
        <div className="flex flex-col items-center justify-center p-8 space-y-4 tech-border rounded-lg">
          <Shield className="h-12 w-12 text-primary" />
          <h3 className="text-xl font-semibold text-foreground">Authentication Required</h3>
          <p className="text-muted-foreground text-center">
            You need to sign in to access this feature.
          </p>
          <Button 
            onClick={() => setShowAuthModal(true)}
            className="tech-button"
          >
            Sign In to Continue
          </Button>
        </div>

        <AuthModal 
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          defaultTab="signin"
        />
      </>
    );
  }

  return <>{children}</>;
};