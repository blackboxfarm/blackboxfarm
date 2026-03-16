import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FunnelFeedSources } from "../funnel-feeds/FunnelFeedSources";
import { FunnelFeedDiscoveries } from "../funnel-feeds/FunnelFeedDiscoveries";

export default function FunnelFeedsTab() {
  const [subTab, setSubTab] = useState("sources");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Funnel Feeds</h2>
        <p className="text-muted-foreground text-sm">
          Scrape Telegram channels/groups for token addresses → push into Mesh, Watchlist & X pipeline
        </p>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="sources">📡 Feed Sources</TabsTrigger>
          <TabsTrigger value="discoveries">🔍 Discoveries</TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <FunnelFeedSources />
        </TabsContent>

        <TabsContent value="discoveries">
          <FunnelFeedDiscoveries />
        </TabsContent>
      </Tabs>
    </div>
  );
}
