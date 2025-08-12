// Update this page (the content is just a fallback if you fail to update the page)

import React, { useEffect } from "react";
import VolumeSimulator from "@/components/VolumeSimulator";
import SecretsModal from "@/components/SecretsModal";
import LiveRunner from "@/components/LiveRunner";
import Base58Converter from "@/components/Base58Converter";

const Index = () => {
  useEffect(() => {
    document.title = "Solana Volume Bot Simulator | Runtime & Fee Estimator";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "Estimate Solana volume bot runtime, fees, and trade cycles with sliders for bankroll, trade size, interval, and fee presets."
      );
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="container mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Solana Volume Bot Simulator</h1>
            <p className="text-muted-foreground mt-2">Plan trades, fees, and duration before you touch the chain.</p>
          </div>
          <SecretsModal />
        </div>
      </header>
      <main className="container mx-auto px-4 pb-12">
        <Base58Converter />
        <VolumeSimulator />
        <LiveRunner />
      </main>
    </div>
  );
};

export default Index;
