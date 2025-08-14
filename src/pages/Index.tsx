// Update this page (the content is just a fallback if you fail to update the page)

import React, { useEffect } from "react";
import SecretsModal from "@/components/SecretsModal";
import LiveRunner from "@/components/LiveRunner";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Index = () => {
  useEffect(() => {
    const title = "Live Strategy Runner (Raydium) | Solana Auto Trades";
    document.title = title;

    const desc =
      "Run the Raydium Live Strategy Runner without reloads. Monitor real-time buys, sells, fees, and TX logs.";
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
    canonical.setAttribute("href", `${window.location.origin}/`);
  }, []);

  return (
    <div className="min-h-screen bg-tech-gradient relative overflow-hidden">
      {/* Tech background elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-10 left-10 code-text">model.fit(x_train, y_train)</div>
        <div className="absolute top-32 right-20 code-text">kafka.producer().send(record)</div>
        <div className="absolute bottom-40 left-20 code-text">window(Time.minutes(5))</div>
        <div className="absolute bottom-20 right-32 code-text">stream.filter(_.isActive)</div>
      </div>
      
      <header className="container mx-auto px-4 py-8 relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight bg-accent-gradient bg-clip-text text-transparent">
              Live Strategy Runner
            </h1>
            <p className="text-xl text-accent mt-2">Raydium</p>
            <p className="text-muted-foreground mt-4 max-w-2xl">
              Enterprise-grade automated trading infrastructure. Monitor real-time execution, 
              optimize entry points, and scale your DeFi operations with precision.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/bb" aria-label="Open Volume Simulator">
              <Button className="tech-button animate-pulse-glow">
                Launch Simulator
              </Button>
            </Link>
            <SecretsModal />
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 pb-12 space-y-8 relative z-10">
        <div className="tech-border p-6 glow-soft">
          <LiveRunner />
        </div>
      </main>
    </div>
  );
};

export default Index;
