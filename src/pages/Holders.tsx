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
      <div className="container mx-auto py-6 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start space-y-4 md:space-y-0">
          <div className="text-center md:text-left flex-1 space-y-4">
            <div className="flex items-center justify-center md:justify-start gap-3">
              <img 
                src="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" 
                alt="BlackBox Cube Logo" 
                className="w-10 h-10 md:w-12 md:h-12"
              />
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Holders Analysis
              </h1>
              <SolPriceDisplay size="lg" className="ml-4" />
            </div>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto md:mx-0">
              Analyze token holder distribution and wallet categories
            </p>
            <div className="flex justify-center md:hidden space-x-3">
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
            <AuthButton />
          </div>
        </div>

        {/* Main Content */}
        <div className="w-full md:w-3/4 md:mx-auto px-[5px] md:px-6 py-4 md:py-8">
          <BaglessHoldersReport initialToken={tokenFromUrl} />
        </div>

        {/* Marketing Section */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-8">
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div>
                <h3 className="text-2xl font-bold text-primary mb-2">Cheaper</h3>
                <p className="text-muted-foreground">We Undercut our competitors with transparent flat-rate pricing</p>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-primary mb-2">Security First</h3>
                <p className="text-muted-foreground">2FA, phone verification, and enterprise-grade encryption</p>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-primary mb-2">Real-Time</h3>
                <p className="text-muted-foreground">Live dashboard, instant execution, 24/7 monitoring</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}