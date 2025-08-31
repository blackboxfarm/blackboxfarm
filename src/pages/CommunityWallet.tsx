import React from 'react';
import CommunityWalletDashboard from '@/components/blackbox/CommunityWalletDashboard';
import { RequireAuth } from '@/components/RequireAuth';

export default function CommunityWallet() {
  return (
    <RequireAuth>
      <div className="container mx-auto py-8">
        <CommunityWalletDashboard />
      </div>
    </RequireAuth>
  );
}