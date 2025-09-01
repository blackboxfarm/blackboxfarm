import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useLocation } from "react-router-dom";
import { Bell, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface PageHeaderProps {
  showTabs?: boolean;
  activeTab?: string;
  onTabChange?: (value: string) => void;
}

export function PageHeader({ showTabs = false, activeTab, onTabChange }: PageHeaderProps) {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <div className="relative">
      {/* Farm Banner */}
      <div className="relative h-48 bg-background overflow-hidden">
        <img 
          src="/farm-banner.svg" 
          alt="BlackBox Farm Banner" 
          className="w-full h-full object-cover"
        />
        
        {/* Header Content */}
        <div className="absolute inset-0 flex flex-col justify-center items-center">
          <div className="flex items-center gap-3 mb-2">
            <img 
              src="/lovable-uploads/4caa07ef-479a-49fa-8f9f-c474607a99cd.png" 
              alt="BlackBox Farm Cube Logo" 
              className="w-12 h-12"
            />
            <h1 className="text-5xl font-bold text-cyan-400">
              BlackBox Farm
            </h1>
          </div>
          <p className="text-lg text-muted-foreground text-center">
            Putting the needle in the Haystack - Bumps for the whole Farm!
          </p>
        </div>

        {/* Top Right User Area */}
        <div className="absolute top-4 right-4 flex items-center gap-4">
          {/* Notification Icon */}
          <div className="relative">
            <Bell className="w-6 h-6 text-muted-foreground" />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-xs text-white font-bold">2</span>
            </div>
          </div>
          
          {/* User Info */}
          {user ? (
            <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2">
              <User className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-foreground">{user.email}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/auth" className="bg-background/80 backdrop-blur-sm text-foreground px-4 py-2 rounded-lg hover:bg-background/90 transition-colors">
                Sign In
              </Link>
              <Link to="/auth" className="bg-cyan-400 text-background px-4 py-2 rounded-lg hover:bg-cyan-500 transition-colors">
                Join BlackBox
              </Link>
            </div>
          )}
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