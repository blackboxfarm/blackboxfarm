import React, { useState, useEffect, lazy } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRoles } from "@/hooks/useUserRoles";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActiveTabOnly } from "@/components/ui/ActiveTabOnly";

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
const TelegramChannelMonitor = lazy(() => import("@/components/admin/TelegramChannelMonitor"));
const TwitterAccountManager = lazy(() => import("@/components/admin/TwitterAccountManager"));
const TokenCandidatesDashboard = lazy(() => import("@/components/admin/TokenCandidatesDashboard").then(m => ({ default: m.TokenCandidatesDashboard })));
const RugInvestigator = lazy(() => import("@/components/admin/RugInvestigator"));
const TokenAccountCleaner = lazy(() => import("@/components/admin/TokenAccountCleaner").then(m => ({ default: m.TokenAccountCleaner })));
const PumpfunBlacklist = lazy(() => import("@/components/admin/PumpfunBlacklist").then(m => ({ default: m.PumpfunBlacklist })));
const PumpfunWhitelist = lazy(() => import("@/components/admin/PumpfunWhitelist").then(m => ({ default: m.PumpfunWhitelist })));
const PumpfunKOLRegistry = lazy(() => import("@/components/admin/PumpfunKOLRegistry"));
const PumpfunKOLActivity = lazy(() => import("@/components/admin/PumpfunKOLActivity"));
const PumpfunKOLCabals = lazy(() => import("@/components/admin/PumpfunKOLCabals"));
const PumpfunKOLTwitter = lazy(() => import("@/components/admin/PumpfunKOLTwitter"));
const PumpfunTokenRetrace = lazy(() => import("@/components/admin/PumpfunTokenRetrace"));
const DevTeamsView = lazy(() => import("@/components/admin/DevTeamsView").then(m => ({ default: m.DevTeamsView })));
const SpiderRouteMap = lazy(() => import("@/components/admin/SpiderRouteMap").then(m => ({ default: m.SpiderRouteMap })));
const SolPriceAnalytics = lazy(() => import("@/components/admin/SolPriceAnalytics").then(m => ({ default: m.SolPriceAnalytics })));
const SniffDashboard = lazy(() => import("@/components/admin/SniffDashboard").then(m => ({ default: m.SniffDashboard })));
const HoldersVisitorsDashboard = lazy(() => import("@/components/admin/HoldersVisitorsDashboard").then(m => ({ default: m.HoldersVisitorsDashboard })));
const HeliusUsageDashboard = lazy(() => import("./HeliusUsage"));
const HoldersResourceDashboard = lazy(() => import("@/components/admin/HoldersResourceDashboard").then(m => ({ default: m.HoldersResourceDashboard })));
const HistoricalTokenDataDashboard = lazy(() => import("@/components/admin/HistoricalTokenDataDashboard").then(m => ({ default: m.HistoricalTokenDataDashboard })));
const TokenSearchAnalytics = lazy(() => import("@/components/admin/TokenSearchAnalytics").then(m => ({ default: m.TokenSearchAnalytics })));
const TokenHistoryViewer = lazy(() => import("@/components/admin/TokenHistoryViewer").then(m => ({ default: m.TokenHistoryViewer })));
const DailiesDashboard = lazy(() => import("@/components/admin/DailiesDashboard").then(m => ({ default: m.DailiesDashboard })));
const ShareCardDemo = lazy(() => import("@/components/social/ShareCardDemo").then(m => ({ default: m.ShareCardDemo })));

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState("fuckoff");
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
            <TabsTrigger value="fuckoff" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500/30 data-[state=active]:to-red-500/20">FUCKOFF</TabsTrigger>
            <TabsTrigger value="blackbox" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-zinc-700/30 data-[state=active]:to-zinc-800/20">📦 BlackBox</TabsTrigger>
            <TabsTrigger value="holders-intel" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500/30 data-[state=active]:to-violet-500/20">🔮 Holders Intel</TabsTrigger>
            <TabsTrigger value="whales-mints" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/30 data-[state=active]:to-teal-500/20">🐋 Whales & MINTS</TabsTrigger>
            <TabsTrigger value="flipit" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500/30 data-[state=active]:to-red-500/20">🔥 FlipIt</TabsTrigger>
            <TabsTrigger value="telegram" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500/30 data-[state=active]:to-blue-500/20">📡 Telegram Monitor</TabsTrigger>
            <TabsTrigger value="twitter-accounts" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500/30 data-[state=active]:to-cyan-500/20">🐦 Twitter Accounts</TabsTrigger>
            <TabsTrigger value="pumpfun-monitor" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500/30 data-[state=active]:to-emerald-500/20">🚀 Pump.fun Monitor</TabsTrigger>
          </TabsList>

          <TabsContent value="fuckoff">
            {/* Empty tab */}
          </TabsContent>

          <TabsContent value="blackbox">
            <ActiveTabOnly activeTab={activeTab} tabValue="blackbox">
              <Tabs defaultValue="master-wallets" className="space-y-4">
                <TabsList className="flex flex-wrap gap-1">
                  <TabsTrigger value="master-wallets">👑 Master Wallets</TabsTrigger>
                  <TabsTrigger value="wallets">💼 Wallet Management</TabsTrigger>
                  <TabsTrigger value="recovery">🔧 Wallet Recovery</TabsTrigger>
                  <TabsTrigger value="security">🛡️ Security Dashboard</TabsTrigger>
                  <TabsTrigger value="accounts">📁 Account Directory</TabsTrigger>
                  <TabsTrigger value="tokens">🪙 All Tokens</TabsTrigger>
                  <TabsTrigger value="arbitrage">📊 Arbitrage Bot</TabsTrigger>
                  <TabsTrigger value="playground">🎮 Playground</TabsTrigger>
                  <TabsTrigger value="airdrops">🎁 Airdrops</TabsTrigger>
                  <TabsTrigger value="fuct-airdrops">💜 $FUCT Airdrops</TabsTrigger>
                  <TabsTrigger value="surveys">📋 Surveys</TabsTrigger>
                  <TabsTrigger value="rent-reclaimer">🔥 Rent Reclaimer</TabsTrigger>
                </TabsList>
                <TabsContent value="master-wallets"><MasterWalletsDashboard /></TabsContent>
                <TabsContent value="wallets">
                  <div className="space-y-6">
                    <WalletBalanceMonitor />
                    <SuperAdminWallets />
                  </div>
                </TabsContent>
                <TabsContent value="recovery"><AdminWalletRecovery /></TabsContent>
                <TabsContent value="security"><SecurityDashboard /></TabsContent>
                <TabsContent value="accounts"><AccountViewer /></TabsContent>
                <TabsContent value="tokens"><AllWalletsTokenView /></TabsContent>
                <TabsContent value="arbitrage"><ArbitrageBotDashboard /></TabsContent>
                <TabsContent value="playground"><Playground /></TabsContent>
                <TabsContent value="airdrops"><AirdropManager /></TabsContent>
                <TabsContent value="fuct-airdrops"><FuctAirdropGift /></TabsContent>
                <TabsContent value="surveys"><SurveyManagement /></TabsContent>
                <TabsContent value="rent-reclaimer"><TokenAccountCleaner /></TabsContent>
              </Tabs>
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="holders-intel">
            <ActiveTabOnly activeTab={activeTab} tabValue="holders-intel">
              <Tabs defaultValue="token-holders" className="space-y-4">
                <TabsList className="flex flex-wrap gap-1">
                  <TabsTrigger value="token-holders">📊 Token Holders</TabsTrigger>
                  <TabsTrigger value="intel-xbot">🤖 Intel XBot</TabsTrigger>
                  <TabsTrigger value="banners">🎨 Banners</TabsTrigger>
                  <TabsTrigger value="advertisers">📢 Advertisers</TabsTrigger>
                  <TabsTrigger value="visitors">👁️ Visitors</TabsTrigger>
                  <TabsTrigger value="token-history">💎 Token History</TabsTrigger>
                  <TabsTrigger value="search-analytics">🔍 Search Analytics</TabsTrigger>
                  <TabsTrigger value="token-viewer">📈 Token Viewer</TabsTrigger>
                  <TabsTrigger value="dailies">📅 Dailies</TabsTrigger>
                </TabsList>
                <TabsContent value="token-holders"><BaglessHoldersReport /></TabsContent>
                <TabsContent value="intel-xbot"><ShareCardDemo /></TabsContent>
                <TabsContent value="banners"><BannerManagement /></TabsContent>
                <TabsContent value="advertisers"><AdvertiserManagement /></TabsContent>
                <TabsContent value="visitors"><HoldersVisitorsDashboard /></TabsContent>
                <TabsContent value="token-history"><HistoricalTokenDataDashboard /></TabsContent>
                <TabsContent value="search-analytics"><TokenSearchAnalytics /></TabsContent>
                <TabsContent value="token-viewer"><TokenHistoryViewer /></TabsContent>
                <TabsContent value="dailies"><DailiesDashboard /></TabsContent>
              </Tabs>
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="whales-mints">
            <ActiveTabOnly activeTab={activeTab} tabValue="whales-mints">
              <Tabs defaultValue="mega-whale" className="space-y-4">
                <TabsList className="flex flex-wrap gap-1">
                  <TabsTrigger value="mega-whale">👑 MEGA WHALE</TabsTrigger>
                  <TabsTrigger value="whale-frenzy">🔥 Whale Frenzy</TabsTrigger>
                  <TabsTrigger value="wallet-monitor">👁️ Wallet Monitor</TabsTrigger>
                  <TabsTrigger value="genealogy">🧬 Token Genealogy</TabsTrigger>
                  <TabsTrigger value="dex-compiles">📊 Dex Compiles</TabsTrigger>
                  <TabsTrigger value="html-scrapes">🌐 HTML Scrapes</TabsTrigger>
                  <TabsTrigger value="token-sets">🎯 Token Sets</TabsTrigger>
                  <TabsTrigger value="alerts">🚨 Dev Alerts</TabsTrigger>
                  <TabsTrigger value="testing">🧪 System Tests</TabsTrigger>
                  <TabsTrigger value="developers">🧠 Developer Intel</TabsTrigger>
                  <TabsTrigger value="analysis">📈 Analysis Jobs</TabsTrigger>
                  <TabsTrigger value="watchdog">🐕 Token Watchdog</TabsTrigger>
                  <TabsTrigger value="rug-investigator">🔍 Rug Investigator</TabsTrigger>
                  <TabsTrigger value="blacklist">🚫 Blacklist Mesh</TabsTrigger>
                  <TabsTrigger value="whitelist">✅ Whitelist Mesh</TabsTrigger>
                  <TabsTrigger value="kol-tracker">👑 KOL Tracker</TabsTrigger>
                  <TabsTrigger value="dev-teams">👥 Dev Teams</TabsTrigger>
                </TabsList>
                <TabsContent value="mega-whale"><MegaWhaleDashboard /></TabsContent>
                <TabsContent value="whale-frenzy"><WhaleFrenzyDashboard /></TabsContent>
                <TabsContent value="wallet-monitor"><WalletMonitor /></TabsContent>
                <TabsContent value="genealogy"><TokenGenealogyDashboard /></TabsContent>
                <TabsContent value="dex-compiles"><DexCompilesView /></TabsContent>
                <TabsContent value="html-scrapes"><HtmlScrapes /></TabsContent>
                <TabsContent value="token-sets"><TokenSets /></TabsContent>
                <TabsContent value="alerts"><DeveloperAlerts /></TabsContent>
                <TabsContent value="testing"><SystemTesting /></TabsContent>
                <TabsContent value="developers"><DeveloperProfiles /></TabsContent>
                <TabsContent value="analysis"><AnalysisJobs /></TabsContent>
                <TabsContent value="watchdog"><TokenWatchdog /></TabsContent>
                <TabsContent value="rug-investigator"><RugInvestigator /></TabsContent>
                <TabsContent value="blacklist"><PumpfunBlacklist /></TabsContent>
                <TabsContent value="whitelist"><PumpfunWhitelist /></TabsContent>
                <TabsContent value="kol-tracker">
                  <Tabs defaultValue="registry" className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="registry">👑 KOL Registry</TabsTrigger>
                      <TabsTrigger value="activity">📊 Activity</TabsTrigger>
                      <TabsTrigger value="twitter">🐦 Twitter</TabsTrigger>
                      <TabsTrigger value="cabals">🕸️ Cabals</TabsTrigger>
                    </TabsList>
                    <TabsContent value="registry"><PumpfunKOLRegistry /></TabsContent>
                    <TabsContent value="activity"><PumpfunKOLActivity /></TabsContent>
                    <TabsContent value="twitter"><PumpfunKOLTwitter /></TabsContent>
                    <TabsContent value="cabals"><PumpfunKOLCabals /></TabsContent>
                  </Tabs>
                </TabsContent>
                <TabsContent value="dev-teams"><DevTeamsView /></TabsContent>
              </Tabs>
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="flipit">
            <ActiveTabOnly activeTab={activeTab} tabValue="flipit">
              <FlipItDashboard />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="telegram">
            <ActiveTabOnly activeTab={activeTab} tabValue="telegram">
              <TelegramChannelMonitor />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="twitter-accounts">
            <ActiveTabOnly activeTab={activeTab} tabValue="twitter-accounts">
              <TwitterAccountManager />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="pumpfun-monitor">
            <ActiveTabOnly activeTab={activeTab} tabValue="pumpfun-monitor">
              <Tabs defaultValue="candidates" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="candidates">📊 Candidates</TabsTrigger>
                  <TabsTrigger value="retrace">🔍 Retrace</TabsTrigger>
                </TabsList>
                <TabsContent value="candidates"><TokenCandidatesDashboard /></TabsContent>
                <TabsContent value="retrace"><PumpfunTokenRetrace /></TabsContent>
              </Tabs>
            </ActiveTabOnly>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
