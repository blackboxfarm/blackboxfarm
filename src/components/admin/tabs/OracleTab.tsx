import React, { lazy, Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LazyLoader } from "@/components/ui/lazy-loader";
import OracleIntelLookup from "@/components/admin/oracle/OracleIntelLookup";
import OracleClassificationsFeed from "@/components/admin/oracle/OracleClassificationsFeed";
import OracleBackfillStatus from "@/components/admin/oracle/OracleBackfillStatus";
import OracleMeshViewer from "@/components/admin/oracle/OracleMeshViewer";

const ProviderHealthPanel = lazy(() => import("@/components/admin/oracle/ProviderHealthPanel"));

const DevIntelReport = lazy(() => import("@/components/admin/oracle/DevIntelReport"));
const OracleMasterSpider = lazy(() => import("@/components/admin/oracle/OracleMasterSpider"));

const MeshPipelineDashboard = lazy(() => import("@/components/admin/MeshPipelineDashboard").then(m => ({ default: m.MeshPipelineDashboard })));
const XCommunityManager = lazy(() => import("@/components/admin/oracle/XCommunityManager"));
const MeshGraphVisualizer = lazy(() => import("@/components/admin/oracle/MeshGraphVisualizer"));
const TeamIntelDashboard = lazy(() => import("@/components/admin/oracle/TeamIntelDashboard"));
const PumpfunBlacklist = lazy(() => import("@/components/admin/PumpfunBlacklist").then(m => ({ default: m.PumpfunBlacklist })));
const PumpfunWhitelist = lazy(() => import("@/components/admin/PumpfunWhitelist").then(m => ({ default: m.PumpfunWhitelist })));

interface OracleTabProps {
  initialSubTab?: string;
  initialWallet?: string;
}

const OracleTab = ({ initialSubTab, initialWallet }: OracleTabProps) => {
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab || "spider");

  return (
    <div className="space-y-6">
      <Card className="border-violet-500/20 bg-gradient-to-br from-violet-950/20 to-purple-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            🔮 Oracle - Developer Reputation Engine
          </CardTitle>
          <CardDescription>
            Unified developer intelligence system. Enter any token, wallet, or @X handle to get instant reputation data.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="spider" className="data-[state=active]:bg-violet-500/20">
            🕷️ Master Spider
          </TabsTrigger>
          <TabsTrigger value="lookup" className="data-[state=active]:bg-primary/20">
            🔍 Intel Lookup
          </TabsTrigger>
          <TabsTrigger value="communities" className="data-[state=active]:bg-primary/20">
            🏠 X Communities
          </TabsTrigger>
          <TabsTrigger value="team-intel" className="data-[state=active]:bg-primary/20">
            🔗 Team Intel
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="data-[state=active]:bg-primary/20">
            🕸️ Mesh Pipeline
          </TabsTrigger>
          <TabsTrigger value="classifications" className="data-[state=active]:bg-primary/20">
            📊 Auto-Classifications
          </TabsTrigger>
          <TabsTrigger value="backfill" className="data-[state=active]:bg-primary/20">
            📅 Historical Backfill
          </TabsTrigger>
          <TabsTrigger value="mesh" className="data-[state=active]:bg-primary/20">
            🗺️ Mesh Viewer
          </TabsTrigger>
          <TabsTrigger value="bubble-map" className="data-[state=active]:bg-cyan-500/20">
            🫧 Bubble Map
          </TabsTrigger>
          <TabsTrigger value="dev-intel" className="data-[state=active]:bg-primary/20">
            🌳 Dev Intel Report
          </TabsTrigger>
          <TabsTrigger value="blacklist" className="data-[state=active]:bg-destructive/20">
            🚫 Blacklist Mesh
          </TabsTrigger>
          <TabsTrigger value="whitelist" className="data-[state=active]:bg-green-500/20">
            ✅ Whitelist Mesh
          </TabsTrigger>
        </TabsList>

        <TabsContent value="spider" className="space-y-4">
          <Suspense fallback={<LazyLoader />}>
            <OracleMasterSpider />
          </Suspense>
        </TabsContent>

        <TabsContent value="lookup" className="space-y-4">
          <OracleIntelLookup initialQuery={initialWallet} />
        </TabsContent>

        <TabsContent value="communities" className="space-y-4">
          <Suspense fallback={<LazyLoader />}>
            <XCommunityManager />
          </Suspense>
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <Suspense fallback={<LazyLoader />}>
            <MeshPipelineDashboard />
          </Suspense>
        </TabsContent>

        <TabsContent value="team-intel" className="space-y-4">
          <Suspense fallback={<LazyLoader />}>
            <TeamIntelDashboard />
          </Suspense>
        </TabsContent>

        <TabsContent value="classifications" className="space-y-4">
          <OracleClassificationsFeed />
        </TabsContent>

        <TabsContent value="backfill" className="space-y-4">
          <OracleBackfillStatus />
        </TabsContent>

        <TabsContent value="bubble-map" className="space-y-4">
          <Suspense fallback={<LazyLoader />}>
            <MeshGraphVisualizer />
          </Suspense>
        </TabsContent>

        <TabsContent value="mesh" className="space-y-4">
          <OracleMeshViewer />
        </TabsContent>

        <TabsContent value="dev-intel" className="space-y-4">
          <Suspense fallback={<LazyLoader />}>
            <DevIntelReport />
          </Suspense>
        </TabsContent>

        <TabsContent value="blacklist" className="space-y-4">
          <Suspense fallback={<LazyLoader />}>
            <PumpfunBlacklist />
          </Suspense>
        </TabsContent>

        <TabsContent value="whitelist" className="space-y-4">
          <Suspense fallback={<LazyLoader />}>
            <PumpfunWhitelist />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OracleTab;
