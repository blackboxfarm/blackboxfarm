import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Bot, Network, Crown, Settings, ExternalLink, Hash } from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { useAuth } from "@/hooks/useAuth";
import { useUserTier } from "@/hooks/useUserTier";
import { usePageTracking } from "@/hooks/usePageTracking";
import { TelegramLinkCode } from "@/components/settings/TelegramLinkCode";
import { ChannelInstallations } from "@/components/dashboard/ChannelInstallations";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  usePageTracking('dashboard');

  // Redirect unauthenticated users
  if (!user) {
    navigate('/auth');
    return null;
  }

  return (
    <SiteLayout>
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        {/* Welcome */}
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            Welcome back
          </h2>
          <p className="text-muted-foreground">
            {user.email}
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Card className="hover:border-primary/30 transition-colors cursor-pointer group" onClick={() => navigate('/holders')}>
            <CardContent className="p-6 space-y-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-foreground text-lg">AI Holder Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Analyze any Solana token's holder distribution, risk scores, and AI-powered insights.
              </p>
              <Button variant="link" className="p-0 h-auto text-primary gap-1">
                Launch Analysis <ExternalLink className="w-3 h-3" />
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/30 transition-colors cursor-pointer group" onClick={() => navigate('/bubblemap')}>
            <CardContent className="p-6 space-y-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
                <Network className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-foreground text-lg">Bubble Map</h3>
              <p className="text-sm text-muted-foreground">
                Visualize wallet networks, developer genealogy, and social connections in an interactive graph.
              </p>
              <Button variant="link" className="p-0 h-auto text-primary gap-1">
                Open Bubble Map <ExternalLink className="w-3 h-3" />
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/30 transition-colors cursor-pointer group" onClick={() => navigate('/subscriptions')}>
            <CardContent className="p-6 space-y-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
                <Crown className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-foreground text-lg">Subscription</h3>
              <p className="text-sm text-muted-foreground">
                Manage your plan, upgrade for deeper analysis, and unlock premium features.
              </p>
              <Button variant="link" className="p-0 h-auto text-primary gap-1">
                Manage Plan <ExternalLink className="w-3 h-3" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Telegram Bot Setup */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                Telegram Bot Setup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Link your Telegram account to access premium bot features and receive personalized alerts.
              </p>
              <TelegramLinkCode />
              <a href="https://t.me/holdersintel_bot" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="gap-2 w-full">
                  <Bot className="w-4 h-4" />
                  Open @holdersintel_bot
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                Quick Links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/pricing')}>
                <Crown className="w-4 h-4" /> View All Plans & Pricing
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/features')}>
                <BarChart3 className="w-4 h-4" /> Platform Features
              </Button>
              <a href="https://x.com/holdersintel" target="_blank" rel="noopener noreferrer" className="block">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <ExternalLink className="w-4 h-4" /> Follow @holdersintel on X
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </SiteLayout>
  );
}
