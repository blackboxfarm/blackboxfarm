import React, { useEffect } from 'react';
import { RoleBasedNavigation } from '@/components/navigation/RoleBasedNavigation';

// Matrix code effect for background
const matrixCode = `01000001 01001001 00100000 01000101 01110110 01101111 01101100 01110101 01110100 01101001 01101111 01101110
01010100 01110010 01100001 01100100 01101001 01101110 01100111 00100000 01000010 01101111 01110100
01000010 01101100 01100001 01100011 01101011 01000010 01101111 01111000 00100000 01000110 01100001 01110010 01101101
01000001 01110101 01110100 01101111 01101110 01101111 01101101 01101111 01110101 01110011 00100000 01010100 01110010 01100001 01100100 01100101`;

export default function Index() {
  useEffect(() => {
    document.title = "BlackBox Farm - 24/7 Autonomous Trading Platform";
    
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Advanced AI-powered trading system with 24/7 autonomous operation, real-time market analysis, and intelligent risk management.');
    }
    
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) {
      canonicalLink.setAttribute('href', window.location.origin + '/');
    }
  }, []);

  return (
    <div className="min-h-screen tech-gradient relative overflow-hidden">
      {/* Matrix background */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-10 left-10 max-w-lg">
          <pre className="text-accent text-xs font-mono leading-relaxed">
            {matrixCode}
          </pre>
        </div>
        <div className="absolute bottom-10 right-10 max-w-lg">
          <pre className="text-primary text-xs font-mono leading-relaxed">
            {`function autonomousTrading() {
  while (serverRunning) {
    const market = await scanTokens();
    const decision = analyzeVolatility(market);
    
    if (decision.action === 'BUY') {
      await executeTrade(decision);
      await logActivity('Trade executed');
    }
    
    await checkEmergencySells();
    await sleep(intervalSec * 1000);
  }
}`}
          </pre>
        </div>
      </div>

      <div className="relative z-10">
        <RoleBasedNavigation />
      </div>
    </div>
  );
}