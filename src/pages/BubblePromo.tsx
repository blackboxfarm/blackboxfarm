import React from "react";
import PublicBubbleMap from "@/components/bubble-map/PublicBubbleMap";
import { BubbleMapTierGrid } from "@/components/bubble-map/BubbleMapTierGrid";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BubblePromo() {
  return (
    <SiteLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <PublicBubbleMap mode="promo" showUpgradePrompt />
        
        <Card>
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
