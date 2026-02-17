import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Twitter, Users, Bot } from "lucide-react";
import { MentionsTab } from "./twitter/MentionsTab";
import { KOLsTab } from "./twitter/KOLsTab";
import { CommentBotScanner } from "./CommentBotScanner";

export function TwitterScrapesView() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Twitter className="h-6 w-6 text-sky-400" />
          Twitter Scrapes
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Monitor token mentions, KOL activity, and comment bots
        </p>
      </div>

      {/* Sub-tabs */}
      <Tabs defaultValue="mentions" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="mentions" className="flex items-center gap-2">
            <Twitter className="h-4 w-4" />
            Mentions
          </TabsTrigger>
          <TabsTrigger value="kols" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            KOLs
          </TabsTrigger>
          <TabsTrigger value="comment-bots" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Comment Bots
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mentions">
          <MentionsTab />
        </TabsContent>

        <TabsContent value="kols">
          <KOLsTab />
        </TabsContent>

        <TabsContent value="comment-bots">
          <CommentBotScanner />
        </TabsContent>
      </Tabs>
    </div>
  );
}
