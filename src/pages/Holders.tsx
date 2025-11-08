import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BaglessHoldersReport } from "@/components/BaglessHoldersReport";
import { AuthButton } from "@/components/auth/AuthButton";
import { FarmBanner } from "@/components/FarmBanner";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Shield } from "lucide-react";
import { SolPriceDisplay } from "@/components/SolPriceDisplay";

export default function Holders() {
  const [tokenFromUrl, setTokenFromUrl] = useState<string>("");
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRoles();
  const navigate = useNavigate();

  const normalizeMint = (s: string) => {
    let m = s.trim();
    if (m.length > 44 && m.endsWith('pump')) m = m.slice(0, -4);
    if (m.length > 44) m = m.slice(0, 44);
    return m;
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (tokenParam) {
      const normalized = normalizeMint(tokenParam);
      setTokenFromUrl(normalized);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Farm Banner Header */}
      <FarmBanner />
      <div className="container mx-auto py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start space-y-4 md:space-y-0">
          <div className="text-center md:text-left flex-1 space-y-4">
            <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-3">
              <div className="flex items-center gap-2 md:gap-3">
                <img 
                  src="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" 
                  alt="BlackBox Cube Logo" 
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
            <div className="flex justify-center md:hidden space-x-3 hidden">
              <AuthButton />
            </div>
          </div>
          <div className="hidden md:flex flex-shrink-0 items-center gap-3">
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
            <div className="hidden">
              <AuthButton />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="w-full md:w-3/4 md:mx-auto px-2 md:px-6">
          <BaglessHoldersReport initialToken={tokenFromUrl} />
        </div>

      </div>
    </div>
  );
}