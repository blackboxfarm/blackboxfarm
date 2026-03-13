import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Network, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserTier } from "@/hooks/useUserTier";
import PublicBubbleMap from "@/components/bubble-map/PublicBubbleMap";
import { BubbleMapTierGrid } from "@/components/bubble-map/BubbleMapTierGrid";

export default function BubbleMapPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isPro } = useUserTier();

  if (loading) return null;

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-6">
          <Network className="h-12 w-12 text-primary mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Bubble Map</h1>
          <p className="text-muted-foreground">
            Sign in to access the Bubble Map. Subscribe for $9.99/mo for unlimited access.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={() => navigate('/auth')} className="gap-2">
              Sign In
            </Button>
            <Button variant="outline" onClick={() => navigate('/bubblepromo')} className="gap-2">
              Try Free Preview
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Crown className="h-4 w-4 text-primary" />
            <span>{isPro ? 'Pro' : 'Authenticated'}</span>
          </div>
        </div>

        <PublicBubbleMap mode="authenticated" showUpgradePrompt />

        {!isPro && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">🔓 Unlock Full Bubble Map Features</CardTitle>
            </CardHeader>
            <CardContent>
              <BubbleMapTierGrid compact />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
