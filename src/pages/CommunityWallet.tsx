import React from 'react';
import CommunityWalletDashboard from '@/components/blackbox/CommunityWalletDashboard';
import { RequireAuth } from '@/components/RequireAuth';
import { FarmBanner } from '@/components/FarmBanner';
import { AuthButton } from '@/components/auth/AuthButton';
import { NotificationCenter } from '@/components/NotificationCenter';
import { useAuth } from '@/hooks/useAuth';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CommunityWallet() {
  const { user } = useAuth();
  
  return (
    <RequireAuth>
      <div className="min-h-screen bg-background">
        {/* Farm Banner Header */}
        <FarmBanner />
        <div className="container mx-auto py-6 space-y-8">
          {/* Main Header Section */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start space-y-4 md:space-y-0">
          <div className="text-center md:text-left flex-1 space-y-4">
            <div className="flex items-center justify-center md:justify-start gap-3">
              <img 
                src="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" 
                alt="BlackBox Cube Logo" 
                className="w-10 h-10 md:w-12 md:h-12"
              />
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                BlackBox Farm
              </h1>
            </div>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto md:mx-0">
                Putting the needle in the Haystack - Bumps for the whole Fam!
              </p>
              <div className="flex justify-center md:hidden space-x-3">
                <AuthButton />
              </div>
            </div>
            <div className="hidden md:flex flex-shrink-0 items-center gap-3">
              <NotificationCenter />
              <AuthButton />
            </div>
          </div>
          <div className="flex items-center gap-4 mb-8">
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <ArrowLeft className="h-10 w-10 text-primary" strokeWidth={3} />
            </Link>
            <h2 className="text-2xl font-bold">Community Wallet</h2>
          </div>
          <CommunityWalletDashboard />
        </div>
      </div>
    </RequireAuth>
  );
}