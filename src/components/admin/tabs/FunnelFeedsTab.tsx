import React, { lazy, Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LazyLoader } from "@/components/ui/lazy-loader";

const FunnelFeedSources = lazy(() => import("../funnel-feeds/FunnelFeedSources").then(m => ({ default: m.FunnelFeedSources })));
const FunnelFeedDiscoveries = lazy(() => import("../funnel-feeds/FunnelFeedDiscoveries").then(m => ({ default: m.FunnelFeedDiscoveries })));
const DexCloudFlareFeed = lazy(() => import("../funnel-feeds/DexCloudFlareFeed").then(m => ({ default: m.DexCloudFlareFeed })));
const BubblesFeed = lazy(() => import("../funnel-feeds/BubblesFeed").then(m => ({ default: m.BubblesFeed })));
const BotDmFeed = lazy(() => import("../funnel-feeds/BotDmFeed").then(m => ({ default: m.BotDmFeed })));
const HoldersInputFeed = lazy(() => import("../funnel-feeds/HoldersInputFeed").then(m => ({ default: m.HoldersInputFeed })));
const FunnelOverview = lazy(() => import("../funnel-feeds/FunnelOverview").then(m => ({ default: m.FunnelOverview })));

export default function FunnelFeedsTab() {
  const [subTab, setSubTab] = useState("telegram");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Funnel Feeds</h2>
        <p className="text-muted-foreground text-sm">
          Token discovery sources → pipeline tracking across all intake channels
        </p>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="telegram">📡 Telegram</TabsTrigger>
          <TabsTrigger value="dex">☁️ Dex/CloudFlare</TabsTrigger>
          <TabsTrigger value="bubbles">🫧 Bubbles</TabsTrigger>
          <TabsTrigger value="bot-dm">🤖 Bot DM</TabsTrigger>
          <TabsTrigger value="overview">📊 Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="telegram">
          {subTab === "telegram" && (
            <Suspense fallback={<LazyLoader />}>
              <div className="space-y-6">
                <FunnelFeedSources />
                <FunnelFeedDiscoveries />
              </div>
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="dex">
          {subTab === "dex" && (
            <Suspense fallback={<LazyLoader />}>
              <DexCloudFlareFeed />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="bubbles">
          {subTab === "bubbles" && (
            <Suspense fallback={<LazyLoader />}>
              <BubblesFeed />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="bot-dm">
          {subTab === "bot-dm" && (
            <Suspense fallback={<LazyLoader />}>
              <BotDmFeed />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="overview">
          {subTab === "overview" && (
            <Suspense fallback={<LazyLoader />}>
              <FunnelOverview />
            </Suspense>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
