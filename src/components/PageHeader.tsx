import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useLocation } from "react-router-dom";

interface PageHeaderProps {
  showTabs?: boolean;
  activeTab?: string;
  onTabChange?: (value: string) => void;
}

export function PageHeader({ showTabs = false, activeTab, onTabChange }: PageHeaderProps) {
  const location = useLocation();

  return (
    <div className="tech-border p-6 mb-6">
      <div className="flex items-center justify-center gap-3 mb-2">
        <img 
          src="/lovable-uploads/f662a3d2-f3b3-468c-bebc-bae858294fc5.png" 
          alt="BlackBox Farm Logo" 
          className="w-10 h-10"
        />
        <h1 className="text-4xl font-bold text-center accent-gradient bg-clip-text text-transparent">
          BlackBox Farm
        </h1>
      </div>
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

      {showTabs && (
        <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-6 tech-border">
            <TabsTrigger value="calculator" className="text-xs">
              🧮 Calculator
            </TabsTrigger>
            <TabsTrigger value="volume-sim" className="text-xs">
              📊 Volume Sim
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="text-xs">
              🚀 Campaigns
            </TabsTrigger>
            <TabsTrigger value="wallets" className="text-xs">
              💰 Wallets
            </TabsTrigger>
            <TabsTrigger value="referrals" className="text-xs">
              👥 Referrals
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs">
              📊 Analytics
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Feature Highlight - only show on main page */}
      {location.pathname === "/" && (
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
              <Link to="/blackbox" className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
                Launch BlackBox →
              </Link>
              <Link to="/competitive-analysis" className="px-4 py-2 border border-primary text-primary rounded-md hover:bg-primary/10 transition-colors">
                View Analysis
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}