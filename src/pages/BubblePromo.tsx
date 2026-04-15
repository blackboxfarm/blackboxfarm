import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import PublicBubbleMap from "@/components/bubble-map/PublicBubbleMap";
import { BubbleMapTierGrid } from "@/components/bubble-map/BubbleMapTierGrid";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TestimonialCarousel } from "@/components/testimonials/TestimonialCarousel";

export default function BubblePromo() {
  const { user, loading } = useAuth();
  const [initialToken, setInitialToken] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token') || urlParams.get('mint');
    if (tokenParam) setInitialToken(tokenParam.trim());
  }, []);

  // Redirect logged-in users to the full bubblemap, preserving query params
  if (!loading && user) {
    const search = window.location.search;
    return <Navigate to={`/bubblemap${search}`} replace />;
  }
  return (
    <SiteLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6" data-oracle-hint="1 free deep scan per day — paste a token address to start" data-oracle-zone="bubblepromo-main">
        <PublicBubbleMap mode="promo" showUpgradePrompt initialToken={initialToken || undefined} />

        {/* Testimonial Carousel */}
        <div className="max-w-4xl mx-auto">
          <TestimonialCarousel />
        </div>
        
        <Card data-oracle-hint="Sign up free to unlock full Bubble Map features" data-oracle-zone="bubblepromo-tiers">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">🫧 Bubble Map — Feature Tiers</CardTitle>
          </CardHeader>
          <CardContent>
            <BubbleMapTierGrid />
          </CardContent>
        </Card>
      </div>
    </SiteLayout>
  );
}
