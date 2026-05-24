import React, { lazy, Suspense, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LazyLoader } from '@/components/ui/lazy-loader';

// Lazy load each component
const SecurityDashboard = lazy(() => import("@/components/security/SecurityDashboard").then(m => ({ default: m.SecurityDashboard })));
const AccountViewer = lazy(() => import("@/components/AccountViewer").then(m => ({ default: m.AccountViewer })));
const AllWalletsTokenView = lazy(() => import("@/components/AllWalletsTokenView").then(m => ({ default: m.AllWalletsTokenView })));
const ArbitrageBotDashboard = lazy(() => import("@/components/admin/ArbitrageBotDashboard").then(m => ({ default: m.ArbitrageBotDashboard })));
const Playground = lazy(() => import("@/components/admin/Playground").then(m => ({ default: m.Playground })));
const AirdropManager = lazy(() => import("@/components/admin/AirdropManager").then(m => ({ default: m.AirdropManager })));
const FuctAirdropGift = lazy(() => import("@/components/admin/FuctAirdropGift").then(m => ({ default: m.FuctAirdropGift })));
const SurveyManagement = lazy(() => import("@/components/admin/SurveyManagement").then(m => ({ default: m.SurveyManagement })));
const SecurityActivityDashboard = lazy(() => import("@/components/admin/SecurityActivityDashboard").then(m => ({ default: m.SecurityActivityDashboard })));
const WalletBundleReport = lazy(() => import("@/components/admin/WalletBundleReport").then(m => ({ default: m.WalletBundleReport })));
const FotobombApp = lazy(() => import("@/components/admin/FotobombApp"));
const MasterWalletsDashboard = lazy(() => import("@/components/admin/MasterWalletsDashboard").then(m => ({ default: m.MasterWalletsDashboard })));
const LaunchersTab = lazy(() => import("@/components/admin/launchers/LaunchersTab"));
const BlackBoxParserSamples = lazy(() => import("@/components/admin/blackbox/BlackBoxParserSamples"));

export default function BlackBoxTab() {
  const [activeSubTab, setActiveSubTab] = useState("launchers");

  return (
    <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
      <TabsList className="flex flex-wrap gap-1">
        <TabsTrigger value="launchers">🚀 Launchers</TabsTrigger>
        <TabsTrigger value="parser-probe">🔬 Parser Probe</TabsTrigger>
        <TabsTrigger value="bundle-analysis">🕵️ Bundle Analysis</TabsTrigger>
        <TabsTrigger value="security">🛡️ Security Dashboard</TabsTrigger>
        <TabsTrigger value="security-activity">🔐 Security Activity</TabsTrigger>
        <TabsTrigger value="accounts">📁 Account Directory</TabsTrigger>
        <TabsTrigger value="tokens">🪙 All Tokens</TabsTrigger>
        <TabsTrigger value="arbitrage">📊 Arbitrage Bot</TabsTrigger>
        <TabsTrigger value="playground">🎮 Playground</TabsTrigger>
        <TabsTrigger value="airdrops">🎁 Airdrops</TabsTrigger>
        <TabsTrigger value="fuct-airdrops">💜 $FUCT Airdrops</TabsTrigger>
        <TabsTrigger value="surveys">📋 Surveys</TabsTrigger>
        <TabsTrigger value="fotobomb">💣 FOTOBOMB</TabsTrigger>
        <TabsTrigger value="wallet-recovery">🔑 Master Wallets</TabsTrigger>
      </TabsList>

      <TabsContent value="launchers">
        {activeSubTab === "launchers" && <Suspense fallback={<LazyLoader />}><LaunchersTab /></Suspense>}
      </TabsContent>
      <TabsContent value="parser-probe">
        {activeSubTab === "parser-probe" && <Suspense fallback={<LazyLoader />}><BlackBoxParserSamples /></Suspense>}
      </TabsContent>
      <TabsContent value="bundle-analysis">
        {activeSubTab === "bundle-analysis" && <Suspense fallback={<LazyLoader />}><WalletBundleReport /></Suspense>}
      </TabsContent>
      <TabsContent value="security">
        {activeSubTab === "security" && <Suspense fallback={<LazyLoader />}><SecurityDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="security-activity">
        {activeSubTab === "security-activity" && <Suspense fallback={<LazyLoader />}><SecurityActivityDashboard /></Suspense>}
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
      <TabsContent value="fotobomb">
        {activeSubTab === "fotobomb" && <Suspense fallback={<LazyLoader />}><FotobombApp /></Suspense>}
      </TabsContent>
      <TabsContent value="wallet-recovery">
        {activeSubTab === "wallet-recovery" && <Suspense fallback={<LazyLoader />}><MasterWalletsDashboard /></Suspense>}
      </TabsContent>
    </Tabs>
  );
}
