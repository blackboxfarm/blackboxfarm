import React from 'react';
import { FarmBanner } from './FarmBanner';

export const HoldersFarmBanner = () => {
  return (
    <div className="w-full">
      {/* Farm illustration banner - exactly like main page */}
      <FarmBanner />
      
      {/* Main header section - exactly like main page */}
      <div className="w-full bg-background border-b border-border">
        <div className="container mx-auto p-4">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-4">
              {/* BlackBox Cube Logo */}
              <div className="w-12 h-12 flex-shrink-0">
                <img 
                  src="/blackbox-cube-logo.png" 
                  alt="BlackBox Farm Cube Logo"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Fallback to a simple cube if image fails
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                {/* Fallback cube icon */}
                <div className="hidden w-full h-full bg-primary/20 border-2 border-primary rounded-md flex items-center justify-center">
                  <div className="text-primary font-mono text-sm font-bold">BB</div>
                </div>
              </div>
              
              <div>
                <h1 className="text-4xl font-bold mb-2 accent-gradient bg-clip-text text-transparent">
                  BlackBox Farm
                </h1>
              </div>
            </div>
            
            {/* Right side - SOLANA LIVE indicator */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-sm font-medium code-text">SOLANA LIVE</span>
            </div>
          </div>
          
          {/* Quote - exactly like main page */}
          <div className="mb-4">
            <p className="text-muted-foreground text-lg">
              Putting the needle in the Haystack - Bumps for the whole Fam!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};