import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Network } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PublicBubbleMap from "@/components/bubble-map/PublicBubbleMap";

export default function BubblePromo() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Network className="h-4 w-4 text-primary" />
            <span>Public Preview</span>
          </div>
        </div>

        <PublicBubbleMap mode="promo" showUpgradePrompt />
      </div>
    </div>
  );
}
