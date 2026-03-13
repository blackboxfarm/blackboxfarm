import React from "react";
import { useNavigate } from "react-router-dom";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { PricingTable } from "@/components/premium/PricingTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Sparkles } from "lucide-react";

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // If not logged in, send to auth
  if (!user) {
    navigate('/auth?tab=signup', { replace: true });
    return null;
  }

  const handleSkipFree = () => {
    localStorage.setItem('bbx_onboarding_done', '1');
    navigate('/dashboard', { replace: true });
  };

  return (
    <SiteLayout>
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        {/* Welcome header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            Welcome to BlackBox Farm
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Choose Your Plan
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Pick the tier that fits your trading style. You can always upgrade later from your dashboard.
          </p>
        </div>

        {/* Pricing Table (reused) */}
        <PricingTable />

        {/* Skip / Continue Free */}
        <div className="text-center space-y-3 pb-8">
          <Button 
            variant="ghost" 
            size="lg"
            onClick={handleSkipFree}
            className="text-muted-foreground hover:text-foreground gap-2"
          >
            Continue with Free plan
            <ArrowRight className="w-4 h-4" />
          </Button>
          <p className="text-xs text-muted-foreground">
            No credit card required. Upgrade anytime.
          </p>
        </div>
      </div>
    </SiteLayout>
  );
}
