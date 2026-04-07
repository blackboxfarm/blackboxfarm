import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonalityTab, KnowledgeBinsTab, GuardrailsTab, PromptPreviewTab } from "@/components/admin/ai-config";

const AIConfigTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">AI Bot Configuration</h2>
        <p className="text-muted-foreground">Control the personality, knowledge, and guardrails for the AI assistant across Telegram and web chat.</p>
      </div>

      <Tabs defaultValue="personality" className="space-y-4">
        <TabsList>
          <TabsTrigger value="personality">🤖 Personality</TabsTrigger>
          <TabsTrigger value="knowledge">📚 Knowledge Bins</TabsTrigger>
          <TabsTrigger value="guardrails">🛡️ Guardrails</TabsTrigger>
          <TabsTrigger value="preview">👁️ Prompt Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="personality"><PersonalityTab /></TabsContent>
        <TabsContent value="knowledge"><KnowledgeBinsTab /></TabsContent>
        <TabsContent value="guardrails"><GuardrailsTab /></TabsContent>
        <TabsContent value="preview"><PromptPreviewTab /></TabsContent>
      </Tabs>
    </div>
  );
};

export default AIConfigTab;
