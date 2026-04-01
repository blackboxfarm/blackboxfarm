import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FarmBanner } from '@/components/FarmBanner';
import { AbandonedCheckoutBanner } from '@/components/premium/AbandonedCheckoutBanner';
import { SolPriceDisplay } from '@/components/SolPriceDisplay';
import { useAuth } from '@/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Button } from '@/components/ui/button';
import { LogIn, UserPlus, Shield, ChevronRight } from 'lucide-react';
import { AuthModal } from '@/components/auth/AuthModal';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { UserIdentityBadge } from '@/components/layout/UserIdentityBadge';

const NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: 'Join!', path: '/subscriptions' },
  { label: 'Live Feed', path: '/feed' },
  { label: 'Holder Analysis', path: '/holders' },
  { label: 'Bubble Map', path: '/bubblepromo' },
  { label: 'Telegram Bot', path: '/tgbot' },
  // { label: 'Intel Briefings', path: '/intel' }, // Hidden during development
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
      <div className="container mx-auto px-4 py-3 md:py-4">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Logo + title */}
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Link to="/" className="flex items-center gap-2 md:gap-3 shrink-0">
              <img 
                src="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" 
                alt="BlackBox Cube Logo" 
                className="w-8 h-8 md:w-12 md:h-12"
              />
              <h1 className="text-xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent whitespace-nowrap">
                BlackBox Farm
              </h1>
            </Link>
            <SolPriceDisplay size="lg" className="ml-4 hidden md:flex" />
          </div>

          {/* Right: Auth area - compact on mobile */}
          <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
            {isSuperAdmin && (
              <Button 
                onClick={() => navigate("/super-admin")}
                variant="outline"
                size="sm"
                className="border-primary/50 text-primary hover:bg-primary/10 hidden md:flex"
              >
                <Shield className="mr-2 h-4 w-4" />
                Super Admin
              </Button>
            )}
            {isSuperAdmin && (
              <Button 
                onClick={() => navigate("/super-admin")}
                variant="outline"
                size="icon"
                className="border-primary/50 text-primary hover:bg-primary/10 md:hidden h-8 w-8"
              >
                <Shield className="h-4 w-4" />
              </Button>
            )}
            {user ? (
              <UserIdentityBadge />
            ) : (
              <div className="flex items-center gap-1.5 md:gap-2">
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => { setAuthModalTab('signin'); setShowAuthModal(true); }}
                  className="gap-1.5 text-xs md:text-sm h-8 md:h-9 px-2.5 md:px-4"
                >
                  <LogIn className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  <span className="hidden sm:inline">Sign In</span>
                </Button>
                <Button 
                  size="sm"
                  onClick={() => { setAuthModalTab('signup'); setShowAuthModal(true); }}
                  className="gap-1.5 text-xs md:text-sm h-8 md:h-9 px-2.5 md:px-4"
                >
                  <UserPlus className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  <span className="hidden sm:inline">Join BlackBox</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        <p className="text-sm md:text-lg text-muted-foreground mt-1 md:mt-2">
          Putting the needle in the haystack — follow the wallets.
        </p>
      </div>

      {/* Nav Menu */}
      <div className="border-b border-border bg-muted/30 relative">
        <div className="container mx-auto px-4">
          <nav className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-hide">
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
                      : "bg-[hsl(270_25%_18%)] text-muted-foreground/80 hover:text-foreground hover:bg-[hsl(270_25%_24%)]"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        {/* Mobile scroll hint arrow */}
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-muted/80 to-transparent flex items-center justify-end pr-1 pointer-events-none md:hidden">
          <ChevronRight className="h-4 w-4 text-[hsl(270_40%_55%)] animate-pulse" />
        </div>
      </div>

      {/* Abandoned Checkout Reminder */}
      <AbandonedCheckoutBanner />

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
