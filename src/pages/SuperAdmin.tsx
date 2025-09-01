import React from "react";
import { SuperAdminWallets } from "@/components/SuperAdminWallets";

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
        
        <SuperAdminWallets />
      </div>
    </div>
  );
}