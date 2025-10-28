import React, { useState, useEffect } from "react";
import { SuperAdminWallets } from "@/components/SuperAdminWallets";
import { AdminWalletRecovery } from "@/components/AdminWalletRecovery";
import { SecurityDashboard } from "@/components/security/SecurityDashboard";
import { AccountViewer } from "@/components/AccountViewer";
import { BaglessHoldersReport } from "@/components/BaglessHoldersReport";
import { LiquidityLockChecker } from "@/components/LiquidityLockChecker";
import { AllWalletsTokenView } from "@/components/AllWalletsTokenView";
import { DeveloperProfiles } from "@/components/admin/DeveloperProfiles";
import { AnalysisJobs } from "@/components/admin/AnalysisJobs";
import { TokenWatchdog } from "@/components/admin/TokenWatchdog";
import { SystemTesting } from "@/components/admin/SystemTesting";
import { DeveloperAlerts } from "@/components/admin/DeveloperAlerts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TransactionHistoryWindow from "@/components/blackbox/TransactionHistoryWindow";
import { WalletBalanceMonitor } from "@/components/WalletBalanceMonitor";
import { WalletMonitor } from "@/components/WalletMonitor";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Shield, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState("wallets");
  const { isSuperAdmin, isLoading } = useUserRoles();

  useEffect(() => {
    // Check for tab parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, []);

  // Show loading state while checking roles
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Verifying permissions...</p>
        </div>
      </div>
    );
  }

  // Show access denied if not super admin
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="text-xl">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              You don't have permission to access the Super Admin panel. 
              Only verified super administrators can access this area.
            </p>
            <Button onClick={() => window.history.back()} variant="outline">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Super Admin</h1>
          <p className="text-muted-foreground">
            Manage platform wallets and administrative functions
          </p>
        </div>
        <div className="mb-6">
          <WalletBalanceMonitor />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-12 lg:grid-cols-13">
            <TabsTrigger value="wallets">Wallet Management</TabsTrigger>
            <TabsTrigger value="recovery">Wallet Recovery</TabsTrigger>
            <TabsTrigger value="monitor">Wallet Monitor</TabsTrigger>
            <TabsTrigger value="security">Security Dashboard</TabsTrigger>
            <TabsTrigger value="accounts">Account Directory</TabsTrigger>
            <TabsTrigger value="holders">Token Holders</TabsTrigger>
            <TabsTrigger value="liquidity">Liquidity Checker</TabsTrigger>
            <TabsTrigger value="tokens">All Tokens</TabsTrigger>
            <TabsTrigger value="developers">Developer Intel</TabsTrigger>
            <TabsTrigger value="analysis">Analysis Jobs</TabsTrigger>
            <TabsTrigger value="watchdog">Token Watchdog</TabsTrigger>
            <TabsTrigger value="alerts">Dev Alerts</TabsTrigger>
            <TabsTrigger value="testing">System Tests</TabsTrigger>
          </TabsList>
          
          <TabsContent value="wallets">
            <SuperAdminWallets />
          </TabsContent>
          
          <TabsContent value="recovery">
            <AdminWalletRecovery />
          </TabsContent>
          
          <TabsContent value="monitor">
            <WalletMonitor />
          </TabsContent>
          
          <TabsContent value="security">
            <SecurityDashboard />
          </TabsContent>
          
          <TabsContent value="accounts">
            <AccountViewer />
          </TabsContent>
          
          <TabsContent value="holders">
            <BaglessHoldersReport />
          </TabsContent>
          
          <TabsContent value="liquidity">
            <LiquidityLockChecker />
          </TabsContent>
          
          <TabsContent value="tokens">
            <AllWalletsTokenView />
          </TabsContent>

          <TabsContent value="developers">
            <DeveloperProfiles />
          </TabsContent>

          <TabsContent value="analysis">
            <AnalysisJobs />
          </TabsContent>

          <TabsContent value="watchdog">
            <TokenWatchdog />
          </TabsContent>

          <TabsContent value="alerts">
            <DeveloperAlerts />
          </TabsContent>

          <TabsContent value="testing">
            <SystemTesting />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}