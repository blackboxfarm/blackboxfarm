import React, { lazy, Suspense, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LazyLoader } from '@/components/ui/lazy-loader';

// Lazy load each component
const MasterWalletsDashboard = lazy(() => import("@/components/admin/MasterWalletsDashboard").then(m => ({ default: m.MasterWalletsDashboard })));
const SecurityDashboard = lazy(() => import("@/components/security/SecurityDashboard").then(m => ({ default: m.SecurityDashboard })));
const AccountViewer = lazy(() => import("@/components/AccountViewer").then(m => ({ default: m.AccountViewer })));
const AllWalletsTokenView = lazy(() => import("@/components/AllWalletsTokenView").then(m => ({ default: m.AllWalletsTokenView })));
const ArbitrageBotDashboard = lazy(() => import("@/components/admin/ArbitrageBotDashboard").then(m => ({ default: m.ArbitrageBotDashboard })));
const Playground = lazy(() => import("@/components/admin/Playground").then(m => ({ default: m.Playground })));
const AirdropManager = lazy(() => import("@/components/admin/AirdropManager").then(m => ({ default: m.AirdropManager })));
const FuctAirdropGift = lazy(() => import("@/components/admin/FuctAirdropGift").then(m => ({ default: m.FuctAirdropGift })));
const SurveyManagement = lazy(() => import("@/components/admin/SurveyManagement").then(m => ({ default: m.SurveyManagement })));

export default function BlackBoxTab() {
  const [activeSubTab, setActiveSubTab] = useState("master-wallets");

  return (
    <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
      <TabsList className="flex flex-wrap gap-1">
        <TabsTrigger value="master-wallets">👑 Master Wallets</TabsTrigger>
        <TabsTrigger value="security">🛡️ Security Dashboard</TabsTrigger>
        <TabsTrigger value="accounts">📁 Account Directory</TabsTrigger>
        <TabsTrigger value="tokens">🪙 All Tokens</TabsTrigger>
        <TabsTrigger value="arbitrage">📊 Arbitrage Bot</TabsTrigger>
        <TabsTrigger value="playground">🎮 Playground</TabsTrigger>
        <TabsTrigger value="airdrops">🎁 Airdrops</TabsTrigger>
        <TabsTrigger value="fuct-airdrops">💜 $FUCT Airdrops</TabsTrigger>
        <TabsTrigger value="surveys">📋 Surveys</TabsTrigger>
      </TabsList>

      <TabsContent value="master-wallets">
        {activeSubTab === "master-wallets" && <Suspense fallback={<LazyLoader />}><MasterWalletsDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="security">
        {activeSubTab === "security" && <Suspense fallback={<LazyLoader />}><SecurityDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="accounts">
        {activeSubTab === "accounts" && <Suspense fallback={<LazyLoader />}><AccountViewer /></Suspense>}
      </TabsContent>
      <TabsContent value="tokens">
        {activeSubTab === "tokens" && <Suspense fallback={<LazyLoader />}><AllWalletsTokenView /></Suspense>}
      </TabsContent>
      <TabsContent value="arbitrage">
        {activeSubTab === "arbitrage" && <Suspense fallback={<LazyLoader />}><ArbitrageBotDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="playground">
        {activeSubTab === "playground" && <Suspense fallback={<LazyLoader />}><Playground /></Suspense>}
      </TabsContent>
      <TabsContent value="airdrops">
        {activeSubTab === "airdrops" && <Suspense fallback={<LazyLoader />}><AirdropManager /></Suspense>}
      </TabsContent>
      <TabsContent value="fuct-airdrops">
        {activeSubTab === "fuct-airdrops" && <Suspense fallback={<LazyLoader />}><FuctAirdropGift /></Suspense>}
      </TabsContent>
      <TabsContent value="surveys">
        {activeSubTab === "surveys" && <Suspense fallback={<LazyLoader />}><SurveyManagement /></Suspense>}
      </TabsContent>
    </Tabs>
  );
}
