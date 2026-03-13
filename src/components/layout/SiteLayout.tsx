import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FarmBanner } from '@/components/FarmBanner';
import { SolPriceDisplay } from '@/components/SolPriceDisplay';
import { useAuth } from '@/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Button } from '@/components/ui/button';
import { LogIn, UserPlus, Shield, User, LogOut } from 'lucide-react';
import { AuthModal } from '@/components/auth/AuthModal';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: 'AI Holder Analysis', path: '/holders' },
  { label: 'Telegram Bot', path: '/tgbot' },
  { label: 'Bubble Map', path: '/bubblepromo' },
  { label: 'Subscribe', path: '/subscriptions' },
];

export function SiteLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { isSuperAdmin } = useUserRoles();
  const location = useLocation();
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'signup'>('signin');

  return (
    <div className="min-h-screen bg-background">
      {/* Farm Banner - clickable to home */}
      <Link to="/">
        <FarmBanner />
      </Link>

      {/* Header */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3">
              <img 
                src="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" 
                alt="BlackBox Cube Logo" 
                className="w-10 h-10 md:w-12 md:h-12"
              />
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                BlackBox Farm
              </h1>
            </Link>
            <SolPriceDisplay size="lg" className="ml-4 hidden md:flex" />
          </div>
          
          <p className="text-lg text-muted-foreground md:hidden">
            Putting the needle in the haystack — follow the wallets.
          </p>

          <div className="flex items-center gap-3">
            {isSuperAdmin && (
              <Button 
                onClick={() => navigate("/super-admin")}
                variant="outline"
                size="sm"
                className="border-primary/50 text-primary hover:bg-primary/10"
              >
                <Shield className="mr-2 h-4 w-4" />
                Super Admin
              </Button>
            )}
            {user ? (
              <>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate('/dashboard')}
                  className="gap-2"
                >
                  <User className="h-4 w-4" />
                  Dashboard
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => signOut()}
                  className="gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="outline"
                  onClick={() => { setAuthModalTab('signin'); setShowAuthModal(true); }}
                  className="gap-2"
                >
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Button>
                <Button 
                  onClick={() => { setAuthModalTab('signup'); setShowAuthModal(true); }}
                  className="gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  Join BlackBox
                </Button>
              </>
            )}
          </div>
        </div>

        <p className="text-lg text-muted-foreground mt-2 hidden md:block">
          Putting the needle in the haystack — follow the wallets.
        </p>
      </div>

      {/* Nav Menu */}
      <div className="border-b border-border bg-muted/30">
        <div className="container mx-auto px-4">
          <nav className="flex items-center gap-1 overflow-x-auto py-1">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors",
                    isActive 
                      ? "bg-accent text-accent-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Body */}
      <main>
        {children}
      </main>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        defaultTab={authModalTab}
      />
    </div>
  );
}
