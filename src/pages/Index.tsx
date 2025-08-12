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
    <div className="min-h-screen bg-background">
      <header className="container mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Live Strategy Runner (Raydium)</h1>
            <p className="text-muted-foreground mt-2">Automate small periodic buys/sells and watch results in real time.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/bb" aria-label="Open Volume Simulator">
              <Button>Open Simulator</Button>
            </Link>
            <SecretsModal />
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 pb-12">
        <LiveRunner />
      </main>
    </div>
  );
};

export default Index;
