import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Shield, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface AdBannerProps {
  size: 'leaderboard' | 'rectangle' | 'mobile';
  position: number;
}

export function AdBanner({ size, position }: AdBannerProps) {
  const [banner, setBanner] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBanner();
  }, [position]);

  const fetchBanner = async () => {
    try {
      const { data } = await supabase.functions.invoke('get-banner-for-position', {
        body: { position }
      });
      
      if (data?.banner) {
        setBanner(data.banner);
      } else {
        // Fallback to default ad
        setBanner(getDefaultAd(position));
      }
    } catch (error) {
      console.error('Failed to fetch banner:', error);
      setBanner(getDefaultAd(position));
    } finally {
      setLoading(false);
    }
  };

  const getDefaultAd = (pos: number) => {
    const adContent = [
      {
        title: "CryptoAnalyzer Pro",
        subtitle: "Advanced Portfolio Tracking",
        description: "Track 10,000+ tokens with real-time alerts",
        cta: "Start Free Trial",
        icon: 'TrendingUp',
        gradient: "from-blue-500 to-purple-600"
      },
      {
        title: "SecureVault DeFi",
        subtitle: "Multi-Chain Wallet Security",
        description: "Protect your assets across 15+ networks",
        cta: "Secure Now",
        icon: 'Shield',
        gradient: "from-green-500 to-teal-600"
      },
      {
        title: "FlashSwap Exchange",
        subtitle: "Lightning Fast Trading",
        description: "0.1% fees • MEV protection • $2B liquidity",
        cta: "Trade Now",
        icon: 'Zap',
        gradient: "from-orange-500 to-red-600"
      }
    ];
    return adContent[pos - 1] || adContent[0];
  };

  const handleClick = async () => {
    if (banner?.id && banner?.link_url) {
      // Log click
      await supabase.from('banner_clicks').insert({
        banner_id: banner.id,
        session_id: sessionStorage.getItem('session_id') || crypto.randomUUID()
      });
      
      // Open link
      window.open(banner.link_url, '_blank');
    }
  };

  if (loading || !banner) return null;

  const IconComponent = banner.icon === 'Shield' ? Shield : banner.icon === 'Zap' ? Zap : TrendingUp;
  const displayData = {
    title: banner.title,
    subtitle: banner.description || '',
    description: banner.description || '',
    cta: 'Learn More',
    gradient: banner.gradient || 'from-blue-500 to-purple-600',
    image_url: banner.image_url
  };

  if (size === 'mobile') {
    return (
      <Card className="mb-4 overflow-hidden cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-primary/20" onClick={handleClick}>
        {displayData.image_url ? (
          <div className="relative w-full" style={{ aspectRatio: 'auto' }}>
            <img 
              src={displayData.image_url} 
              alt={displayData.title}
              className="w-full h-auto object-contain"
            />
          </div>
        ) : (
          <div className={`bg-gradient-to-r ${displayData.gradient} p-3 text-white`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconComponent size={20} />
                <div>
                  <div className="font-semibold text-sm">{displayData.title}</div>
                  <div className="text-xs opacity-90">{displayData.description}</div>
                </div>
              </div>
              <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                {displayData.cta}
              </Badge>
            </div>
            <div className="text-xs opacity-75 mt-1">Sponsored</div>
          </div>
        )}
      </Card>
    );
  }

  if (size === 'rectangle') {
    return (
      <Card className="mb-4 overflow-hidden cursor-pointer w-[300px] mx-auto shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-primary/20" onClick={handleClick}>
        {displayData.image_url ? (
          <div className="relative w-[300px] h-[250px]">
            <img 
              src={displayData.image_url} 
              alt={displayData.title}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className={`bg-gradient-to-br ${displayData.gradient} p-6 text-white h-64 flex flex-col justify-between`}>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <IconComponent size={24} />
                <Badge variant="secondary" className="bg-white/20 text-white border-white/30 text-xs">
                  Sponsored
                </Badge>
              </div>
              <h3 className="text-xl font-bold mb-1">{displayData.title}</h3>
              <p className="text-sm opacity-90 mb-2">{displayData.subtitle}</p>
              <p className="text-sm opacity-80">{displayData.description}</p>
            </div>
            <div className="flex justify-between items-end">
              <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 hover:bg-white/30 transition-colors">
                <span className="font-medium">{displayData.cta}</span>
              </div>
            </div>
          </div>
        )}
      </Card>
    );
  }

  // Leaderboard (728x90 equivalent)
  return (
      <Card className="mb-4 overflow-hidden cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-primary/20 w-[450px] mx-auto" onClick={handleClick}>
      {displayData.image_url ? (
        <img 
          src={displayData.image_url} 
          alt={displayData.title}
          className="w-full aspect-[16/4] object-contain"
        />
      ) : (
        <div className={`bg-gradient-to-r ${displayData.gradient} p-4 text-white`}>
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-4">
              <IconComponent size={32} />
              <div>
                <h3 className="text-lg font-bold">{displayData.title}</h3>
                <p className="text-sm opacity-90">{displayData.subtitle} • {displayData.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                {displayData.cta}
              </Badge>
              <div className="text-xs opacity-60">Sponsored</div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}