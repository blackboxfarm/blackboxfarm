import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AuthModal } from './AuthModal';
import { useAuth } from '@/hooks/useAuth';
import { LogIn, User, LogOut } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export const AuthButton = () => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'signup'>('signin');
  const { user, signOut, loading } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  const openSignIn = () => {
    setAuthModalTab('signin');
    setShowAuthModal(true);
  };

  const openSignUp = () => {
    setAuthModalTab('signup');
    setShowAuthModal(true);
  };

  if (loading) {
    return (
      <Button variant="outline" disabled className="glow-soft">
        <LogIn className="mr-2 h-4 w-4" />
        Loading...
      </Button>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <PreviewSuperAdminButton />
        <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="glow-soft gap-2">
            <User className="h-4 w-4" />
            {user.email}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="tech-border">
          <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-2">
        <Button 
          variant="outline" 
          onClick={openSignIn}
          className="glow-soft"
        >
          <LogIn className="mr-2 h-4 w-4" />
          Sign In
        </Button>
        <Button 
          onClick={openSignUp}
          className="tech-button animate-pulse-glow"
        >
          Join BlackBox
        </Button>
      </div>

      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultTab={authModalTab}
      />
    </>
  );
};