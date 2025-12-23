import React, { useState, useEffect, Suspense, lazy } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRoles } from "@/hooks/useUserRoles";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LazyLoader } from "@/components/ui/lazy-loader";

// Lazy load ALL admin components - they won't load until their tab is clicked
const MasterWalletsDashboard = lazy(() => import("@/components/admin/MasterWalletsDashboard").then(m => ({ default: m.MasterWalletsDashboard })));
const SuperAdminWallets = lazy(() => import("@/components/SuperAdminWallets").then(m => ({ default: m.SuperAdminWallets })));
const WalletBalanceMonitor = lazy(() => import("@/components/WalletBalanceMonitor").then(m => ({ default: m.WalletBalanceMonitor })));
const AdminWalletRecovery = lazy(() => import("@/components/AdminWalletRecovery").then(m => ({ default: m.AdminWalletRecovery })));
const WalletMonitor = lazy(() => import("@/components/WalletMonitor").then(m => ({ default: m.WalletMonitor })));
const SecurityDashboard = lazy(() => import("@/components/security/SecurityDashboard").then(m => ({ default: m.SecurityDashboard })));
const AccountViewer = lazy(() => import("@/components/AccountViewer").then(m => ({ default: m.AccountViewer })));
const BaglessHoldersReport = lazy(() => import("@/components/BaglessHoldersReport").then(m => ({ default: m.BaglessHoldersReport })));
const LiquidityLockChecker = lazy(() => import("@/components/LiquidityLockChecker").then(m => ({ default: m.LiquidityLockChecker })));
const AllWalletsTokenView = lazy(() => import("@/components/AllWalletsTokenView").then(m => ({ default: m.AllWalletsTokenView })));
const DeveloperProfiles = lazy(() => import("@/components/admin/DeveloperProfiles").then(m => ({ default: m.DeveloperProfiles })));
const AnalysisJobs = lazy(() => import("@/components/admin/AnalysisJobs").then(m => ({ default: m.AnalysisJobs })));
const TokenWatchdog = lazy(() => import("@/components/admin/TokenWatchdog").then(m => ({ default: m.TokenWatchdog })));
const SystemTesting = lazy(() => import("@/components/admin/SystemTesting").then(m => ({ default: m.SystemTesting })));
const DeveloperAlerts = lazy(() => import("@/components/admin/DeveloperAlerts").then(m => ({ default: m.DeveloperAlerts })));
const BannerManagement = lazy(() => import("@/components/admin/BannerManagement").then(m => ({ default: m.BannerManagement })));
const SurveyManagement = lazy(() => import("@/components/admin/SurveyManagement").then(m => ({ default: m.SurveyManagement })));
const TokenGenealogyDashboard = lazy(() => import("@/components/admin/TokenGenealogyDashboard").then(m => ({ default: m.TokenGenealogyDashboard })));
const DexCompilesView = lazy(() => import("@/components/admin/DexCompilesView").then(m => ({ default: m.DexCompilesView })));
const HtmlScrapes = lazy(() => import("@/components/admin/HtmlScrapes").then(m => ({ default: m.HtmlScrapes })));
const TokenSets = lazy(() => import("@/components/admin/TokenSets").then(m => ({ default: m.TokenSets })));
const ArbitrageBotDashboard = lazy(() => import("@/components/admin/ArbitrageBotDashboard").then(m => ({ default: m.ArbitrageBotDashboard })));
const Playground = lazy(() => import("@/components/admin/Playground").then(m => ({ default: m.Playground })));
const AirdropManager = lazy(() => import("@/components/admin/AirdropManager").then(m => ({ default: m.AirdropManager })));
const FuctAirdropGift = lazy(() => import("@/components/admin/FuctAirdropGift").then(m => ({ default: m.FuctAirdropGift })));
const WhaleFrenzyDashboard = lazy(() => import("@/components/admin/WhaleFrenzyDashboard").then(m => ({ default: m.WhaleFrenzyDashboard })));
const MegaWhaleDashboard = lazy(() => import("@/components/admin/MegaWhaleDashboard").then(m => ({ default: m.MegaWhaleDashboard })));
const ApiProviderManager = lazy(() => import("@/components/admin/ApiProviderManager").then(m => ({ default: m.ApiProviderManager })));
const AdvertiserManagement = lazy(() => import("@/components/admin/AdvertiserManagement"));
const FlipItDashboard = lazy(() => import("@/components/admin/FlipItDashboard").then(m => ({ default: m.FlipItDashboard })));

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState("wallets");
  const { isSuperAdmin, isLoading } = useUserRoles();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Verifying permissions...</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="text-xl">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              You don't have permission to access the Super Admin panel. 
              Only verified super administrators can access this area.
            </p>
            <Button onClick={() => window.history.back()} variant="outline">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Super Admin</h1>
          <p className="text-muted-foreground">
            Manage platform wallets and administrative functions
          </p>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex flex-wrap w-full h-auto gap-1 p-2">
            <TabsTrigger value="master-wallets" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/30 data-[state=active]:to-yellow-500/20">👑 Master Wallets</TabsTrigger>
            <TabsTrigger value="wallets" className="flex-shrink-0">Wallet Management</TabsTrigger>
            <TabsTrigger value="recovery" className="flex-shrink-0">Wallet Recovery</TabsTrigger>
            <TabsTrigger value="monitor" className="flex-shrink-0">Wallet Monitor</TabsTrigger>
            <TabsTrigger value="security" className="flex-shrink-0">Security Dashboard</TabsTrigger>
            <TabsTrigger value="accounts" className="flex-shrink-0">Account Directory</TabsTrigger>
            <TabsTrigger value="holders" className="flex-shrink-0">Token Holders</TabsTrigger>
            <TabsTrigger value="liquidity" className="flex-shrink-0">Liquidity Checker</TabsTrigger>
            <TabsTrigger value="tokens" className="flex-shrink-0">All Tokens</TabsTrigger>
            <TabsTrigger value="developers" className="flex-shrink-0 data-[state=active]:bg-primary/20 data-[state=inactive]:bg-primary/5">Developer Intel</TabsTrigger>
            <TabsTrigger value="analysis" className="flex-shrink-0 data-[state=active]:bg-primary/20 data-[state=inactive]:bg-primary/5">Analysis Jobs</TabsTrigger>
            <TabsTrigger value="watchdog" className="flex-shrink-0 data-[state=active]:bg-primary/20 data-[state=inactive]:bg-primary/5">Token Watchdog</TabsTrigger>
            <TabsTrigger value="alerts" className="flex-shrink-0 data-[state=active]:bg-primary/20 data-[state=inactive]:bg-primary/5">Dev Alerts</TabsTrigger>
            <TabsTrigger value="testing" className="flex-shrink-0 data-[state=active]:bg-primary/20 data-[state=inactive]:bg-primary/5">System Tests</TabsTrigger>
            <TabsTrigger value="genealogy" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/30 data-[state=active]:to-primary/20">Token Genealogy</TabsTrigger>
            <TabsTrigger value="dex-compiles" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500/30 data-[state=active]:to-emerald-500/20">Dex Compiles</TabsTrigger>
            <TabsTrigger value="html-scrapes" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500/30 data-[state=active]:to-blue-500/20">HTML Scrapes</TabsTrigger>
            <TabsTrigger value="token-sets" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500/30 data-[state=active]:to-purple-500/20">Token Sets</TabsTrigger>
            <TabsTrigger value="arbitrage" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500/30 data-[state=active]:to-orange-500/20">Arbitrage Bot</TabsTrigger>
            <TabsTrigger value="playground" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/30 data-[state=active]:to-cyan-500/20">Playground</TabsTrigger>
            <TabsTrigger value="airdrops" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500/30 data-[state=active]:to-pink-500/20">Airdrops</TabsTrigger>
            <TabsTrigger value="fuct-airdrops" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-500/30 data-[state=active]:to-purple-500/20">🎁 $FUCT Airdrops</TabsTrigger>
            <TabsTrigger value="banners" className="flex-shrink-0">Banners</TabsTrigger>
            <TabsTrigger value="advertisers" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500/30 data-[state=active]:to-emerald-500/20">📢 Advertisers</TabsTrigger>
            <TabsTrigger value="surveys" className="flex-shrink-0">Surveys</TabsTrigger>
            <TabsTrigger value="whale-frenzy" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500/30 data-[state=active]:to-red-500/20">🔥 Whale Frenzy</TabsTrigger>
            <TabsTrigger value="mega-whale" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-500/30 data-[state=active]:to-amber-500/20">👑 MEGA WHALE</TabsTrigger>
            <TabsTrigger value="api-providers" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500/30 data-[state=active]:to-orange-500/20">⚡ API Providers</TabsTrigger>
            <TabsTrigger value="flipit" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500/30 data-[state=active]:to-red-500/20">🔥 FlipIt</TabsTrigger>
          </TabsList>
          
          <TabsContent value="master-wallets">
            <Suspense fallback={<LazyLoader />}>
              <MasterWalletsDashboard />
            </Suspense>
          </TabsContent>

          <TabsContent value="wallets">
            <Suspense fallback={<LazyLoader />}>
              <div className="space-y-6">
                <WalletBalanceMonitor />
                <SuperAdminWallets />
              </div>
            </Suspense>
          </TabsContent>
          
          <TabsContent value="recovery">
            <Suspense fallback={<LazyLoader />}>
              <AdminWalletRecovery />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="monitor">
            <Suspense fallback={<LazyLoader />}>
              <WalletMonitor />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="security">
            <Suspense fallback={<LazyLoader />}>
              <SecurityDashboard />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="accounts">
            <Suspense fallback={<LazyLoader />}>
              <AccountViewer />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="holders">
            <Suspense fallback={<LazyLoader />}>
              <BaglessHoldersReport />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="liquidity">
            <Suspense fallback={<LazyLoader />}>
              <LiquidityLockChecker />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="tokens">
            <Suspense fallback={<LazyLoader />}>
              <AllWalletsTokenView />
            </Suspense>
          </TabsContent>

          <TabsContent value="developers">
            <Suspense fallback={<LazyLoader />}>
              <DeveloperProfiles />
            </Suspense>
          </TabsContent>

          <TabsContent value="analysis">
            <Suspense fallback={<LazyLoader />}>
              <AnalysisJobs />
            </Suspense>
          </TabsContent>

          <TabsContent value="watchdog">
            <Suspense fallback={<LazyLoader />}>
              <TokenWatchdog />
            </Suspense>
          </TabsContent>

          <TabsContent value="alerts">
            <Suspense fallback={<LazyLoader />}>
              <DeveloperAlerts />
            </Suspense>
          </TabsContent>

          <TabsContent value="testing">
            <Suspense fallback={<LazyLoader />}>
              <SystemTesting />
            </Suspense>
          </TabsContent>

          <TabsContent value="genealogy">
            <Suspense fallback={<LazyLoader />}>
              <TokenGenealogyDashboard />
            </Suspense>
          </TabsContent>

          <TabsContent value="dex-compiles">
            <Suspense fallback={<LazyLoader />}>
              <DexCompilesView />
            </Suspense>
          </TabsContent>

          <TabsContent value="html-scrapes">
            <Suspense fallback={<LazyLoader />}>
              <HtmlScrapes />
            </Suspense>
          </TabsContent>

          <TabsContent value="token-sets">
            <Suspense fallback={<LazyLoader />}>
              <TokenSets />
            </Suspense>
          </TabsContent>

          <TabsContent value="arbitrage">
            <Suspense fallback={<LazyLoader />}>
              <ArbitrageBotDashboard />
            </Suspense>
          </TabsContent>

          <TabsContent value="playground">
            <Suspense fallback={<LazyLoader />}>
              <Playground />
            </Suspense>
          </TabsContent>

          <TabsContent value="airdrops">
            <Suspense fallback={<LazyLoader />}>
              <AirdropManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="fuct-airdrops">
            <Suspense fallback={<LazyLoader />}>
              <FuctAirdropGift />
            </Suspense>
          </TabsContent>

          <TabsContent value="banners">
            <Suspense fallback={<LazyLoader />}>
              <BannerManagement />
            </Suspense>
          </TabsContent>

          <TabsContent value="advertisers">
            <Suspense fallback={<LazyLoader />}>
              <AdvertiserManagement />
            </Suspense>
          </TabsContent>

          <TabsContent value="surveys">
            <Suspense fallback={<LazyLoader />}>
              <SurveyManagement />
            </Suspense>
          </TabsContent>

          <TabsContent value="whale-frenzy">
            <Suspense fallback={<LazyLoader />}>
              <WhaleFrenzyDashboard />
            </Suspense>
          </TabsContent>

          <TabsContent value="mega-whale">
            <Suspense fallback={<LazyLoader />}>
              <MegaWhaleDashboard />
            </Suspense>
          </TabsContent>

          <TabsContent value="api-providers">
            <Suspense fallback={<LazyLoader />}>
              <ApiProviderManager />
            </Suspense>
          </TabsContent>

          <TabsContent value="flipit">
            <Suspense fallback={<LazyLoader />}>
              <FlipItDashboard />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
