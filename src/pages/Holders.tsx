import React, { useEffect, useState } from "react";
import { BaglessHoldersReport } from "@/components/BaglessHoldersReport";
import { useHoldersPageTracking } from "@/hooks/useHoldersPageTracking";
import { TelegramWebViewBanner } from "@/components/TelegramWebViewBanner";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AnalysisOverview } from "@/components/holders/AnalysisOverview";
import { BadActorAlert } from "@/components/security/BadActorAlert";
import { CTOBadge } from "@/components/holders/CTOBadge";
import { NarrativeLinkCard } from "@/components/holders/NarrativeLinkCard";
import { OptimisticAISummary } from "@/components/holders/OptimisticAISummary";
import { isCuratedOptimistic } from "@/lib/curatedOptimisticTokens";

export default function Holders() {
  const [tokenFromUrl, setTokenFromUrl] = useState<string>("");
  const [versionParam, setVersionParam] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("report");
  const [activeMint, setActiveMint] = useState<string>("");

  const { trackReportGenerated } = useHoldersPageTracking({
    tokenPreloaded: tokenFromUrl,
    versionParam: versionParam,
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    const vParam = urlParams.get('v');
    if (tokenParam) setTokenFromUrl(tokenParam.trim());
    if (vParam) setVersionParam(vParam);
  }, []);

  const handleReportGenerated = (mint: string) => {
    if (mint && mint.trim()) setActiveMint(mint.trim());
    trackReportGenerated(mint);
  };

  const alertMint = activeMint || tokenFromUrl;
  const curated = isCuratedOptimistic(alertMint);

  return (
    <SiteLayout>
      <TelegramWebViewBanner />

      <div className="mx-auto py-6 space-y-4 px-2 md:px-4 max-w-6xl" data-oracle-hint="Paste a token address — I'll walk you through the results" data-oracle-zone="holders-input">
        {alertMint && !curated && (
          <BadActorAlert tokenMint={alertMint} />
        )}
        {alertMint && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CTOBadge tokenMint={alertMint} />
            </div>
            <OptimisticAISummary tokenMint={alertMint} />
            <NarrativeLinkCard tokenMint={alertMint} />
          </div>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="report">Token Holders Report</TabsTrigger>
            <TabsTrigger value="overview" data-oracle-hint="The AI panel gives you a narrative summary — try it" data-oracle-zone="holders-ai-tab">Analysis Overview</TabsTrigger>
          </TabsList>

          <TabsContent value="report" className="mt-0">
            <div className="w-full">
              <BaglessHoldersReport initialToken={tokenFromUrl} onReportGenerated={handleReportGenerated} />
            </div>
          </TabsContent>

          <TabsContent value="overview" className="mt-0">
            <AnalysisOverview />
          </TabsContent>
        </Tabs>
      </div>
    </SiteLayout>
  );
}
