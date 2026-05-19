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
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { OracleHoverProvider } from '@/components/chat/OracleHoverProvider';
import { OraclePeek } from '@/components/chat/OraclePeek';
import { useCanonical } from '@/hooks/useCanonical';
import { DevTeamForewardButton } from '@/components/layout/DevTeamForewardButton';

const BASE_NAV_ITEMS = [
  { label: 'Overview', path: '/' },
  { label: 'Join!', path: '/subscriptions' },
  { label: 'Holder Analysis', path: '/holders' },
  { label: 'Bubble Map', path: '/bubblepromo' },
  { label: 'Telegram Bot', path: '/tgbot' },
  { label: '💀 Autopsies', path: '/autopsy' },
];

export function SiteLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { isSuperAdmin } = useUserRoles();
  const location = useLocation();
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);
  useCanonical();

  const { data: intelPublic } = useQuery({
    queryKey: ['intel-public-access'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'intel_briefings_public')
        .maybeSingle();
      return data?.value === 'true';
    },
    staleTime: 60_000,
  });

  const NAV_ITEMS = intelPublic
    ? [...BASE_NAV_ITEMS, { label: 'Intel Briefings', path: '/intel' }]
    : BASE_NAV_ITEMS;
  const FINAL_NAV_ITEMS = isSuperAdmin
    ? [...NAV_ITEMS, { label: '🔴 Live', path: '/feed' }, { label: '🗄 Token Archive', path: '/token-archive' }]
    : NAV_ITEMS;
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'signup'>('signin');

  return (
    <OracleHoverProvider>
    <div className="min-h-screen bg-background">
      {/* Farm Banner - clickable to home, with floating Dev Team Foreward icon */}
      <div className="relative">
        <Link to="/">
          <FarmBanner />
        </Link>
        {/* Foreward icon — floats above the second fence stencil in the banner.
            Second fence sits at x≈600-650 of viewBox 1200 (~52% from left).
            Vertically anchored just above the fence line. */}
        <div
          className="absolute z-20 pointer-events-auto"
          style={{ left: '52%', top: '58%', transform: 'translate(-50%, -100%)' }}
        >
          <DevTeamForewardButton />
        </div>
      </div>

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
                  data-oracle-hint="Join free to unlock AI analysis and whale alerts"
                  data-oracle-zone="join-btn"
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
          <div className="flex items-center justify-between gap-2">
            <nav className="flex flex-wrap md:flex-nowrap items-center gap-0.5 md:gap-1 md:overflow-x-auto py-1 scrollbar-hide flex-1 min-w-0">
              {FINAL_NAV_ITEMS.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "px-2 py-1.5 text-xs md:px-4 md:py-2.5 md:text-sm font-medium rounded-md whitespace-nowrap transition-colors",
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
        </div>
        {/* Mobile scroll hint arrow */}
        {/* (scroll hint removed — mobile nav now wraps to multiple rows) */}
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

      {/* Sentient Web Assistant */}
      <ChatWidget />
      <OraclePeek />
    </div>
    </OracleHoverProvider>
  );
}
