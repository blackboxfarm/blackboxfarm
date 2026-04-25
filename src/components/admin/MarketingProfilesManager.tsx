import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target } from "lucide-react";
import { PositioningPanel } from "./marketing/PositioningPanel";
import { PersonasPanel } from "./marketing/PersonasPanel";
import { PlaybooksPanel } from "./marketing/PlaybooksPanel";
import { CompetitiveMatrixPanel } from "./marketing/CompetitiveMatrixPanel";
import { MessagingLibraryPanel } from "./marketing/MessagingLibraryPanel";

/**
 * Marketing Profiles — internal strategy hub.
 * Houses the ICP, personas, playbooks, competitive matrix, and reusable copy library.
 * Editable, super-admin only, persisted to public.marketing_profiles.
 */
export function MarketingProfilesManager() {
  const [tab, setTab] = useState("positioning");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Marketing Profiles
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Our living strategy doc — who we sell to, what we say, and how we beat the competition.
          Edit anything; changes are immediate. Reusable across Email Campaigns, Intel Briefings, and social channels.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap w-full h-auto gap-1 p-1">
            <TabsTrigger value="positioning">🧭 Positioning</TabsTrigger>
            <TabsTrigger value="personas">👤 Personas</TabsTrigger>
            <TabsTrigger value="playbooks">🎯 Playbooks</TabsTrigger>
            <TabsTrigger value="competitive">🆚 Competitive</TabsTrigger>
            <TabsTrigger value="messaging">🗣️ Messaging Library</TabsTrigger>
          </TabsList>
          <TabsContent value="positioning" className="mt-4">{tab === "positioning" && <PositioningPanel />}</TabsContent>
          <TabsContent value="personas" className="mt-4">{tab === "personas" && <PersonasPanel />}</TabsContent>
          <TabsContent value="playbooks" className="mt-4">{tab === "playbooks" && <PlaybooksPanel />}</TabsContent>
          <TabsContent value="competitive" className="mt-4">{tab === "competitive" && <CompetitiveMatrixPanel />}</TabsContent>
          <TabsContent value="messaging" className="mt-4">{tab === "messaging" && <MessagingLibraryPanel />}</TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default MarketingProfilesManager;