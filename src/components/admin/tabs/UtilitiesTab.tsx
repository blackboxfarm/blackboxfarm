import React, { lazy, Suspense, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LazyLoader } from '@/components/ui/lazy-loader';
import { HealthModeToggles } from '@/components/admin/HealthModeToggles';
import { ServiceToggles } from '@/components/admin/ServiceToggles';

// Lazy load each utility component
const SpiderRouteMap = lazy(() => import("@/components/admin/SpiderRouteMap").then(m => ({ default: m.SpiderRouteMap })));
const HoldersResourceDashboard = lazy(() => import("@/components/admin/HoldersResourceDashboard").then(m => ({ default: m.HoldersResourceDashboard })));
const SolPriceAnalytics = lazy(() => import("@/components/admin/SolPriceAnalytics").then(m => ({ default: m.SolPriceAnalytics })));
const SniffDashboard = lazy(() => import("@/components/admin/SniffDashboard").then(m => ({ default: m.SniffDashboard })));
const HeliusUsageDashboard = lazy(() => import("@/pages/HeliusUsage"));
const ApiProviderManager = lazy(() => import("@/components/admin/ApiProviderManager").then(m => ({ default: m.ApiProviderManager })));
const LiquidityLockChecker = lazy(() => import("@/components/LiquidityLockChecker").then(m => ({ default: m.LiquidityLockChecker })));
const ApiResourceManager = lazy(() => import("@/components/admin/ApiResourceManager").then(m => ({ default: m.ApiResourceManager })));
const DatabaseHousekeeping = lazy(() => import("@/components/admin/DatabaseHousekeeping").then(m => ({ default: m.DatabaseHousekeeping })));
const HeliusUsageBreakdown = lazy(() => import("@/components/admin/HeliusUsageBreakdown").then(m => ({ default: m.HeliusUsageBreakdown })));
const SolscanUsageBreakdown = lazy(() => import("@/components/admin/SolscanUsageBreakdown").then(m => ({ default: m.SolscanUsageBreakdown })));
const ApifyUsageBreakdown = lazy(() => import("@/components/admin/ApifyUsageBreakdown").then(m => ({ default: m.ApifyUsageBreakdown })));

export default function UtilitiesTab() {
  const [activeSubTab, setActiveSubTab] = useState("api-resources");

  return (
    <div className="space-y-4">
      <ServiceToggles />
      <HealthModeToggles />
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
      <TabsList className="flex flex-wrap gap-1">
        <TabsTrigger value="api-resources">📊 API Resources</TabsTrigger>
        <TabsTrigger value="spider">🕷️ Spider</TabsTrigger>
        <TabsTrigger value="api-usage">📡 API Usage</TabsTrigger>
        <TabsTrigger value="sol-price">💰 SOL Price</TabsTrigger>
        <TabsTrigger value="sniff">🔍 SNIFF</TabsTrigger>
        <TabsTrigger value="helius">⚡ HELIUS</TabsTrigger>
        <TabsTrigger value="api-providers">🔌 API Providers</TabsTrigger>
        <TabsTrigger value="liquidity">💧 Liquidity Checker</TabsTrigger>
        <TabsTrigger value="housekeeping">🧹 Housekeeping</TabsTrigger>
        <TabsTrigger value="helius-breakdown">📊 Helius Usage</TabsTrigger>
        <TabsTrigger value="solscan-breakdown">🔎 Solscan Usage</TabsTrigger>
        <TabsTrigger value="apify-breakdown">🤖 Apify Usage</TabsTrigger>
      </TabsList>

      <TabsContent value="api-resources">
        {activeSubTab === "api-resources" && <Suspense fallback={<LazyLoader />}><ApiResourceManager /></Suspense>}
      </TabsContent>
      <TabsContent value="spider">
        {activeSubTab === "spider" && <Suspense fallback={<LazyLoader />}><SpiderRouteMap /></Suspense>}
      </TabsContent>
      <TabsContent value="api-usage">
        {activeSubTab === "api-usage" && <Suspense fallback={<LazyLoader />}><HoldersResourceDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="sol-price">
        {activeSubTab === "sol-price" && <Suspense fallback={<LazyLoader />}><SolPriceAnalytics /></Suspense>}
      </TabsContent>
      <TabsContent value="sniff">
        {activeSubTab === "sniff" && <Suspense fallback={<LazyLoader />}><SniffDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="helius">
        {activeSubTab === "helius" && <Suspense fallback={<LazyLoader />}><HeliusUsageDashboard /></Suspense>}
      </TabsContent>
      <TabsContent value="api-providers">
        {activeSubTab === "api-providers" && <Suspense fallback={<LazyLoader />}><ApiProviderManager /></Suspense>}
      </TabsContent>
      <TabsContent value="liquidity">
        {activeSubTab === "liquidity" && <Suspense fallback={<LazyLoader />}><LiquidityLockChecker /></Suspense>}
      </TabsContent>
      <TabsContent value="housekeeping">
        {activeSubTab === "housekeeping" && <Suspense fallback={<LazyLoader />}><DatabaseHousekeeping /></Suspense>}
      </TabsContent>
      <TabsContent value="helius-breakdown">
        {activeSubTab === "helius-breakdown" && <Suspense fallback={<LazyLoader />}><HeliusUsageBreakdown /></Suspense>}
      </TabsContent>
      <TabsContent value="solscan-breakdown">
        {activeSubTab === "solscan-breakdown" && <Suspense fallback={<LazyLoader />}><SolscanUsageBreakdown /></Suspense>}
      </TabsContent>
    </Tabs>
    </div>
  );
}
