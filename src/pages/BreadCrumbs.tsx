import React from 'react';
import { BreadCrumbsInterface } from '@/components/breadcrumbs/BreadCrumbsInterface';

const BreadCrumbs = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-foreground mb-2">
              BreadCrumbs
            </h1>
            <p className="text-xl text-muted-foreground">
              Track Solana token metadata and socials across 50+ platforms
            </p>
          </div>
          
          <BreadCrumbsInterface />
        </div>
      </div>
    </div>
  );
};

export default BreadCrumbs;