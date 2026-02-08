import React, { lazy, Suspense, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LazyLoader } from '@/components/ui/lazy-loader';

// Lazy load each component
const MegaWhaleDashboard = lazy(() => import("@/components/admin/MegaWhaleDashboard").then(m => ({ default: m.MegaWhaleDashboard })));
const WhaleFrenzyDashboard = lazy(() => import("@/components/admin/WhaleFrenzyDashboard").then(m => ({ default: m.WhaleFrenzyDashboard })));
const WalletMonitor = lazy(() => import("@/components/WalletMonitor").then(m => ({ default: m.WalletMonitor })));
const TokenGenealogyDashboard = lazy(() => import("@/components/admin/TokenGenealogyDashboard").then(m => ({ default: m.TokenGenealogyDashboard })));
const DexCompilesView = lazy(() => import("@/components/admin/DexCompilesView").then(m => ({ default: m.DexCompilesView })));
const HtmlScrapes = lazy(() => import("@/components/admin/HtmlScrapes").then(m => ({ default: m.HtmlScrapes })));
const TokenSets = lazy(() => import("@/components/admin/TokenSets").then(m => ({ default: m.TokenSets })));
const DeveloperAlerts = lazy(() => import("@/components/admin/DeveloperAlerts").then(m => ({ default: m.DeveloperAlerts })));
const SystemTesting = lazy(() => import("@/components/admin/SystemTesting").then(m => ({ default: m.SystemTesting })));
const DeveloperProfiles = lazy(() => import("@/components/admin/DeveloperProfiles").then(m => ({ default: m.DeveloperProfiles })));
const AnalysisJobs = lazy(() => import("@/components/admin/AnalysisJobs").then(m => ({ default: m.AnalysisJobs })));
const TokenWatchdog = lazy(() => import("@/components/admin/TokenWatchdog").then(m => ({ default: m.TokenWatchdog })));
const RugInvestigator = lazy(() => import("@/components/admin/RugInvestigator"));
const PumpfunBlacklist = lazy(() => import("@/components/admin/PumpfunBlacklist").then(m => ({ default: m.PumpfunBlacklist })));
const PumpfunWhitelist = lazy(() => import("@/components/admin/PumpfunWhitelist").then(m => ({ default: m.PumpfunWhitelist })));
const PumpfunKOLRegistry = lazy(() => import("@/components/admin/PumpfunKOLRegistry"));
const PumpfunKOLActivity = lazy(() => import("@/components/admin/PumpfunKOLActivity"));
const PumpfunKOLTwitter = lazy(() => import("@/components/admin/PumpfunKOLTwitter"));
const PumpfunKOLCabals = lazy(() => import("@/components/admin/PumpfunKOLCabals"));
const DevTeamsView = lazy(() => import("@/components/admin/DevTeamsView").then(m => ({ default: m.DevTeamsView })));
const MeshPipelineDashboard = lazy(() => import("@/components/admin/MeshPipelineDashboard").then(m => ({ default: m.MeshPipelineDashboard })));

export default function WhalesMINTSTab() {
  const [activeSubTab, setActiveSubTab] = useState("mega-whale");
  const [kolSubTab, setKolSubTab] = useState("registry");

  return (
    <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
      <TabsList className="flex flex-wrap gap-1">
        <TabsTrigger value="mega-whale">👑 MEGA WHALE</TabsTrigger>
        <TabsTrigger value="mesh-pipeline">🕸️ Mesh Pipeline</TabsTrigger>
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

      <TabsContent value="mega-whale">
        {activeSubTab === "mega-whale" && <Suspense fallback={<LazyLoader />}><MegaWhaleDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="mesh-pipeline">
        {activeSubTab === "mesh-pipeline" && <Suspense fallback={<LazyLoader />}><MeshPipelineDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="whale-frenzy">
        {activeSubTab === "whale-frenzy" && <Suspense fallback={<LazyLoader />}><WhaleFrenzyDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="wallet-monitor">
        {activeSubTab === "wallet-monitor" && <Suspense fallback={<LazyLoader />}><WalletMonitor /></Suspense>}
      </TabsContent>
      <TabsContent value="genealogy">
        {activeSubTab === "genealogy" && <Suspense fallback={<LazyLoader />}><TokenGenealogyDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="dex-compiles">
        {activeSubTab === "dex-compiles" && <Suspense fallback={<LazyLoader />}><DexCompilesView /></Suspense>}
      </TabsContent>
      <TabsContent value="html-scrapes">
        {activeSubTab === "html-scrapes" && <Suspense fallback={<LazyLoader />}><HtmlScrapes /></Suspense>}
      </TabsContent>
      <TabsContent value="token-sets">
        {activeSubTab === "token-sets" && <Suspense fallback={<LazyLoader />}><TokenSets /></Suspense>}
      </TabsContent>
      <TabsContent value="alerts">
        {activeSubTab === "alerts" && <Suspense fallback={<LazyLoader />}><DeveloperAlerts /></Suspense>}
      </TabsContent>
      <TabsContent value="testing">
        {activeSubTab === "testing" && <Suspense fallback={<LazyLoader />}><SystemTesting /></Suspense>}
      </TabsContent>
      <TabsContent value="developers">
        {activeSubTab === "developers" && <Suspense fallback={<LazyLoader />}><DeveloperProfiles /></Suspense>}
      </TabsContent>
      <TabsContent value="analysis">
        {activeSubTab === "analysis" && <Suspense fallback={<LazyLoader />}><AnalysisJobs /></Suspense>}
      </TabsContent>
      <TabsContent value="watchdog">
        {activeSubTab === "watchdog" && <Suspense fallback={<LazyLoader />}><TokenWatchdog /></Suspense>}
      </TabsContent>
      <TabsContent value="rug-investigator">
        {activeSubTab === "rug-investigator" && <Suspense fallback={<LazyLoader />}><RugInvestigator /></Suspense>}
      </TabsContent>
      <TabsContent value="blacklist">
        {activeSubTab === "blacklist" && <Suspense fallback={<LazyLoader />}><PumpfunBlacklist /></Suspense>}
      </TabsContent>
      <TabsContent value="whitelist">
        {activeSubTab === "whitelist" && <Suspense fallback={<LazyLoader />}><PumpfunWhitelist /></Suspense>}
      </TabsContent>
      <TabsContent value="kol-tracker">
        {activeSubTab === "kol-tracker" && (
          <Suspense fallback={<LazyLoader />}>
            <Tabs value={kolSubTab} onValueChange={setKolSubTab} className="space-y-4">
              <TabsList>
                <TabsTrigger value="registry">👑 KOL Registry</TabsTrigger>
                <TabsTrigger value="activity">📊 Activity</TabsTrigger>
                <TabsTrigger value="twitter">🐦 Twitter</TabsTrigger>
                <TabsTrigger value="cabals">🕸️ Cabals</TabsTrigger>
              </TabsList>
              <TabsContent value="registry">
                {kolSubTab === "registry" && <Suspense fallback={<LazyLoader />}><PumpfunKOLRegistry /></Suspense>}
              </TabsContent>
              <TabsContent value="activity">
                {kolSubTab === "activity" && <Suspense fallback={<LazyLoader />}><PumpfunKOLActivity /></Suspense>}
              </TabsContent>
              <TabsContent value="twitter">
                {kolSubTab === "twitter" && <Suspense fallback={<LazyLoader />}><PumpfunKOLTwitter /></Suspense>}
              </TabsContent>
              <TabsContent value="cabals">
                {kolSubTab === "cabals" && <Suspense fallback={<LazyLoader />}><PumpfunKOLCabals /></Suspense>}
              </TabsContent>
            </Tabs>
          </Suspense>
        )}
      </TabsContent>
      <TabsContent value="dev-teams">
        {activeSubTab === "dev-teams" && <Suspense fallback={<LazyLoader />}><DevTeamsView /></Suspense>}
      </TabsContent>
    </Tabs>
  );
}
