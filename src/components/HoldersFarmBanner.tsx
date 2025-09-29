import React from 'react';
import { FarmBanner } from './FarmBanner';

export const HoldersFarmBanner = () => {
  return (
    <div className="w-full">
      {/* Farm illustration banner */}
      <FarmBanner />
      
      {/* Header with Black Box Farm branding */}
      <div className="tech-border p-4 md:p-6 border-t-0">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3 md:gap-4">
            {/* Black Box Cube Logo */}
            <div className="w-10 h-10 md:w-12 md:h-12 flex-shrink-0">
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
              <h1 className="text-xl md:text-3xl font-bold accent-gradient bg-clip-text text-transparent">
                BlackBox Farm
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                Putting the needle in the haystack for the whole fam
              </p>
            </div>
          </div>
          
          {/* Solana Live indicator */}
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2 md:px-3 py-1 md:py-2 border">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs md:text-sm font-medium code-text">SOLANA LIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
};