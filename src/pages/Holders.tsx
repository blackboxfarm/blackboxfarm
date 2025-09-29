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
    <div className="min-h-screen bg-background md:bg-background bg-slate-900">
      <div className="w-full px-[5px] md:px-6 py-4 md:py-8">
        <div className="mb-8">
          <p className="text-muted-foreground font-extrabold text-lg">
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