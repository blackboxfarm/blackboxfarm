import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import OracleIntelLookup from "@/components/admin/oracle/OracleIntelLookup";
import OracleClassificationsFeed from "@/components/admin/oracle/OracleClassificationsFeed";
import OracleBackfillStatus from "@/components/admin/oracle/OracleBackfillStatus";
import OracleMeshViewer from "@/components/admin/oracle/OracleMeshViewer";

const OracleTab = () => {
  const [activeSubTab, setActiveSubTab] = useState("lookup");

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
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="lookup" className="data-[state=active]:bg-violet-500/20">
            🔍 Intel Lookup
          </TabsTrigger>
          <TabsTrigger value="classifications" className="data-[state=active]:bg-violet-500/20">
            📊 Auto-Classifications
          </TabsTrigger>
          <TabsTrigger value="backfill" className="data-[state=active]:bg-violet-500/20">
            📅 Historical Backfill
          </TabsTrigger>
          <TabsTrigger value="mesh" className="data-[state=active]:bg-violet-500/20">
            🕸️ Reputation Mesh
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lookup" className="space-y-4">
          <OracleIntelLookup />
        </TabsContent>

        <TabsContent value="classifications" className="space-y-4">
          <OracleClassificationsFeed />
        </TabsContent>

        <TabsContent value="backfill" className="space-y-4">
          <OracleBackfillStatus />
        </TabsContent>

        <TabsContent value="mesh" className="space-y-4">
          <OracleMeshViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OracleTab;
