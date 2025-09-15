import React, { useState, useEffect } from "react";
import { SuperAdminWallets } from "@/components/SuperAdminWallets";
import { AdminWalletRecovery } from "@/components/AdminWalletRecovery";
import { SecurityDashboard } from "@/components/security/SecurityDashboard";
import { AccountViewer } from "@/components/AccountViewer";
import { BaglessHoldersReport } from "@/components/BaglessHoldersReport";
import { LiquidityLockChecker } from "@/components/LiquidityLockChecker";
import { AllWalletsTokenView } from "@/components/AllWalletsTokenView";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TransactionHistoryWindow from "@/components/blackbox/TransactionHistoryWindow";
import { WalletBalanceMonitor } from "@/components/WalletBalanceMonitor";
import { WalletMonitor } from "@/components/WalletMonitor";


export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState("wallets");

  useEffect(() => {
    // Check for tab parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, []);

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
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="wallets">Wallet Management</TabsTrigger>
            <TabsTrigger value="recovery">Wallet Recovery</TabsTrigger>
            <TabsTrigger value="monitor">Wallet Monitor</TabsTrigger>
            <TabsTrigger value="security">Security Dashboard</TabsTrigger>
            <TabsTrigger value="accounts">Account Directory</TabsTrigger>
            <TabsTrigger value="holders">Token Holders</TabsTrigger>
            <TabsTrigger value="liquidity">Liquidity Checker</TabsTrigger>
            <TabsTrigger value="tokens">All Tokens</TabsTrigger>
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
        </Tabs>
      </div>
    </div>
  );
}