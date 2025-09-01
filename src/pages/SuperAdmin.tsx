import React, { useState, useEffect } from "react";
import { SuperAdminWallets } from "@/components/SuperAdminWallets";
import { AdminWalletRecovery } from "@/components/AdminWalletRecovery";
import { SecurityDashboard } from "@/components/security/SecurityDashboard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="wallets">Wallet Management</TabsTrigger>
            <TabsTrigger value="recovery">Wallet Recovery</TabsTrigger>
            <TabsTrigger value="security">Security Dashboard</TabsTrigger>
          </TabsList>
          
          <TabsContent value="wallets">
            <SuperAdminWallets />
          </TabsContent>
          
          <TabsContent value="recovery">
            <AdminWalletRecovery />
          </TabsContent>
          
          <TabsContent value="security">
            <SecurityDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}