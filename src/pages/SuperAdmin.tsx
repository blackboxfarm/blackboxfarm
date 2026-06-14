import React, { useState, useEffect, lazy, Suspense, memo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewSuperAdmin } from "@/hooks/usePreviewSuperAdmin";
import { AlertTriangle } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNotificationsBadge } from "@/components/admin/AdminNotificationsBadge";
import { LazyLoader } from "@/components/ui/lazy-loader";
import { AccountSnapshotWidget } from "@/components/admin/AccountSnapshotWidget";
import { TabErrorBoundary } from "@/components/ui/TabErrorBoundary";
const WaterfallGrid = lazy(() => import("@/components/admin/WaterfallGrid"));

// Lazy load entire tab content sections - they ONLY load when their tab is clicked
const UtilitiesTab = lazy(() => import("@/components/admin/tabs/UtilitiesTab"));
const BlackBoxTab = lazy(() => import("@/components/admin/tabs/BlackBoxTab"));
const HoldersIntelTab = lazy(() => import("@/components/admin/tabs/HoldersIntelTab"));
const WhalesMINTSTab = lazy(() => import("@/components/admin/tabs/WhalesMINTSTab"));
const FlipItDashboard = lazy(() => import("@/components/admin/FlipItDashboard").then(m => ({ default: m.FlipItDashboard })));
const MeteoraPoolsDashboard = lazy(() => import("@/components/admin/MeteoraPoolsDashboard").then(m => ({ default: m.MeteoraPoolsDashboard })));
const TelegramChannelMonitor = lazy(() => import("@/components/admin/TelegramChannelMonitor"));
const TwitterAccountManager = lazy(() => import("@/components/admin/TwitterAccountManager"));
const PumpfunMonitorTab = lazy(() => import("@/components/admin/tabs/PumpfunMonitorTab"));
const OracleTab = lazy(() => import("@/components/admin/tabs/OracleTab"));
const MasterDBTab = lazy(() => import("@/components/admin/tabs/MasterDBTab"));
const MorningReportTab = lazy(() => import("@/components/admin/tabs/MorningReportTab"));
const AllstarTab = lazy(() => import("@/components/admin/tabs/AllstarTab"));
const FunnelFeedsTab = lazy(() => import("@/components/admin/tabs/FunnelFeedsTab"));
const MonitoringTab = lazy(() => import("@/components/admin/tabs/MonitoringTab"));
const TicketsTab = lazy(() => import("@/components/admin/tabs/TicketsTab"));
const Top200Tab = lazy(() => import("@/components/admin/tabs/Top200Tab"));
const SocialMediaTab = lazy(() => import("@/components/admin/tabs/SocialMediaTab"));
const TestimonialsManager = lazy(() => import("@/components/admin/TestimonialsManager").then(m => ({ default: m.TestimonialsManager })));
const IntelBriefingsManager = lazy(() => import("@/components/admin/IntelBriefingsManager").then(m => ({ default: m.IntelBriefingsManager })));
const CacheBustingTools = lazy(() => import("@/components/intel/CacheBustingTools").then(m => ({ default: m.CacheBustingTools })));
const MetaTagsManager = lazy(() => import("@/components/admin/MetaTagsManager").then(m => ({ default: m.MetaTagsManager })));
const OgMetaDiagnostic = lazy(() => import("@/components/admin/OgMetaDiagnostic").then(m => ({ default: m.OgMetaDiagnostic })));
const AIConfigTab = lazy(() => import("@/components/admin/tabs/AIConfigTab"));
const EmailCampaignsManager = lazy(() => import("@/components/admin/EmailCampaignsManager").then(m => ({ default: m.EmailCampaignsManager })));
const MarketingProfilesManager = lazy(() => import("@/components/admin/MarketingProfilesManager").then(m => ({ default: m.MarketingProfilesManager })));
const TodoListTab = lazy(() => import("@/components/admin/tabs/TodoListTab"));
const TestersTab = lazy(() => import("@/components/admin/tabs/TestersTab"));
const AccountsTab = lazy(() => import("@/components/admin/tabs/AccountsTab"));
const InsidersLifecycleTab = lazy(() => import("@/components/admin/tabs/InsidersLifecycleTab"));
const DocsTab = lazy(() => import("@/components/admin/tabs/DocsTab"));
const ChatSessionsTab = lazy(() => import("@/components/admin/ChatSessionsTab").then(m => ({ default: m.ChatSessionsTab })));
const AutopsiesTab = lazy(() => import("@/components/admin/tabs/AutopsiesTab"));
const DevVerdictTab = lazy(() => import("@/components/admin/tabs/DevVerdictTab"));

const DEFAULT_ADMIN_TAB = "utilities";
const ALLOWED_ADMIN_TABS = new Set([
  "utilities",
  "oracle",
  "holders-intel",
  "whales-mints",
  "flipit",
  "pools",
  "telegram",
  "twitter-accounts",
  "pumpfun-monitor",
  "master-db",
  "morning-report",
  "allstar",
  "funnel-feeds",
  "monitoring",
  "tickets",
  "top-200",
  "social-media",
  "testimonials",
  "intel-briefings",
  "autopsies",
  "ai-config",
  "email-campaigns",
  "marketing-profiles",
  "todo-list",
  "testers",
  "accounts",
  "insiders-lifecycle",
  "docs",
  "chat-sessions",
  "dev-verdict",
  "waterfall",
]);

// Simple loading fallback
const TabLoader = memo(() => (
  <div className="flex items-center justify-center py-12">
    <div className="text-center space-y-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
));
TabLoader.displayName = 'TabLoader';

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState(DEFAULT_ADMIN_TAB);
  const [hydrated, setHydrated] = useState(false);
  const { isSuperAdmin, isLoading } = useUserRoles();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const isPreviewAdmin = usePreviewSuperAdmin();

  useEffect(() => {
    // Mark as hydrated so the static boot snapshot shows a loading screen
    setHydrated(true);
  }, []);

  const [oracleSubTab, setOracleSubTab] = useState<string | undefined>();
  const [oracleWallet, setOracleWallet] = useState<string | undefined>();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ALLOWED_ADMIN_TABS.has(tabParam)) {
      setActiveTab(tabParam);
    }
    const subtab = urlParams.get('subtab');
    if (subtab) setOracleSubTab(subtab);
    const wallet = urlParams.get('wallet');
    if (wallet) setOracleWallet(wallet);
  }, []);

  // Listen for navigate-admin-tab events from notification badge
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab && ALLOWED_ADMIN_TABS.has(detail.tab)) {
        setActiveTab(detail.tab);
      }
    };
    window.addEventListener('navigate-admin-tab', handler);
    return () => window.removeEventListener('navigate-admin-tab', handler);
  }, []);

  // Redirect unauthenticated users to auth page (skip in preview-admin mode)
  if (!isPreviewAdmin && !authLoading && !isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  // Show loading during boot so the static snapshot never shows stale UI
  if (!hydrated || (!isPreviewAdmin && (isLoading || authLoading))) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading Super Admin...</p>
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
      <div className="w-full mx-auto px-4 py-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">Super Admin</h1>
            <p className="text-muted-foreground">
              Manage platform wallets and administrative functions
            </p>
          </div>
          <div className="flex items-start gap-4">
            <AccountSnapshotWidget />
            <AdminNotificationsBadge />
          </div>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Main category tabs - minimal, just 8 triggers */}
          <TabsList className="flex flex-wrap w-full h-auto gap-1 p-2">
            <TabsTrigger value="utilities" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/30 data-[state=active]:to-yellow-500/20">🛠️ Utilities</TabsTrigger>
            <TabsTrigger value="oracle" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/30 data-[state=active]:to-purple-500/20">🔮 Oracle</TabsTrigger>
            <TabsTrigger value="blackbox" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-zinc-700/30 data-[state=active]:to-zinc-800/20">📦 BlackBox</TabsTrigger>
            <TabsTrigger value="holders-intel" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500/30 data-[state=active]:to-violet-500/20">📊 Holders Intel</TabsTrigger>
            <TabsTrigger value="whales-mints" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/30 data-[state=active]:to-teal-500/20">🐋 Whales & MINTS</TabsTrigger>
            <TabsTrigger value="flipit" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500/30 data-[state=active]:to-red-500/20">🔥 FlipIt</TabsTrigger>
            <TabsTrigger value="pools" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500/30 data-[state=active]:to-cyan-500/20">🌊 Pools</TabsTrigger>
            <TabsTrigger value="telegram" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500/30 data-[state=active]:to-blue-500/20">📡 Telegram</TabsTrigger>
            <TabsTrigger value="twitter-accounts" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500/30 data-[state=active]:to-cyan-500/20">🐦 Twitter</TabsTrigger>
            <TabsTrigger value="pumpfun-monitor" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500/30 data-[state=active]:to-emerald-500/20">🚀 Pump.fun</TabsTrigger>
            <TabsTrigger value="master-db" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500/30 data-[state=active]:to-blue-500/20">🗄️ Master DB</TabsTrigger>
            <TabsTrigger value="morning-report" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/30 data-[state=active]:to-orange-500/20">☀️ Morning Report</TabsTrigger>
            <TabsTrigger value="allstar" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-500/30 data-[state=active]:to-amber-500/20">⭐ Allstars</TabsTrigger>
            <TabsTrigger value="funnel-feeds" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-lime-500/30 data-[state=active]:to-green-500/20">🔄 Funnel Feeds</TabsTrigger>
            <TabsTrigger value="monitoring" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500/30 data-[state=active]:to-rose-500/20">📡 Monitoring</TabsTrigger>
            <TabsTrigger value="tickets" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500/30 data-[state=active]:to-cyan-500/20">🎫 Tickets</TabsTrigger>
            <TabsTrigger value="top-200" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/30 data-[state=active]:to-yellow-500/20">🏆 Top 200</TabsTrigger>
            <TabsTrigger value="social-media" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500/30 data-[state=active]:to-purple-500/20">📱 Social</TabsTrigger>
            <TabsTrigger value="testimonials" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500/30 data-[state=active]:to-green-500/20">💬 Testimonials</TabsTrigger>
            <TabsTrigger value="intel-briefings" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500/30 data-[state=active]:to-indigo-500/20">📰 Intel Briefings</TabsTrigger>
            <TabsTrigger value="autopsies" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500/30 data-[state=active]:to-rose-500/20">💀 Autopsies</TabsTrigger>
            <TabsTrigger value="ai-config" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500/30 data-[state=active]:to-cyan-500/20">🧠 AI Config</TabsTrigger>
            <TabsTrigger value="email-campaigns" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-500/30 data-[state=active]:to-pink-500/20">📧 Email Campaigns</TabsTrigger>
            <TabsTrigger value="marketing-profiles" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-500/30 data-[state=active]:to-pink-500/20">🎯 Marketing Profiles</TabsTrigger>
            <TabsTrigger value="todo-list" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500/30 data-[state=active]:to-lime-500/20">📝 To-Do</TabsTrigger>
            <TabsTrigger value="testers" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500/30 data-[state=active]:to-rose-500/20">🧪 Testers</TabsTrigger>
            <TabsTrigger value="accounts" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500/30 data-[state=active]:to-cyan-500/20">👥 Accounts</TabsTrigger>
            <TabsTrigger value="insiders-lifecycle" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-500/30 data-[state=active]:to-purple-500/20">📈 Insiders Lifecycle</TabsTrigger>
            <TabsTrigger value="docs" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-500/30 data-[state=active]:to-zinc-500/20">📚 Docs</TabsTrigger>
            <TabsTrigger value="chat-sessions" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/30 data-[state=active]:to-indigo-500/20">💬 Chat Sessions</TabsTrigger>
            <TabsTrigger value="dev-verdict" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500/30 data-[state=active]:to-teal-500/20">🔬 Dev Verdict</TabsTrigger>
            <TabsTrigger value="waterfall" className="flex-shrink-0">💧 Waterfall</TabsTrigger>
          </TabsList>

          {/* Each tab content is completely lazy - inner tabs only load when this category is active */}
          <TabsContent value="utilities">
            {activeTab === "utilities" && (
              <TabErrorBoundary tabName="Utilities">
                <Suspense fallback={<TabLoader />}><UtilitiesTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="oracle">
            {activeTab === "oracle" && (
              <TabErrorBoundary tabName="Oracle">
                <Suspense fallback={<TabLoader />}><OracleTab initialSubTab={oracleSubTab} initialWallet={oracleWallet} /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="blackbox">
            {activeTab === "blackbox" && (
              <TabErrorBoundary tabName="BlackBox">
                <Suspense fallback={<TabLoader />}><BlackBoxTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="holders-intel">
            {activeTab === "holders-intel" && (
              <TabErrorBoundary tabName="Holders Intel">
                <Suspense fallback={<TabLoader />}><HoldersIntelTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="whales-mints">
            {activeTab === "whales-mints" && (
              <TabErrorBoundary tabName="Whales & MINTS">
                <Suspense fallback={<TabLoader />}><WhalesMINTSTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="flipit">
            {activeTab === "flipit" && (
              <TabErrorBoundary tabName="FlipIt">
                <Suspense fallback={<TabLoader />}><FlipItDashboard /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="pools">
            {activeTab === "pools" && (
              <TabErrorBoundary tabName="Pools">
                <Suspense fallback={<TabLoader />}><MeteoraPoolsDashboard /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="telegram">
            {activeTab === "telegram" && (
              <TabErrorBoundary tabName="Telegram">
                <Suspense fallback={<TabLoader />}><TelegramChannelMonitor /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="twitter-accounts">
            {activeTab === "twitter-accounts" && (
              <TabErrorBoundary tabName="Twitter">
                <Suspense fallback={<TabLoader />}><TwitterAccountManager /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="pumpfun-monitor">
            {activeTab === "pumpfun-monitor" && (
              <TabErrorBoundary tabName="Pump.fun Monitor">
                <Suspense fallback={<TabLoader />}><PumpfunMonitorTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="master-db">
            {activeTab === "master-db" && (
              <TabErrorBoundary tabName="Master DB">
                <Suspense fallback={<TabLoader />}><MasterDBTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="morning-report">
            {activeTab === "morning-report" && (
              <TabErrorBoundary tabName="Morning Report">
                <Suspense fallback={<TabLoader />}><MorningReportTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="allstar">
            {activeTab === "allstar" && (
              <TabErrorBoundary tabName="Allstars">
                <Suspense fallback={<TabLoader />}><AllstarTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="funnel-feeds">
            {activeTab === "funnel-feeds" && (
              <TabErrorBoundary tabName="Funnel Feeds">
                <Suspense fallback={<TabLoader />}><FunnelFeedsTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="monitoring">
            {activeTab === "monitoring" && (
              <TabErrorBoundary tabName="Monitoring">
                <Suspense fallback={<TabLoader />}><MonitoringTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="tickets">
            {activeTab === "tickets" && (
              <TabErrorBoundary tabName="Tickets">
                <Suspense fallback={<TabLoader />}><TicketsTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="top-200">
            {activeTab === "top-200" && (
              <TabErrorBoundary tabName="Top 200">
                <Suspense fallback={<TabLoader />}><Top200Tab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="social-media">
            {activeTab === "social-media" && (
              <TabErrorBoundary tabName="Social Media">
                <Suspense fallback={<TabLoader />}><SocialMediaTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="testimonials">
            {activeTab === "testimonials" && (
              <TabErrorBoundary tabName="Testimonials">
                <Suspense fallback={<TabLoader />}><TestimonialsManager /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="intel-briefings">
            {activeTab === "intel-briefings" && (
              <TabErrorBoundary tabName="Intel Briefings">
                <Suspense fallback={<TabLoader />}>
                  <IntelBriefingsManager />
                   <div className="mt-8">
                     <OgMetaDiagnostic />
                   </div>
                   <div className="mt-8">
                     <MetaTagsManager />
                   </div>
                   <div className="mt-8">
                     <CacheBustingTools />
                   </div>
                </Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
           <TabsContent value="autopsies">
             {activeTab === "autopsies" && (
               <TabErrorBoundary tabName="Autopsies">
                 <Suspense fallback={<TabLoader />}>
                   <AutopsiesTab />
                 </Suspense>
               </TabErrorBoundary>
             )}
           </TabsContent>
          <TabsContent value="ai-config">
            {activeTab === "ai-config" && (
              <TabErrorBoundary tabName="AI Config">
                <Suspense fallback={<TabLoader />}><AIConfigTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="email-campaigns">
            {activeTab === "email-campaigns" && (
              <TabErrorBoundary tabName="Email Campaigns">
                <Suspense fallback={<TabLoader />}><EmailCampaignsManager /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="marketing-profiles">
            {activeTab === "marketing-profiles" && (
              <TabErrorBoundary tabName="Marketing Profiles">
                <Suspense fallback={<TabLoader />}><MarketingProfilesManager /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="todo-list">
            {activeTab === "todo-list" && (
              <TabErrorBoundary tabName="To-Do List">
                <Suspense fallback={<TabLoader />}><TodoListTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="testers">
            {activeTab === "testers" && (
              <TabErrorBoundary tabName="Testers">
                <Suspense fallback={<TabLoader />}><TestersTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="accounts">
            {activeTab === "accounts" && (
              <TabErrorBoundary tabName="Accounts">
                <Suspense fallback={<TabLoader />}><AccountsTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="insiders-lifecycle">
            {activeTab === "insiders-lifecycle" && (
              <TabErrorBoundary tabName="Insiders Lifecycle">
                <Suspense fallback={<TabLoader />}><InsidersLifecycleTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="docs">
            {activeTab === "docs" && (
              <TabErrorBoundary tabName="Docs">
                <Suspense fallback={<TabLoader />}><DocsTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="chat-sessions">
            {activeTab === "chat-sessions" && (
              <TabErrorBoundary tabName="Chat Sessions">
                <Suspense fallback={<TabLoader />}><ChatSessionsTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="dev-verdict">
            {activeTab === "dev-verdict" && (
              <TabErrorBoundary tabName="Dev Verdict">
                <Suspense fallback={<TabLoader />}><DevVerdictTab /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
          <TabsContent value="waterfall">
            {activeTab === "waterfall" && (
              <TabErrorBoundary tabName="Waterfall">
                <Suspense fallback={<TabLoader />}><WaterfallGrid /></Suspense>
              </TabErrorBoundary>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
