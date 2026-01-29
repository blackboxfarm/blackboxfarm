import React, { lazy, Suspense, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LazyLoader } from '@/components/ui/lazy-loader';

// Lazy load each component
const BaglessHoldersReport = lazy(() => import("@/components/BaglessHoldersReport").then(m => ({ default: m.BaglessHoldersReport })));
const AccountManagementDashboard = lazy(() => import("@/components/admin/AccountManagementDashboard").then(m => ({ default: m.AccountManagementDashboard })));
const ShareCardDemo = lazy(() => import("@/components/social/ShareCardDemo").then(m => ({ default: m.ShareCardDemo })));
const TwitterScrapesView = lazy(() => import("@/components/admin/TwitterScrapesView").then(m => ({ default: m.TwitterScrapesView })));
const AIAnalyzer = lazy(() => import("@/pages/AIAnalysis"));
const BannerManagement = lazy(() => import("@/components/admin/BannerManagement").then(m => ({ default: m.BannerManagement })));
const AdvertiserManagement = lazy(() => import("@/components/admin/AdvertiserManagement"));
const HoldersVisitorsDashboard = lazy(() => import("@/components/admin/HoldersVisitorsDashboard").then(m => ({ default: m.HoldersVisitorsDashboard })));
const HistoricalTokenDataDashboard = lazy(() => import("@/components/admin/HistoricalTokenDataDashboard").then(m => ({ default: m.HistoricalTokenDataDashboard })));
const TokenSearchAnalytics = lazy(() => import("@/components/admin/TokenSearchAnalytics").then(m => ({ default: m.TokenSearchAnalytics })));
const TokenHistoryViewer = lazy(() => import("@/components/admin/TokenHistoryViewer").then(m => ({ default: m.TokenHistoryViewer })));
const DailiesDashboard = lazy(() => import("@/components/admin/DailiesDashboard").then(m => ({ default: m.DailiesDashboard })));

export default function HoldersIntelTab() {
  const [activeSubTab, setActiveSubTab] = useState("visitors");

  return (
    <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
      <TabsList className="flex flex-wrap gap-1">
        <TabsTrigger value="token-holders">📊 Token Holders</TabsTrigger>
        <TabsTrigger value="accounts">👥 Accounts</TabsTrigger>
        <TabsTrigger value="intel-xbot">🤖 Intel XBot</TabsTrigger>
        <TabsTrigger value="twitter-scrapes">🐦 Twitter Scrapes</TabsTrigger>
        <TabsTrigger value="ai-analyzer">🧠 AI Analyzer</TabsTrigger>
        <TabsTrigger value="banners">🎨 Banners</TabsTrigger>
        <TabsTrigger value="advertisers">📢 Advertisers</TabsTrigger>
        <TabsTrigger value="visitors">👁️ Visitors</TabsTrigger>
        <TabsTrigger value="token-history">💎 Token History</TabsTrigger>
        <TabsTrigger value="search-analytics">🔍 Search Analytics</TabsTrigger>
        <TabsTrigger value="token-viewer">📈 Token Viewer</TabsTrigger>
        <TabsTrigger value="dailies">📅 Dailies</TabsTrigger>
      </TabsList>

      <TabsContent value="token-holders">
        {activeSubTab === "token-holders" && <Suspense fallback={<LazyLoader />}><BaglessHoldersReport /></Suspense>}
      </TabsContent>
      <TabsContent value="accounts">
        {activeSubTab === "accounts" && <Suspense fallback={<LazyLoader />}><AccountManagementDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="intel-xbot">
        {activeSubTab === "intel-xbot" && <Suspense fallback={<LazyLoader />}><ShareCardDemo /></Suspense>}
      </TabsContent>
      <TabsContent value="twitter-scrapes">
        {activeSubTab === "twitter-scrapes" && <Suspense fallback={<LazyLoader />}><TwitterScrapesView /></Suspense>}
      </TabsContent>
      <TabsContent value="ai-analyzer">
        {activeSubTab === "ai-analyzer" && <Suspense fallback={<LazyLoader />}><AIAnalyzer /></Suspense>}
      </TabsContent>
      <TabsContent value="banners">
        {activeSubTab === "banners" && <Suspense fallback={<LazyLoader />}><BannerManagement /></Suspense>}
      </TabsContent>
      <TabsContent value="advertisers">
        {activeSubTab === "advertisers" && <Suspense fallback={<LazyLoader />}><AdvertiserManagement /></Suspense>}
      </TabsContent>
      <TabsContent value="visitors">
        {activeSubTab === "visitors" && <Suspense fallback={<LazyLoader />}><HoldersVisitorsDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="token-history">
        {activeSubTab === "token-history" && <Suspense fallback={<LazyLoader />}><HistoricalTokenDataDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="search-analytics">
        {activeSubTab === "search-analytics" && <Suspense fallback={<LazyLoader />}><TokenSearchAnalytics /></Suspense>}
      </TabsContent>
      <TabsContent value="token-viewer">
        {activeSubTab === "token-viewer" && <Suspense fallback={<LazyLoader />}><TokenHistoryViewer /></Suspense>}
      </TabsContent>
      <TabsContent value="dailies">
        {activeSubTab === "dailies" && <Suspense fallback={<LazyLoader />}><DailiesDashboard /></Suspense>}
      </TabsContent>
    </Tabs>
  );
}
