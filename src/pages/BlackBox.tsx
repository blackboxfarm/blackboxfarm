import React, { useState, lazy } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthButton } from "@/components/auth/AuthButton";
import { RequireAuth } from "@/components/RequireAuth";
import { FarmBanner } from "@/components/FarmBanner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Shield, Radar } from "lucide-react";
import { SolPriceDisplay } from "@/components/SolPriceDisplay";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ActiveTabOnly } from "@/components/ui/ActiveTabOnly";
import { usePageTracking } from "@/hooks/usePageTracking";

// Lazy load all tab components
const OverviewTab = lazy(() => import("@/components/blackbox/OverviewTab").then(m => ({ default: m.OverviewTab })));
const CampaignDashboard = lazy(() => import("@/components/blackbox/CampaignDashboard").then(m => ({ default: m.CampaignDashboard })));
const WalletGenerator = lazy(() => import("@/components/WalletGenerator").then(m => ({ default: m.WalletGenerator })));
const WalletMonitor = lazy(() => import("@/components/WalletMonitor").then(m => ({ default: m.WalletMonitor })));
const BreadCrumbsInterface = lazy(() => import("@/components/breadcrumbs/BreadCrumbsInterface").then(m => ({ default: m.BreadCrumbsInterface })));
const CopyTradingConfig = lazy(() => import("@/components/copy-trading/CopyTradingConfig").then(m => ({ default: m.CopyTradingConfig })));
const CopyTradingDashboard = lazy(() => import("@/components/copy-trading/CopyTradingDashboard").then(m => ({ default: m.CopyTradingDashboard })));
const CommunityWalletDashboard = lazy(() => import("@/components/blackbox/CommunityWalletDashboard"));
const CommunityWalletPublic = lazy(() => import("@/components/blackbox/CommunityWalletPublic").then(m => ({ default: m.CommunityWalletPublic })));
const VolumeSimulator = lazy(() => import("@/components/VolumeSimulator"));
const FeeCalculator = lazy(() => import("@/components/blackbox/FeeCalculator").then(m => ({ default: m.FeeCalculator })));
const AnalyticsDashboard = lazy(() => import("@/components/AnalyticsDashboard").then(m => ({ default: m.AnalyticsDashboard })));
const BaglessHoldersReport = lazy(() => import("@/components/BaglessHoldersReport").then(m => ({ default: m.BaglessHoldersReport })));
const ReferralDashboard = lazy(() => import("@/components/blackbox/ReferralDashboard").then(m => ({ default: m.ReferralDashboard })));
const EnhancedWalletView = lazy(() => import("@/components/blackbox/EnhancedWalletView").then(m => ({ default: m.EnhancedWalletView })));
const SecurityDashboard = lazy(() => import("@/components/security/SecurityDashboard").then(m => ({ default: m.SecurityDashboard })));
const TokenCandidatesDashboard = lazy(() => import("@/components/admin/TokenCandidatesDashboard").then(m => ({ default: m.TokenCandidatesDashboard })));

export default function BlackBox() {
  usePageTracking('home'); // Track main page visits
  
  const [activeTab, setActiveTab] = useState("overview");
  const [copyTradingSubTab, setCopyTradingSubTab] = useState("config");
  const { user } = useAuth();
  const { isSuperAdmin, isAdmin, isLoading: rolesLoading } = useUserRoles();
  const navigate = useNavigate();
  
  // Only super admins should see admin features
  const isAdminView = isSuperAdmin;

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
                BlackBox Farm
              </h1>
              <SolPriceDisplay size="lg" className="ml-4" />
            </div>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto md:mx-0">
              Putting the needle in the Haystack - Bumps for the whole Fam!
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

        {/* Main Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {isAdminView && <TabsTrigger value="dashboard">Dashboard</TabsTrigger>}
            {isAdminView && <TabsTrigger value="watcher">Watcher</TabsTrigger>}
            {isAdminView && <TabsTrigger value="breadcrumbs">BreadCrumbs</TabsTrigger>}
            {isAdminView && <TabsTrigger value="copy-trading">Copy Trading</TabsTrigger>}
            <TabsTrigger value="community">Community</TabsTrigger>
            <TabsTrigger value="simulator">Simulator</TabsTrigger>
            <TabsTrigger value="fees">Calculator</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="holders">Holders</TabsTrigger>
            {isAdminView && <TabsTrigger value="referrals">Referrals</TabsTrigger>}
            {isAdminView && <TabsTrigger value="wallets">Wallets</TabsTrigger>}
            {isAdminView && <TabsTrigger value="discovery" className="flex items-center gap-1">
              <Radar className="h-3 w-3" />
              Discovery
            </TabsTrigger>}
            {isAdminView && <TabsTrigger value="security">Security</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="overview">
              <OverviewTab />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="dashboard" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="dashboard">
              <RequireAuth>
                <CampaignDashboard />
                <WalletGenerator />
              </RequireAuth>
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="watcher" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="watcher">
              <WalletMonitor />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="breadcrumbs" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="breadcrumbs">
              <BreadCrumbsInterface />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="copy-trading" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="copy-trading">
              <Tabs value={copyTradingSubTab} onValueChange={setCopyTradingSubTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="config">Configuration</TabsTrigger>
                  <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                </TabsList>
                
                <TabsContent value="config" className="mt-6">
                  <ActiveTabOnly activeTab={copyTradingSubTab} tabValue="config">
                    <CopyTradingConfig />
                  </ActiveTabOnly>
                </TabsContent>
                
                <TabsContent value="dashboard" className="mt-6">
                  <ActiveTabOnly activeTab={copyTradingSubTab} tabValue="dashboard">
                    <CopyTradingDashboard />
                  </ActiveTabOnly>
                </TabsContent>
              </Tabs>
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="community" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="community">
              <RequireAuth fallback={<CommunityWalletPublic />}>
                <CommunityWalletDashboard />
              </RequireAuth>
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="simulator" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="simulator">
              <Card>
                <CardHeader>
                  <CardTitle>Volume Bot Simulator</CardTitle>
                </CardHeader>
                <CardContent>
                  <VolumeSimulator />
                </CardContent>
              </Card>
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="fees" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="fees">
              <FeeCalculator />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="analytics">
              <AnalyticsDashboard />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="holders" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="holders">
              <div className="w-full md:w-1/2 md:mx-auto px-[5px] md:px-6">
                <BaglessHoldersReport />
              </div>
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="referrals" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="referrals">
              <ReferralDashboard />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="wallets" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="wallets">
              <EnhancedWalletView />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="discovery" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="discovery">
              <TokenCandidatesDashboard />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <ActiveTabOnly activeTab={activeTab} tabValue="security">
              <SecurityDashboard />
            </ActiveTabOnly>
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
