import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BlackBoxAuth } from "@/components/blackbox/BlackBoxAuth";
import { CampaignDashboard } from "@/components/blackbox/CampaignDashboard";
import { FeeCalculator } from "@/components/blackbox/FeeCalculator";
import { AuthButton } from "@/components/auth/AuthButton";
import { RequireAuth } from "@/components/RequireAuth";
import VolumeSimulator from "@/components/VolumeSimulator";
import { FarmBanner } from "@/components/FarmBanner";
import { SubscriptionManager } from "@/components/blackbox/SubscriptionManager";
import { WalletGenerator } from "@/components/WalletGenerator";
import { SecurityDashboard } from "@/components/security/SecurityDashboard";
import { NotificationCenter } from "@/components/NotificationCenter";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { ReferralDashboard } from "@/components/blackbox/ReferralDashboard";
import CommunityWalletDashboard from "@/components/blackbox/CommunityWalletDashboard";
import { useAuth } from "@/hooks/useAuth";

export default function BlackBox() {
  const [activeTab, setActiveTab] = useState("pricing");
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Farm Banner Header */}
      <FarmBanner />
      <div className="container mx-auto py-6 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start space-y-4 md:space-y-0">
          <div className="text-center md:text-left flex-1 space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              BlackBox Farm
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto md:mx-0">
              Putting the needle in the Haystack - Bumps for the whole Fam!
            </p>
            <div className="flex justify-center md:hidden space-x-3">
              <AuthButton />
            </div>
          </div>
          <div className="hidden md:flex flex-shrink-0 items-center gap-3">
            <NotificationCenter />
            <AuthButton />
          </div>
        </div>

        {/* Main Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`grid w-full ${user ? 'grid-cols-8' : 'grid-cols-4'}`}>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            {user && <TabsTrigger value="dashboard">Dashboard</TabsTrigger>}
            {user && <TabsTrigger value="community">Community</TabsTrigger>}
            <TabsTrigger value="simulator">Simulator</TabsTrigger>
            <TabsTrigger value="fees">Calculator</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            {user && <TabsTrigger value="referrals">Referrals</TabsTrigger>}
            {user && <TabsTrigger value="security">Security</TabsTrigger>}
          </TabsList>

          <TabsContent value="pricing" className="space-y-6">
            <SubscriptionManager />
          </TabsContent>

          <TabsContent value="dashboard" className="space-y-6">
            <RequireAuth>
              <CampaignDashboard />
              <WalletGenerator />
            </RequireAuth>
          </TabsContent>

          <TabsContent value="community" className="space-y-6">
            <RequireAuth>
              <CommunityWalletDashboard />
            </RequireAuth>
          </TabsContent>

          <TabsContent value="simulator" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Volume Bot Simulator</CardTitle>
              </CardHeader>
              <CardContent>
                <VolumeSimulator />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fees" className="space-y-6">
            <FeeCalculator />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <AnalyticsDashboard />
          </TabsContent>

          <TabsContent value="referrals" className="space-y-6">
            <ReferralDashboard />
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <SecurityDashboard />
          </TabsContent>
        </Tabs>

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