import React from "react";
import PublicBubbleMap from "@/components/bubble-map/PublicBubbleMap";
import { SiteLayout } from "@/components/layout/SiteLayout";

export default function BubblePromo() {
  return (
    <SiteLayout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <PublicBubbleMap mode="promo" showUpgradePrompt />
      </div>
    </SiteLayout>
  );
}
