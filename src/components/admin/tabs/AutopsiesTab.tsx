import React, { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Skull } from "lucide-react";

const AutopsyQueueBody = lazy(() => import("@/components/admin/autopsies/AutopsyQueueBody"));

const TabFallback = () => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const AutopsiesTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Skull className="h-6 w-6 text-destructive" /> Autopsies
        </h2>
        <p className="text-muted-foreground">
          Forensic post-mortems of dead Solana tokens. Funnel candidates, draft reports, approve, and publish.
        </p>
      </div>

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue">🧪 Queue</TabsTrigger>
          <TabsTrigger value="published" disabled>📰 Published (soon)</TabsTrigger>
          <TabsTrigger value="taxonomy" disabled>🧬 Taxonomy (soon)</TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <Suspense fallback={<TabFallback />}>
            <AutopsyQueueBody />
          </Suspense>
        </TabsContent>

        <TabsContent value="published">
          <Card className="p-8 text-center text-muted-foreground">
            Published autopsy management coming soon.
          </Card>
        </TabsContent>

        <TabsContent value="taxonomy">
          <Card className="p-8 text-center text-muted-foreground">
            Death-cause taxonomy editor coming soon.
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AutopsiesTab;