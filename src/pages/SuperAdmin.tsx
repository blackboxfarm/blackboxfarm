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
            <TabsTrigger value="master-wallets" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/30 data-[state=active]:to-yellow-500/20">👑 Master Wallets</TabsTrigger>
            <TabsTrigger value="wallets" className="flex-shrink-0">Wallet Management</TabsTrigger>
            <TabsTrigger value="recovery" className="flex-shrink-0">Wallet Recovery</TabsTrigger>
            
            <TabsTrigger value="security" className="flex-shrink-0">Security Dashboard</TabsTrigger>
            <TabsTrigger value="accounts" className="flex-shrink-0">Account Directory</TabsTrigger>
            <TabsTrigger value="holders" className="flex-shrink-0">Token Holders</TabsTrigger>
            <TabsTrigger value="utilities" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-500/30 data-[state=active]:to-zinc-500/20">🔧 Utilities</TabsTrigger>
            <TabsTrigger value="whales-mints" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/30 data-[state=active]:to-teal-500/20">🐋 Whales & MINTS</TabsTrigger>
            <TabsTrigger value="tokens" className="flex-shrink-0">All Tokens</TabsTrigger>
            <TabsTrigger value="developers" className="flex-shrink-0 data-[state=active]:bg-primary/20 data-[state=inactive]:bg-primary/5">Developer Intel</TabsTrigger>
            <TabsTrigger value="analysis" className="flex-shrink-0 data-[state=active]:bg-primary/20 data-[state=inactive]:bg-primary/5">Analysis Jobs</TabsTrigger>
            <TabsTrigger value="watchdog" className="flex-shrink-0 data-[state=active]:bg-primary/20 data-[state=inactive]:bg-primary/5">Token Watchdog</TabsTrigger>
            <TabsTrigger value="arbitrage" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500/30 data-[state=active]:to-orange-500/20">Arbitrage Bot</TabsTrigger>
            <TabsTrigger value="playground" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/30 data-[state=active]:to-cyan-500/20">Playground</TabsTrigger>
            <TabsTrigger value="airdrops" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500/30 data-[state=active]:to-pink-500/20">Airdrops</TabsTrigger>
            <TabsTrigger value="fuct-airdrops" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-500/30 data-[state=active]:to-purple-500/20">🎁 $FUCT Airdrops</TabsTrigger>
            <TabsTrigger value="banners" className="flex-shrink-0">Banners</TabsTrigger>
            <TabsTrigger value="advertisers" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500/30 data-[state=active]:to-emerald-500/20">📢 Advertisers</TabsTrigger>
            <TabsTrigger value="surveys" className="flex-shrink-0">Surveys</TabsTrigger>
            
            <TabsTrigger value="flipit" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500/30 data-[state=active]:to-red-500/20">🔥 FlipIt</TabsTrigger>
            <TabsTrigger value="telegram" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500/30 data-[state=active]:to-blue-500/20">📡 Telegram Monitor</TabsTrigger>
            <TabsTrigger value="twitter-accounts" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500/30 data-[state=active]:to-cyan-500/20">🐦 Twitter Accounts</TabsTrigger>
            <TabsTrigger value="pumpfun-monitor" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500/30 data-[state=active]:to-emerald-500/20">🚀 Pump.fun Monitor</TabsTrigger>
            <TabsTrigger value="rug-investigator" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500/30 data-[state=active]:to-rose-500/20">🔍 Rug Investigator</TabsTrigger>
            <TabsTrigger value="rent-reclaimer" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500/30 data-[state=active]:to-amber-500/20">🔥 Rent Reclaimer</TabsTrigger>
            <TabsTrigger value="pumpfun-blacklist" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-600/30 data-[state=active]:to-red-500/20">🚫 Blacklist Mesh</TabsTrigger>
            <TabsTrigger value="pumpfun-whitelist" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-600/30 data-[state=active]:to-emerald-500/20">✅ Whitelist Mesh</TabsTrigger>
            <TabsTrigger value="kol-tracker" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-500/30 data-[state=active]:to-amber-500/20">👑 KOL Tracker</TabsTrigger>
            <TabsTrigger value="dev-teams" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600/30 data-[state=active]:to-violet-500/20">👥 Dev Teams</TabsTrigger>
            <TabsTrigger value="holders-visitors" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/30 data-[state=active]:to-blue-500/20">👁️ Visitors</TabsTrigger>
            <TabsTrigger value="token-history" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/30 data-[state=active]:to-purple-500/20">💎 Token History</TabsTrigger>
            <TabsTrigger value="search-analytics" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500/30 data-[state=active]:to-indigo-500/20">🔍 Search Analytics</TabsTrigger>
            <TabsTrigger value="token-viewer" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/30 data-[state=active]:to-orange-500/20">📈 Token Viewer</TabsTrigger>
            <TabsTrigger value="dailies" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500/30 data-[state=active]:to-rose-500/20">📅 Dailies</TabsTrigger>
          </TabsList>

          <TabsContent value="fuckoff">
            {/* Empty tab */}
          </TabsContent>

          <TabsContent value="master-wallets">
            <ActiveTabOnly activeTab={activeTab} tabValue="master-wallets">
              <MasterWalletsDashboard />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="wallets">
            <ActiveTabOnly activeTab={activeTab} tabValue="wallets">
              <div className="space-y-6">
                <WalletBalanceMonitor />
                <SuperAdminWallets />
              </div>
            </ActiveTabOnly>
          </TabsContent>
          
          <TabsContent value="recovery">
            <ActiveTabOnly activeTab={activeTab} tabValue="recovery">
              <AdminWalletRecovery />
            </ActiveTabOnly>
          </TabsContent>
          
          
          <TabsContent value="security">
            <ActiveTabOnly activeTab={activeTab} tabValue="security">
              <SecurityDashboard />
            </ActiveTabOnly>
          </TabsContent>
          
          <TabsContent value="accounts">
            <ActiveTabOnly activeTab={activeTab} tabValue="accounts">
              <AccountViewer />
            </ActiveTabOnly>
          </TabsContent>
          
          <TabsContent value="holders">
            <ActiveTabOnly activeTab={activeTab} tabValue="holders">
              <BaglessHoldersReport />
            </ActiveTabOnly>
          </TabsContent>
          
          <TabsContent value="utilities">
            <ActiveTabOnly activeTab={activeTab} tabValue="utilities">
              <Tabs defaultValue="spider" className="space-y-4">
                <TabsList className="flex flex-wrap gap-1">
                  <TabsTrigger value="spider">🕷️ Spider</TabsTrigger>
                  <TabsTrigger value="api-resources">📊 API Resources</TabsTrigger>
                  <TabsTrigger value="sol-analytics">📊 SOL Price</TabsTrigger>
                  <TabsTrigger value="sniff">🐕 SNIFF</TabsTrigger>
                  <TabsTrigger value="helius-api">⚡ Helius API</TabsTrigger>
                  <TabsTrigger value="api-providers">⚡ API Providers</TabsTrigger>
                  <TabsTrigger value="liquidity">🔒 Liquidity Checker</TabsTrigger>
                </TabsList>
                <TabsContent value="spider"><SpiderRouteMap /></TabsContent>
                <TabsContent value="api-resources"><HoldersResourceDashboard /></TabsContent>
                <TabsContent value="sol-analytics"><SolPriceAnalytics /></TabsContent>
                <TabsContent value="sniff"><SniffDashboard /></TabsContent>
                <TabsContent value="helius-api"><HeliusUsageDashboard /></TabsContent>
                <TabsContent value="api-providers"><ApiProviderManager /></TabsContent>
                <TabsContent value="liquidity"><LiquidityLockChecker /></TabsContent>
              </Tabs>
            </ActiveTabOnly>
          </TabsContent>
          
          <TabsContent value="tokens">
            <ActiveTabOnly activeTab={activeTab} tabValue="tokens">
              <AllWalletsTokenView />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="developers">
            <ActiveTabOnly activeTab={activeTab} tabValue="developers">
              <DeveloperProfiles />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="analysis">
            <ActiveTabOnly activeTab={activeTab} tabValue="analysis">
              <AnalysisJobs />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="watchdog">
            <ActiveTabOnly activeTab={activeTab} tabValue="watchdog">
              <TokenWatchdog />
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
              </Tabs>
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="arbitrage">
            <ActiveTabOnly activeTab={activeTab} tabValue="arbitrage">
              <ArbitrageBotDashboard />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="playground">
            <ActiveTabOnly activeTab={activeTab} tabValue="playground">
              <Playground />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="airdrops">
            <ActiveTabOnly activeTab={activeTab} tabValue="airdrops">
              <AirdropManager />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="fuct-airdrops">
            <ActiveTabOnly activeTab={activeTab} tabValue="fuct-airdrops">
              <FuctAirdropGift />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="banners">
            <ActiveTabOnly activeTab={activeTab} tabValue="banners">
              <BannerManagement />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="advertisers">
            <ActiveTabOnly activeTab={activeTab} tabValue="advertisers">
              <AdvertiserManagement />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="surveys">
            <ActiveTabOnly activeTab={activeTab} tabValue="surveys">
              <SurveyManagement />
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

          <TabsContent value="rug-investigator">
            <ActiveTabOnly activeTab={activeTab} tabValue="rug-investigator">
              <RugInvestigator />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="rent-reclaimer">
            <ActiveTabOnly activeTab={activeTab} tabValue="rent-reclaimer">
              <TokenAccountCleaner />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="pumpfun-blacklist">
            <ActiveTabOnly activeTab={activeTab} tabValue="pumpfun-blacklist">
              <PumpfunBlacklist />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="pumpfun-whitelist">
            <ActiveTabOnly activeTab={activeTab} tabValue="pumpfun-whitelist">
              <PumpfunWhitelist />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="kol-tracker">
            <ActiveTabOnly activeTab={activeTab} tabValue="kol-tracker">
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
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="dev-teams">
            <ActiveTabOnly activeTab={activeTab} tabValue="dev-teams">
              <DevTeamsView />
            </ActiveTabOnly>
          </TabsContent>




          <TabsContent value="holders-visitors">
            <ActiveTabOnly activeTab={activeTab} tabValue="holders-visitors">
              <HoldersVisitorsDashboard />
            </ActiveTabOnly>
          </TabsContent>



          <TabsContent value="token-history">
            <ActiveTabOnly activeTab={activeTab} tabValue="token-history">
              <HistoricalTokenDataDashboard />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="search-analytics">
            <ActiveTabOnly activeTab={activeTab} tabValue="search-analytics">
              <TokenSearchAnalytics />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="token-viewer">
            <ActiveTabOnly activeTab={activeTab} tabValue="token-viewer">
              <TokenHistoryViewer />
            </ActiveTabOnly>
          </TabsContent>

          <TabsContent value="dailies">
            <ActiveTabOnly activeTab={activeTab} tabValue="dailies">
              <DailiesDashboard />
            </ActiveTabOnly>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
