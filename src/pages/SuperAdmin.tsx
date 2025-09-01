import React, { useState } from "react";
import { SuperAdminWallets } from "@/components/SuperAdminWallets";
import { AdminWalletRecovery } from "@/components/AdminWalletRecovery";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SuperAdmin() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Super Admin</h1>
          <p className="text-muted-foreground">
            Manage platform wallets and administrative functions
          </p>
        </div>
        
        <Tabs defaultValue="wallets" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="wallets">Wallet Management</TabsTrigger>
            <TabsTrigger value="recovery">Wallet Recovery</TabsTrigger>
          </TabsList>
          
          <TabsContent value="wallets">
            <SuperAdminWallets />
          </TabsContent>
          
          <TabsContent value="recovery">
            <AdminWalletRecovery />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}