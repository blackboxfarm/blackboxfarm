import React, { useEffect, useState } from "react";
import { BaglessHoldersReport } from "@/components/BaglessHoldersReport";

export default function Holders() {
  const [tokenFromUrl, setTokenFromUrl] = useState<string>("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (tokenParam) {
      setTokenFromUrl(tokenParam);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full px-[5px] md:px-6 py-4 md:py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Token Holders Report</h1>
          <p className="text-muted-foreground">
            Analyze token holder distribution and wallet categories
          </p>
        </div>
        
        <div className="w-full">
          <BaglessHoldersReport initialToken={tokenFromUrl} />
        </div>
      </div>
    </div>
  );
}