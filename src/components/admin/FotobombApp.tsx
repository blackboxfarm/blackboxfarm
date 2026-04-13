import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FotobombTargetForm } from './fotobomb/FotobombTargetForm';
import { FotobombGallery } from './fotobomb/FotobombGallery';
import { FotobombTargetList } from './fotobomb/FotobombTargetList';

export function FotobombApp() {
  const [activeTab, setActiveTab] = useState('targets');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const handleViewGallery = (targetId: string) => {
    setSelectedTargetId(targetId);
    setActiveTab('gallery');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl">💣</span>
        <div>
          <h2 className="text-xl font-bold text-foreground">FOTOBOMB</h2>
          <p className="text-sm text-muted-foreground">
            Scrape Facebook page photos oldest-first. Review & approve for reposting.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="targets">🎯 Targets</TabsTrigger>
          <TabsTrigger value="gallery">📸 Gallery Review</TabsTrigger>
        </TabsList>

        <TabsContent value="targets" className="space-y-4">
          <FotobombTargetForm onSuccess={() => {}} />
          <FotobombTargetList onViewGallery={handleViewGallery} />
        </TabsContent>

        <TabsContent value="gallery">
          <FotobombGallery 
            targetId={selectedTargetId} 
            onBack={() => setActiveTab('targets')} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default FotobombApp;
