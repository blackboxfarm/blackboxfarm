import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, Bell, Plus, Activity, UserPlus } from 'lucide-react';
import { AllstarRegistry } from '../allstar/AllstarRegistry';
import { AllstarMintAlerts } from '../allstar/AllstarMintAlerts';
import { AllstarAddForm } from '../allstar/AllstarAddForm';
import { AllstarAuditFeed } from '../allstar/AllstarAuditFeed';
import { MissingAdminPanel } from '../allstar/MissingAdminPanel';

export default function AllstarTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Star className="h-6 w-6 text-yellow-400" />
          A+ Allstar Dev Registry
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Monitor proven developers and get alerts when they launch new tokens
        </p>
      </div>

      <Tabs defaultValue="registry" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="registry" className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            Registry
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Mint Alerts
          </TabsTrigger>
          <TabsTrigger value="audit-feed" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Audit Feed
          </TabsTrigger>
          <TabsTrigger value="missing-admins" className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Missing Admins
          </TabsTrigger>
          <TabsTrigger value="add" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Dev
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registry">
          <AllstarRegistry />
        </TabsContent>
        <TabsContent value="alerts">
          <AllstarMintAlerts />
        </TabsContent>
        <TabsContent value="audit-feed">
          <AllstarAuditFeed />
        </TabsContent>
        <TabsContent value="missing-admins">
          <MissingAdminPanel />
        </TabsContent>
        <TabsContent value="add">
          <AllstarAddForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
