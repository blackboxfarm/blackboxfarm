import React, { useEffect, useState } from "react";
import { BaglessHoldersReport } from "@/components/BaglessHoldersReport";
import { useHoldersPageTracking } from "@/hooks/useHoldersPageTracking";
import { TelegramWebViewBanner } from "@/components/TelegramWebViewBanner";
import { SiteLayout } from "@/components/layout/SiteLayout";
import holdersHero from "@/assets/holders-hero.png";

export default function Holders() {
  const [tokenFromUrl, setTokenFromUrl] = useState<string>("");
  const [versionParam, setVersionParam] = useState<string>("");

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

  return (
    <SiteLayout>
      {/* Telegram WebView Banner */}
      <TelegramWebViewBanner />

      {/* Holders Hero */}
      <div className="w-full">
        <img 
          src={holdersHero} 
          alt="Holders Intel - Crypto has hands, HOLDER$ shows them" 
          className="w-full h-auto max-h-48 object-cover object-center"
        />
      </div>

      {/* Main Content */}
      <div className="mx-auto py-6 space-y-4 px-2 md:px-4 max-w-6xl">
        <div className="w-full">
          <BaglessHoldersReport initialToken={tokenFromUrl} onReportGenerated={trackReportGenerated} />
        </div>
      </div>
    </SiteLayout>
  );
}
