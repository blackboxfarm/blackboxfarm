import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BaglessHoldersReport } from "@/components/BaglessHoldersReport";
import { AuthButton } from "@/components/auth/AuthButton";
import { FarmBanner } from "@/components/FarmBanner";
import { NotificationCenter } from "@/components/NotificationCenter";
import { UserSettingsDropdown } from "@/components/settings/UserSettingsDropdown";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Shield } from "lucide-react";
import { SolPriceDisplay } from "@/components/SolPriceDisplay";
import { TelegramWebViewBanner } from "@/components/TelegramWebViewBanner";
import holdersLogo from "@/assets/holders-logo.png";

export default function Holders() {
  const [tokenFromUrl, setTokenFromUrl] = useState<string>("");
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRoles();
  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (tokenParam) {
      setTokenFromUrl(tokenParam.trim());
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Telegram WebView Banner */}
      <TelegramWebViewBanner />
      
      {/* Farm Banner Header */}
      <FarmBanner />
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
                  Holders Analysis
                </h1>
              </div>
              <SolPriceDisplay size="lg" className="md:ml-4" />
            </div>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto md:mx-0">
              Analyze token holder distribution and wallet categories
            </p>
            {/* Mobile header actions */}
            <div className="flex justify-center md:hidden items-center gap-2">
              <NotificationCenter />
              {user && <UserSettingsDropdown />}
              {!user && <AuthButton />}
            </div>
          </div>
          {/* Desktop header actions */}
          <div className="hidden md:flex flex-shrink-0 items-center gap-2">
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
            {!user && <AuthButton />}
          </div>
        </div>

        {/* Main Content */}
        <div className="w-full">
          <BaglessHoldersReport initialToken={tokenFromUrl} />
        </div>
      </div>
    </div>
  );
}