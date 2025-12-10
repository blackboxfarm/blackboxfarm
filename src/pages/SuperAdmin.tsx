import React, { useState, useEffect } from "react";
import { SuperAdminWallets } from "@/components/SuperAdminWallets";
import { AdminWalletRecovery } from "@/components/AdminWalletRecovery";
import { MasterWalletsDashboard } from "@/components/admin/MasterWalletsDashboard";
import { SecurityDashboard } from "@/components/security/SecurityDashboard";
import { AccountViewer } from "@/components/AccountViewer";
import { BaglessHoldersReport } from "@/components/BaglessHoldersReport";
import { LiquidityLockChecker } from "@/components/LiquidityLockChecker";
import { AllWalletsTokenView } from "@/components/AllWalletsTokenView";
import { DeveloperProfiles } from "@/components/admin/DeveloperProfiles";
import { AnalysisJobs } from "@/components/admin/AnalysisJobs";
import { TokenWatchdog } from "@/components/admin/TokenWatchdog";
import { SystemTesting } from "@/components/admin/SystemTesting";
import { DeveloperAlerts } from "@/components/admin/DeveloperAlerts";
import { BannerManagement } from "@/components/admin/BannerManagement";
import { SurveyManagement } from "@/components/admin/SurveyManagement";
import { TokenGenealogyDashboard } from "@/components/admin/TokenGenealogyDashboard";
import { DexCompilesView } from "@/components/admin/DexCompilesView";
import { HtmlScrapes } from "@/components/admin/HtmlScrapes";
import { TokenSets } from "@/components/admin/TokenSets";
import { ArbitrageBotDashboard } from "@/components/admin/ArbitrageBotDashboard";
import { Playground } from "@/components/admin/Playground";
import { AirdropManager } from "@/components/admin/AirdropManager";
import { FuctAirdropGift } from "@/components/admin/FuctAirdropGift";
import { WhaleFrenzyDashboard } from "@/components/admin/WhaleFrenzyDashboard";
import { MegaWhaleDashboard } from "@/components/admin/MegaWhaleDashboard";
import { ApiProviderManager } from "@/components/admin/ApiProviderManager";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TransactionHistoryWindow from "@/components/blackbox/TransactionHistoryWindow";
import { WalletBalanceMonitor } from "@/components/WalletBalanceMonitor";
import { WalletMonitor } from "@/components/WalletMonitor";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Shield, AlertTriangle, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState("wallets");
  const { isSuperAdmin, isLoading } = useUserRoles();

  useEffect(() => {
    // Check for tab parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, []);

  // Show loading state while checking roles
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

  // Show access denied if not super admin
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
            <TabsTrigger value="surveys" className="flex-shrink-0">Surveys</TabsTrigger>
            <TabsTrigger value="whale-frenzy" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500/30 data-[state=active]:to-red-500/20">🔥 Whale Frenzy</TabsTrigger>
            <TabsTrigger value="mega-whale" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-500/30 data-[state=active]:to-amber-500/20">👑 MEGA WHALE</TabsTrigger>
            <TabsTrigger value="api-providers" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500/30 data-[state=active]:to-orange-500/20">⚡ API Providers</TabsTrigger>
          </TabsList>
          
          <TabsContent value="master-wallets">
            <MasterWalletsDashboard />
          </TabsContent>

          <TabsContent value="wallets">
            <div className="space-y-6">
              <WalletBalanceMonitor />
              <SuperAdminWallets />
            </div>
          </TabsContent>
          
          <TabsContent value="recovery">
            <AdminWalletRecovery />
          </TabsContent>
          
          <TabsContent value="monitor">
            <WalletMonitor />
          </TabsContent>
          
          <TabsContent value="security">
            <SecurityDashboard />
          </TabsContent>
          
          <TabsContent value="accounts">
            <AccountViewer />
          </TabsContent>
          
          <TabsContent value="holders">
            <BaglessHoldersReport />
          </TabsContent>
          
          <TabsContent value="liquidity">
            <LiquidityLockChecker />
          </TabsContent>
          
          <TabsContent value="tokens">
            <AllWalletsTokenView />
          </TabsContent>

          <TabsContent value="developers">
            <DeveloperProfiles />
          </TabsContent>

          <TabsContent value="analysis">
            <AnalysisJobs />
          </TabsContent>

          <TabsContent value="watchdog">
            <TokenWatchdog />
          </TabsContent>

          <TabsContent value="alerts">
            <DeveloperAlerts />
          </TabsContent>

          <TabsContent value="testing">
            <SystemTesting />
          </TabsContent>

          <TabsContent value="genealogy">
            <TokenGenealogyDashboard />
          </TabsContent>

          <TabsContent value="dex-compiles">
            <DexCompilesView />
          </TabsContent>

          <TabsContent value="html-scrapes">
            <HtmlScrapes />
          </TabsContent>

          <TabsContent value="token-sets">
            <TokenSets />
          </TabsContent>

          <TabsContent value="arbitrage">
            <ArbitrageBotDashboard />
          </TabsContent>

          <TabsContent value="playground">
            <Playground />
          </TabsContent>

          <TabsContent value="airdrops">
            <AirdropManager />
          </TabsContent>

          <TabsContent value="fuct-airdrops">
            <FuctAirdropGift />
          </TabsContent>

          <TabsContent value="banners">
            <BannerManagement />
          </TabsContent>

          <TabsContent value="surveys">
            <SurveyManagement />
          </TabsContent>

          <TabsContent value="whale-frenzy">
            <WhaleFrenzyDashboard />
          </TabsContent>

          <TabsContent value="mega-whale">
            <MegaWhaleDashboard />
          </TabsContent>

          <TabsContent value="api-providers">
            <ApiProviderManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}