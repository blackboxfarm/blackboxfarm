import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';
import { usePreviewSuperAdmin } from '@/hooks/usePreviewSuperAdmin';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Shield, Users, Calculator, BarChart3, Coins, Activity, Settings, Database, Search, Eye, Zap, List } from 'lucide-react';

// Import components for different tabs
import ServerSideTradingControl from '@/components/ServerSideTradingControl';
import { RealTimeTrading } from '@/components/trading/RealTimeTrading';
import { WalletBalanceMonitor } from '@/components/WalletBalanceMonitor';
import LiveRunner from '@/components/LiveRunner';
import VolumeSimulator from '@/components/VolumeSimulator';
import WalletPoolManager from '@/components/WalletPoolManager';
import { AgenticBrowser } from '@/components/AgenticBrowser';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';
import { WalletInvestigator } from '@/components/WalletInvestigator';
import { WalletMonitor } from '@/components/WalletMonitor';
import { AuthButton } from '@/components/auth/AuthButton';
import SecretsModal from '@/components/SecretsModal';
import { BaglessHoldersReport } from '@/components/BaglessHoldersReport';

interface TabConfig {
  id: string;
  label: string;
  icon: React.ElementType;
  component: React.ComponentType;
  requiredRoles?: string[];
  requiresAuth?: boolean;
  isPublic?: boolean;
}

const tabConfigs: TabConfig[] = [
  // Public tabs (no auth required)
  {
    id: 'overview',
    label: 'Overview',
    icon: BarChart3,
    component: () => (
      <div className="space-y-6">
        <div className="tech-border p-6">
          <h2 className="text-2xl font-bold mb-4">BlackBox Farm - Autonomous Trading Platform</h2>
          <p className="text-muted-foreground mb-4">
            Advanced AI-powered trading system with 24/7 autonomous operation, real-time market analysis, and intelligent risk management.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="tech-border p-4">
              <h3 className="font-semibold mb-2">🤖 Autonomous Trading</h3>
              <p className="text-sm text-muted-foreground">AI-driven trading strategies that operate continuously without human intervention.</p>
            </div>
            <div className="tech-border p-4">
              <h3 className="font-semibold mb-2">📊 Real-Time Analytics</h3>
              <p className="text-sm text-muted-foreground">Live market data analysis with advanced volatility scoring and trend detection.</p>
            </div>
            <div className="tech-border p-4">
              <h3 className="font-semibold mb-2">🛡️ Risk Management</h3>
              <p className="text-sm text-muted-foreground">Intelligent stop-loss mechanisms and emergency sell protocols for capital protection.</p>
            </div>
            <div className="tech-border p-4">
              <h3 className="font-semibold mb-2">⚡ High Performance</h3>
              <p className="text-sm text-muted-foreground">Optimized for speed with sub-second execution times and minimal latency.</p>
            </div>
          </div>
        </div>
      </div>
    ),
    isPublic: true
  },
  {
    id: 'community',
    label: 'Community',
    icon: Users,
    component: () => (
      <div className="space-y-6">
        <div className="tech-border p-6">
          <h2 className="text-2xl font-bold mb-4">Community Campaigns</h2>
          <p className="text-muted-foreground mb-4">
            Join community-funded trading campaigns. Pool resources with other traders to access advanced strategies and shared profits.
          </p>
          <Button onClick={() => window.location.href = "/community-wallet"} className="mr-4">
            View Community Campaigns
          </Button>
          <Button onClick={() => window.location.href = "/auth"} variant="outline">
            Join Community
          </Button>
        </div>
      </div>
    ),
    isPublic: true
  },
  // Calculator tab - Hidden
  // {
  //   id: 'calculator',
  //   label: 'Calculator',
  //   icon: Calculator,
  //   component: () => (
  //     <div className="space-y-6">
  //       <div className="tech-border p-6">
  //         <h2 className="text-2xl font-bold mb-4">Trading Calculator</h2>
  //         <p className="text-muted-foreground mb-4">
  //           Calculate potential returns, fees, and risks for your trading strategies.
  //         </p>
  //         <div className="grid md:grid-cols-2 gap-4">
  //           <div className="tech-border p-4">
  //             <h3 className="font-semibold mb-2">💰 Profit Calculator</h3>
  //             <p className="text-sm text-muted-foreground">Estimate potential profits based on investment amount and strategy parameters.</p>
  //           </div>
  //           <div className="tech-border p-4">
  //             <h3 className="font-semibold mb-2">📈 Fee Estimator</h3>
  //             <p className="text-sm text-muted-foreground">Calculate transaction fees, gas costs, and service charges.</p>
  //           </div>
  //         </div>
  //       </div>
  //     </div>
  //   ),
  //   isPublic: true
  // },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    component: AnalyticsDashboard,
    isPublic: true
  },
  {
    id: 'holders',
    label: 'Holders',
    icon: List,
    component: () => (
      <div className="space-y-6">
        <BaglessHoldersReport />
      </div>
    ),
    isPublic: true
  },

  // Contributor level (basic auth required)
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Activity,
    component: () => (
      <div className="space-y-6">
        <WalletBalanceMonitor />
        <RealTimeTrading />
      </div>
    ),
    requiresAuth: true
  },

  // Manager level (campaign management)
  {
    id: 'trading',
    label: 'Trading Control',
    icon: Zap,
    component: ServerSideTradingControl,
    requiredRoles: ['admin', 'super_admin'],
    requiresAuth: true
  },
  {
    id: 'browser',
    label: 'Browser Mode',
    icon: Search,
    component: LiveRunner,
    requiredRoles: ['admin', 'super_admin'],
    requiresAuth: true
  },
  {
    id: 'volume',
    label: 'Volume Simulator',
    icon: BarChart3,
    component: VolumeSimulator,
    requiredRoles: ['admin', 'super_admin'],
    requiresAuth: true
  },
  {
    id: 'wallets',
    label: 'Wallet Manager',
    icon: Database,
    component: WalletPoolManager,
    requiredRoles: ['admin', 'super_admin'],
    requiresAuth: true
  },
  {
    id: 'agent',
    label: 'Web Agent',
    icon: Shield,
    component: AgenticBrowser,
    requiredRoles: ['admin', 'super_admin'],
    requiresAuth: true
  },
  {
    id: 'investigator',
    label: 'Blockchain Investigator',
    icon: Eye,
    component: WalletInvestigator,
    requiredRoles: ['super_admin'],
    requiresAuth: true
  },
  {
    id: 'monitor',
    label: 'Monitor',
    icon: Activity,
    component: WalletMonitor,
    requiredRoles: ['super_admin'],
    requiresAuth: true
  }
];

export const RoleBasedNavigation: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { roles, isSuperAdmin, isLoading } = useUserRoles();
  const isPreviewAdmin = usePreviewSuperAdmin();
  const [activeTab, setActiveTab] = useState('overview');

  // In preview mode, always show super admin view
  const effectiveRoles = isPreviewAdmin ? ['super_admin'] : roles;
  const effectiveIsSuperAdmin = isPreviewAdmin || isSuperAdmin;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, []);

  const getVisibleTabs = () => {
    return tabConfigs.filter(tab => {
      // Public tabs are always visible
      if (tab.isPublic) return true;
      
      // If tab requires auth and user is not authenticated, hide it
      if (tab.requiresAuth && !isAuthenticated && !isPreviewAdmin) return false;
      
      // If tab has role requirements, check them
      if (tab.requiredRoles && tab.requiredRoles.length > 0) {
        return tab.requiredRoles.some(role => effectiveRoles.includes(role as any)) || effectiveIsSuperAdmin;
      }
      
      // If tab requires auth but no specific roles, show to authenticated users
      if (tab.requiresAuth) return isAuthenticated || isPreviewAdmin;
      
      return true;
    });
  };

  const visibleTabs = getVisibleTabs();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header with auth status */}
      <div className="tech-border p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 accent-gradient bg-clip-text text-transparent">
              BlackBox Farm
            </h1>
            <p className="text-muted-foreground">
              24/7 Autonomous Trading Intelligence Platform
            </p>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated && <SecretsModal />}
            <AuthButton />
            {effectiveIsSuperAdmin && (
              <>
                <Button 
                  onClick={() => window.location.href = "/helius-usage"}
                  variant="outline"
                  size="sm"
                  className="border-blue-400 text-blue-600 hover:bg-blue-50"
                >
                  📊 API Usage
                </Button>
                <Button 
                  onClick={() => window.location.href = "/super-admin"}
                  variant="outline"
                  size="sm"
                  className="border-yellow-400 text-yellow-600 hover:bg-yellow-50"
                >
                  🛡️ Super Admin
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Status indicators - only show for authenticated users */}
        {(isAuthenticated || isPreviewAdmin) && (
          <div className="flex justify-center items-center gap-4 mb-4">
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
        )}

        {/* Role indicator */}
        {isPreviewAdmin && (
          <div className="text-center text-yellow-600 text-sm font-medium">
            🎭 Preview Mode - Super Admin View
          </div>
        )}
      </div>

      {/* Navigation tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, 1fr)` }}>
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {visibleTabs.map((tab) => {
          const Component = tab.component;
          return (
            <TabsContent key={tab.id} value={tab.id} className="mt-6">
              <Component />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};