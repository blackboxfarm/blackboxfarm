import React, { lazy, Suspense, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LazyLoader } from '@/components/ui/lazy-loader';

// Lazy load each component
const TokenCandidatesDashboard = lazy(() => import("@/components/admin/TokenCandidatesDashboard").then(m => ({ default: m.TokenCandidatesDashboard })));
const PumpfunTokenRetrace = lazy(() => import("@/components/admin/PumpfunTokenRetrace"));

export default function PumpfunMonitorTab() {
  const [activeSubTab, setActiveSubTab] = useState("candidates");

  return (
    <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="candidates">📊 Candidates</TabsTrigger>
        <TabsTrigger value="retrace">🔍 Retrace</TabsTrigger>
      </TabsList>

      <TabsContent value="candidates">
        {activeSubTab === "candidates" && <Suspense fallback={<LazyLoader />}><TokenCandidatesDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="retrace">
        {activeSubTab === "retrace" && <Suspense fallback={<LazyLoader />}><PumpfunTokenRetrace /></Suspense>}
      </TabsContent>
    </Tabs>
  );
}
