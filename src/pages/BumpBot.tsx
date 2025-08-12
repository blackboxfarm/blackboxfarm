import React, { useEffect } from "react";
import VolumeSimulator from "@/components/VolumeSimulator";

import SecretsModal from "@/components/SecretsModal";

const BumpBot = () => {
  useEffect(() => {
    document.title = "Bump Bot | Solana Volume Simulator & Fee Planner";
    const desc =
      "Plan your Solana bump bot: estimate runtime, fees, and trade cycles with adjustable bankroll, trade size, interval, and fee presets.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", `${window.location.origin}/bb`);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="container mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bump Bot — Solana Volume Simulator</h1>
            <p className="text-muted-foreground mt-2">Find a balanced period, price, and frequency before running anything on-chain.</p>
          </div>
          <SecretsModal />
        </div>
      </header>
      <main className="container mx-auto px-4 pb-12">
        <section className="mb-10">
          <VolumeSimulator />
        </section>
      </main>
    </div>
  );
};

export default BumpBot;
