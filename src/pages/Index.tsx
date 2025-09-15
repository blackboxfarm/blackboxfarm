import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LiveRunner from "@/components/LiveRunner";
import ServerSideTradingControl from "@/components/ServerSideTradingControl";
import VolumeSimulator from "@/components/VolumeSimulator";
import WalletPoolManager from "@/components/WalletPoolManager";
import { AgenticBrowser } from "@/components/AgenticBrowser";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { DashboardStatsWidget } from "@/components/DashboardStatsWidget";
import { RealTimeTrading } from "@/components/trading/RealTimeTrading";
import { WalletBalanceMonitor } from "@/components/WalletBalanceMonitor";
import { WalletInvestigator } from "@/components/WalletInvestigator";
import { WalletMonitor } from "@/components/WalletMonitor";

import SecretsModal from "@/components/SecretsModal";
import { PasswordLogin } from "@/components/PasswordLogin";
import { usePasswordAuth } from "@/hooks/usePasswordAuth";

// Matrix background code snippet
const matrixCode = `import { supabase } from '@/integrations/supabase/client';

const TradingBot = {
  async executeTrade(signal) {
    const { data } = await supabase.functions.invoke('trading-monitor');
    return data.success;
  },
  
  watchPrices: () => setInterval(() => checkMarket(), 3000),
  
  emergencyStop: (price) => price <= stopLoss && sellAll()
};

// Server runs 24/7 • No browser required
export default TradingBot;`;

export default function Index() {
  const { isAuthenticated, isLoading } = usePasswordAuth();
  const [activeTab, setActiveTab] = useState("investigator");

  useEffect(() => {
    // Check for tab parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }

    const title = "24/7 Server-Side Trading Bot | Solana Auto Trades";
    document.title = title;

    const desc = "Autonomous Solana trading bot running 24/7 on Supabase servers. No browser required - trades even when your computer is off.";
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PasswordLogin onAuthenticate={async () => true} />;
  }

  return (
    <div className="min-h-screen tech-gradient relative overflow-hidden">
      {/* Matrix background */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-10 left-10 max-w-lg">
          <pre className="text-accent text-xs font-mono leading-relaxed">
            {matrixCode}
          </pre>
        </div>
        <div className="absolute bottom-10 right-10 max-w-lg">
          <pre className="text-primary text-xs font-mono leading-relaxed">
            {`function autonomousTrading() {
  while (serverRunning) {
    const market = await scanTokens();
    const decision = analyzeVolatility(market);
    
    if (decision.action === 'BUY') {
      await executeTrade(decision);
      await logActivity('Trade executed');
    }
    
    await checkEmergencySells();
    await sleep(intervalSec * 1000);
  }
}`}
          </pre>
        </div>
      </div>

      <div className="container mx-auto p-4 space-y-6 relative z-10">
        {/* Header */}
        <div className="tech-border p-6 mb-6">
          <h1 className="text-4xl font-bold text-center mb-2 accent-gradient bg-clip-text text-transparent">
            System Reset AI Evolution
          </h1>
          <p className="text-center text-muted-foreground mb-4">
            24/7 Autonomous Trading Intelligence Platform
          </p>
          
          <div className="flex justify-center items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-sm code-text">SERVER: ACTIVE</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
              <span className="text-sm code-text">CRON: RUNNING</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
              <span className="text-sm code-text">TRADING: READY</span>
            </div>
          </div>

          <div className="flex justify-center items-center gap-4 mb-4">
            <SecretsModal />
            <Button 
              onClick={() => window.location.href = "/super-admin"}
              variant="outline"
              size="sm"
              className="border-yellow-400 text-yellow-600 hover:bg-yellow-50"
            >
              🛡️ Super Admin
            </Button>
          </div>

          {/* Updated Feature Highlight */}
          <div className="tech-border p-4 mt-4 bg-gradient-to-r from-primary/10 to-accent/10">
            <div className="text-center">
              <Badge className="mb-2 bg-gradient-to-r from-primary to-accent text-primary-foreground">
                🚀 NEW: Smart Fee Structure
              </Badge>
              <p className="text-sm text-muted-foreground mb-2">
                Batch pricing for volume operations • 90%+ cheaper than competitors
              </p>
              <div className="flex justify-center gap-2 text-xs mb-3">
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded">Smithii Model: 0.025 SOL/100 ops</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">Micro-trades: 0.0005 SOL</span>
              </div>
              <div className="flex justify-center gap-2">
                <a href="/blackbox" className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
                  Launch BlackBox →
                </a>
                <a href="/competitive-analysis" className="px-4 py-2 border border-primary text-primary rounded-md hover:bg-primary/10 transition-colors">
                  View Analysis
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Stats Widget */}
        <DashboardStatsWidget />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-9 tech-border">
            <TabsTrigger value="server-control" className="text-xs">
              🤖 Server Control
            </TabsTrigger>
            <TabsTrigger value="live-trading" className="text-xs">
              ⚡ Live Trading
            </TabsTrigger>
            <TabsTrigger value="live-runner" className="text-xs">
              🖥️ Browser Mode
            </TabsTrigger>
            <TabsTrigger value="volume-sim" className="text-xs">
              📊 Volume Sim
            </TabsTrigger>
            <TabsTrigger value="wallet-pool" className="text-xs">
              💰 Wallet Pool
            </TabsTrigger>
            <TabsTrigger value="agentic-browser" className="text-xs">
              🌐 Web Agent
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs">
              📊 Analytics
            </TabsTrigger>
            <TabsTrigger value="investigator" className="text-xs">
              🔍 Investigator
            </TabsTrigger>
            <TabsTrigger value="wallet-monitor" className="text-xs">
              👁️ Wallet Monitor
            </TabsTrigger>
          </TabsList>

          <TabsContent value="server-control">
            <ServerSideTradingControl />
          </TabsContent>

          <TabsContent value="live-trading">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RealTimeTrading />
              <WalletBalanceMonitor />
            </div>
          </TabsContent>

          <TabsContent value="live-runner">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  🖥️ Browser-Based Trading
                  <Badge variant="outline">Live + Fantasy Mode</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Browser-based trading with Fantasy Mode toggle (use Fantasy Mode to practice with $300 virtual funds)
                </p>
              </CardHeader>
              <CardContent>
                <LiveRunner />
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="volume-sim">
            <VolumeSimulator />
          </TabsContent>

          <TabsContent value="wallet-pool">
            <WalletPoolManager />
          </TabsContent>

          <TabsContent value="agentic-browser">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  🌐 Agentic Web Browser
                  <Badge variant="outline">Automation</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Automate web interactions - click buttons, fill forms, take screenshots on any website
                </p>
              </CardHeader>
              <CardContent>
                <AgenticBrowser />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <AnalyticsDashboard />
          </TabsContent>

          <TabsContent value="investigator">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  🔍 Blockchain Investigator
                  <Badge variant="destructive">Bagless Token Analysis</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Investigate wallet transactions and track token sales using Helius APIs
                </p>
              </CardHeader>
              <CardContent>
                <WalletInvestigator />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wallet-monitor">
            <WalletMonitor />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}