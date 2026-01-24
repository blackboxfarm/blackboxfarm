import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BaglessHoldersReport } from "@/components/BaglessHoldersReport";
import { AuthButton } from "@/components/auth/AuthButton";

import { NotificationCenter } from "@/components/NotificationCenter";
import { UserSettingsDropdown } from "@/components/settings/UserSettingsDropdown";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useHoldersPageTracking } from "@/hooks/useHoldersPageTracking";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Shield, ExternalLink } from "lucide-react";
import { SolPriceDisplay } from "@/components/SolPriceDisplay";
import { SocialIcon } from "@/components/token/SocialIcon";
import { TelegramWebViewBanner } from "@/components/TelegramWebViewBanner";
import holdersLogo from "@/assets/holders-logo.png";
import holdersHero from "@/assets/holders-hero.png";

export default function Holders() {
  const [tokenFromUrl, setTokenFromUrl] = useState<string>("");
  const [versionParam, setVersionParam] = useState<string>("");
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRoles();
  const navigate = useNavigate();
  
  // Track page visits
  const { trackReportGenerated } = useHoldersPageTracking({
    tokenPreloaded: tokenFromUrl,
    versionParam: versionParam,
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    const vParam = urlParams.get('v');
    if (tokenParam) {
      setTokenFromUrl(tokenParam.trim());
    }
    if (vParam) {
      setVersionParam(vParam);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Telegram WebView Banner */}
      <TelegramWebViewBanner />
      
      {/* Holders Hero Header */}
      <div className="w-full">
        <img 
          src={holdersHero} 
          alt="Holders Intel - Crypto has hands, HOLDER$ shows them" 
          className="w-full h-auto max-h-48 object-cover object-center"
        />
      </div>

      {/* Auth Section - Below Banner */}
      <div className="w-full bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="mx-auto max-w-6xl px-2 md:px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Button 
                onClick={() => navigate("/super-admin")}
                variant="outline"
                size="sm"
                className="border-yellow-400 text-yellow-600 hover:bg-yellow-50"
              >
                <Shield className="mr-2 h-4 w-4" />
                Super Admin
              </Button>
            )}
            <NotificationCenter />
            {user && <UserSettingsDropdown />}
          </div>
          {!user && <AuthButton />}
        </div>
      </div>

      <div className="mx-auto py-6 space-y-4 px-2 md:px-4 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start space-y-4 md:space-y-0">
          <div className="text-center md:text-left flex-1 space-y-4">
            <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-3">
              <div className="flex items-center gap-2 md:gap-3">
                <img 
                  src={holdersLogo} 
                  alt="Holders Analysis Logo" 
                  className="w-8 h-8 md:w-12 md:h-12"
                />
                <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Holders Intel
                </h1>
              </div>
              <SolPriceDisplay size="lg" className="md:ml-4" />
            </div>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto md:mx-0">
              Token Holder Intel & Wallet Analysis
            </p>
          </div>

          {/* Token Announcement Section */}
          <div className="w-full md:w-auto md:max-w-sm">
            <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border border-primary/20 rounded-lg p-4 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                <span className="inline-block px-2 py-0.5 bg-primary/20 text-primary text-xs font-semibold rounded-full uppercase tracking-wide">
                  Coming Soon
                </span>
              </div>
              <p className="text-sm text-foreground font-medium mb-2">
                🚀 Crypto Token to Support the Holders Intel Project
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                TBA — Stay updated and be first to know!
              </p>
              <a
                href="https://x.com/holdersintel"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:bg-foreground/90 transition-colors"
              >
                <SocialIcon platform="twitter" className="w-4 h-4" />
                Follow @holdersintel
                <ExternalLink className="w-3 h-3" />
              </a>
              <p className="text-[10px] text-muted-foreground mt-2">
                Turn on notifications 🔔
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="w-full">
          <BaglessHoldersReport initialToken={tokenFromUrl} onReportGenerated={trackReportGenerated} />
        </div>
      </div>
    </div>
  );
}