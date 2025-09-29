import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Shield, Zap } from 'lucide-react';

interface AdBannerProps {
  size: 'leaderboard' | 'rectangle' | 'mobile';
  position: number;
}

export function AdBanner({ size, position }: AdBannerProps) {
  const adContent = [
    {
      title: "CryptoAnalyzer Pro",
      subtitle: "Advanced Portfolio Tracking",
      description: "Track 10,000+ tokens with real-time alerts",
      cta: "Start Free Trial",
      icon: TrendingUp,
      gradient: "from-blue-500 to-purple-600"
    },
    {
      title: "SecureVault DeFi",
      subtitle: "Multi-Chain Wallet Security",
      description: "Protect your assets across 15+ networks",
      cta: "Secure Now",
      icon: Shield,
      gradient: "from-green-500 to-teal-600"
    },
    {
      title: "FlashSwap Exchange",
      subtitle: "Lightning Fast Trading",
      description: "0.1% fees • MEV protection • $2B liquidity",
      cta: "Trade Now",
      icon: Zap,
      gradient: "from-orange-500 to-red-600"
    }
  ];

  const ad = adContent[position - 1] || adContent[0];
  const Icon = ad.icon;

  if (size === 'mobile') {
    return (
      <Card className="mb-4 overflow-hidden">
        <div className={`bg-gradient-to-r ${ad.gradient} p-3 text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon size={20} />
              <div>
                <div className="font-semibold text-sm">{ad.title}</div>
                <div className="text-xs opacity-90">{ad.description}</div>
              </div>
            </div>
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
              {ad.cta}
            </Badge>
          </div>
          <div className="text-xs opacity-75 mt-1">Sponsored</div>
        </div>
      </Card>
    );
  }

  if (size === 'rectangle') {
    return (
      <Card className="mb-4 overflow-hidden">
        <div className={`bg-gradient-to-br ${ad.gradient} p-6 text-white h-64 flex flex-col justify-between`}>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Icon size={24} />
              <Badge variant="secondary" className="bg-white/20 text-white border-white/30 text-xs">
                Sponsored
              </Badge>
            </div>
            <h3 className="text-xl font-bold mb-1">{ad.title}</h3>
            <p className="text-sm opacity-90 mb-2">{ad.subtitle}</p>
            <p className="text-sm opacity-80">{ad.description}</p>
          </div>
          <div className="flex justify-between items-end">
            <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 cursor-pointer hover:bg-white/30 transition-colors">
              <span className="font-medium">{ad.cta}</span>
            </div>
            <div className="text-xs opacity-60">Ad</div>
          </div>
        </div>
      </Card>
    );
  }

  // Leaderboard (728x90 equivalent)
  return (
    <Card className="mb-4 overflow-hidden">
      <div className={`bg-gradient-to-r ${ad.gradient} p-4 text-white`}>
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <Icon size={32} />
            <div>
              <h3 className="text-lg font-bold">{ad.title}</h3>
              <p className="text-sm opacity-90">{ad.subtitle} • {ad.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
              {ad.cta}
            </Badge>
            <div className="text-xs opacity-60">Sponsored</div>
          </div>
        </div>
      </div>
    </Card>
  );
}