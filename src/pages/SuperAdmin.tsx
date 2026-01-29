import React, { useState, useEffect, lazy, Suspense, memo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRoles } from "@/hooks/useUserRoles";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNotificationsBadge } from "@/components/admin/AdminNotificationsBadge";
import { LazyLoader } from "@/components/ui/lazy-loader";

// Lazy load entire tab content sections - they ONLY load when their tab is clicked
const UtilitiesTab = lazy(() => import("@/components/admin/tabs/UtilitiesTab"));
const BlackBoxTab = lazy(() => import("@/components/admin/tabs/BlackBoxTab"));
const HoldersIntelTab = lazy(() => import("@/components/admin/tabs/HoldersIntelTab"));
const WhalesMINTSTab = lazy(() => import("@/components/admin/tabs/WhalesMINTSTab"));
const FlipItDashboard = lazy(() => import("@/components/admin/FlipItDashboard").then(m => ({ default: m.FlipItDashboard })));
const TelegramChannelMonitor = lazy(() => import("@/components/admin/TelegramChannelMonitor"));
const TwitterAccountManager = lazy(() => import("@/components/admin/TwitterAccountManager"));
const PumpfunMonitorTab = lazy(() => import("@/components/admin/tabs/PumpfunMonitorTab"));

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
  const [activeTab, setActiveTab] = useState("utilities");
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
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Super Admin</h1>
            <p className="text-muted-foreground">
              Manage platform wallets and administrative functions
            </p>
          </div>
          <AdminNotificationsBadge />
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Main category tabs - minimal, just 8 triggers */}
          <TabsList className="flex flex-wrap w-full h-auto gap-1 p-2">
            <TabsTrigger value="utilities" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/30 data-[state=active]:to-yellow-500/20">🛠️ Utilities</TabsTrigger>
            <TabsTrigger value="blackbox" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-zinc-700/30 data-[state=active]:to-zinc-800/20">📦 BlackBox</TabsTrigger>
            <TabsTrigger value="holders-intel" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500/30 data-[state=active]:to-violet-500/20">🔮 Holders Intel</TabsTrigger>
            <TabsTrigger value="whales-mints" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/30 data-[state=active]:to-teal-500/20">🐋 Whales & MINTS</TabsTrigger>
            <TabsTrigger value="flipit" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500/30 data-[state=active]:to-red-500/20">🔥 FlipIt</TabsTrigger>
            <TabsTrigger value="telegram" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500/30 data-[state=active]:to-blue-500/20">📡 Telegram</TabsTrigger>
            <TabsTrigger value="twitter-accounts" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500/30 data-[state=active]:to-cyan-500/20">🐦 Twitter</TabsTrigger>
            <TabsTrigger value="pumpfun-monitor" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500/30 data-[state=active]:to-emerald-500/20">🚀 Pump.fun</TabsTrigger>
          </TabsList>

          {/* Each tab content is completely lazy - inner tabs only load when this category is active */}
          <TabsContent value="utilities">
            {activeTab === "utilities" && (
              <Suspense fallback={<TabLoader />}>
                <UtilitiesTab />
              </Suspense>
            )}
          </TabsContent>

          <TabsContent value="blackbox">
            {activeTab === "blackbox" && (
              <Suspense fallback={<TabLoader />}>
                <BlackBoxTab />
              </Suspense>
            )}
          </TabsContent>

          <TabsContent value="holders-intel">
            {activeTab === "holders-intel" && (
              <Suspense fallback={<TabLoader />}>
                <HoldersIntelTab />
              </Suspense>
            )}
          </TabsContent>

          <TabsContent value="whales-mints">
            {activeTab === "whales-mints" && (
              <Suspense fallback={<TabLoader />}>
                <WhalesMINTSTab />
              </Suspense>
            )}
          </TabsContent>

          <TabsContent value="flipit">
            {activeTab === "flipit" && (
              <Suspense fallback={<TabLoader />}>
                <FlipItDashboard />
              </Suspense>
            )}
          </TabsContent>

          <TabsContent value="telegram">
            {activeTab === "telegram" && (
              <Suspense fallback={<TabLoader />}>
                <TelegramChannelMonitor />
              </Suspense>
            )}
          </TabsContent>

          <TabsContent value="twitter-accounts">
            {activeTab === "twitter-accounts" && (
              <Suspense fallback={<TabLoader />}>
                <TwitterAccountManager />
              </Suspense>
            )}
          </TabsContent>

          <TabsContent value="pumpfun-monitor">
            {activeTab === "pumpfun-monitor" && (
              <Suspense fallback={<TabLoader />}>
                <PumpfunMonitorTab />
              </Suspense>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
