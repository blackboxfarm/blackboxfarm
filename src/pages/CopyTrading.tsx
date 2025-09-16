import React, { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopyTradingConfig } from '@/components/copy-trading/CopyTradingConfig'
import { CopyTradingDashboard } from '@/components/copy-trading/CopyTradingDashboard'
import { useSuperAdminAuth } from '@/hooks/useSuperAdminAuth'
import { Loader2 } from 'lucide-react'

export default function CopyTrading() {
  const { authReady } = useSuperAdminAuth();
  const [tab, setTab] = useState('config');

  useEffect(() => {
    const handler = () => setTab('dashboard');
    // @ts-ignore - CustomEvent typing
    window.addEventListener('show-dashboard', handler as any);
    return () => window.removeEventListener('show-dashboard', handler as any);
  }, []);
  if (!authReady) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center p-8 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Syncing your data to your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>
        
        <TabsContent value="config" className="mt-6">
          <CopyTradingConfig />
        </TabsContent>
        
        <TabsContent value="dashboard" className="mt-6">
          <CopyTradingDashboard />
        </TabsContent>
      </Tabs>
    </div>
  )
}