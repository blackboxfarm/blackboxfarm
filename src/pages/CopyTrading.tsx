import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CopyTradingConfig } from '@/components/copy-trading/CopyTradingConfig'
import { CopyTradingDashboard } from '@/components/copy-trading/CopyTradingDashboard'
import { RequireAuth } from '@/components/RequireAuth'

export default function CopyTrading() {
  return (
    <RequireAuth>
      <div className="container mx-auto p-6">
        <Tabs defaultValue="config" className="w-full">
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
    </RequireAuth>
  )
}