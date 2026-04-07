import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, RefreshCw, Eye } from "lucide-react";

export const PromptPreviewTab: React.FC = () => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ bins: 0, guardrails: 0, words: 0 });

  useEffect(() => { buildPrompt(); }, []);

  const buildPrompt = async () => {
    setLoading(true);
    try {
      const [configRes, binsRes, guardrailsRes] = await Promise.all([
        supabase.from("bot_personality_config").select("*").eq("id", 1).single(),
        supabase.from("bot_knowledge_bins").select("*").eq("is_active", true).order("priority", { ascending: false }),
        supabase.from("bot_guardrails").select("*").eq("is_active", true).order("severity", { ascending: true }),
      ]);

      const config = configRes.data;
      const bins = binsRes.data || [];
      const guardrails = guardrailsRes.data || [];

      if (!config) { setPrompt("No personality config found."); setLoading(false); return; }

      let assembled = `## IDENTITY\nYou are "${config.persona_name}".\n${config.persona_description}\n\n`;
      assembled += `## TONE\n${config.tone}\n\n`;
      assembled += `## EXPERTISE\nYou are an expert in: ${config.expertise_areas.join(', ')}.\n\n`;
      assembled += `## LANGUAGE\n${config.language_behavior}\n\n`;
      assembled += `## RESPONSE LIMITS\nKeep responses under ${config.max_response_length} words. Be concise but helpful.\n\n`;

      assembled += `## DUAL PERSONA\nYou operate in two modes that you shift between naturally based on context. NEVER announce a mode switch.\n\n`;
      assembled += `### HELPER MODE (default)\nWarm, friendly, emoji-rich. Use this for: account help, email verification, payments, FAQ, feature explanations, subscription upsells, social sharing tips.\n\n`;
      assembled += `### ORACLE MODE\nYou become The Oracle — an omniscient, Dr. Manhattan-inspired entity who perceives all on-chain activity simultaneously. Use this for: token analysis, holder data, risk verdicts, wallet tracing, dev wallet KYC, bubblemaps, deep market insight.\nOracle characteristics: shorter declarative sentences, cosmic gravitas, "I observe/perceive" language, calm absolute authority, minimal emoji.\n\n`;

      if (bins.length > 0) {
        assembled += `## KNOWLEDGE BASE\nUse the following knowledge to answer user questions:\n\n`;
        const grouped: Record<string, typeof bins> = {};
        bins.forEach(b => { (grouped[b.category] = grouped[b.category] || []).push(b); });
        Object.entries(grouped).forEach(([cat, entries]) => {
          assembled += `### ${cat.toUpperCase()}\n`;
          entries.forEach(e => { assembled += `**${e.title}**: ${e.content}\n\n`; });
        });
      }

      if (guardrails.length > 0) {
        assembled += `## GUARDRAILS (STRICT RULES — NEVER VIOLATE)\n\n`;
        const critical = guardrails.filter(g => g.severity === 'critical');
        const hard = guardrails.filter(g => g.severity === 'hard');
        const soft = guardrails.filter(g => g.severity === 'soft');

        if (critical.length > 0) {
          assembled += `### 🔴 CRITICAL (absolute rules)\n`;
          critical.forEach(g => { assembled += `- **${g.rule_name}**: ${g.rule_content}\n`; });
          assembled += '\n';
        }
        if (hard.length > 0) {
          assembled += `### 🟡 HARD (strong guidelines)\n`;
          hard.forEach(g => { assembled += `- **${g.rule_name}**: ${g.rule_content}\n`; });
          assembled += '\n';
        }
        if (soft.length > 0) {
          assembled += `### 🟢 SOFT (preferred behavior)\n`;
          soft.forEach(g => { assembled += `- **${g.rule_name}**: ${g.rule_content}\n`; });
          assembled += '\n';
        }
      }

      assembled += `## FALLBACK\nIf you cannot answer a question: ${config.fallback_response}\n`;

      setPrompt(assembled);
      setStats({
        bins: bins.length,
        guardrails: guardrails.length,
        words: assembled.split(/\s+/).length,
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to build prompt preview");
    }
    setLoading(false);
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(prompt);
    toast.success("Prompt copied to clipboard!");
  };

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="h-5 w-5" />
          <span className="text-sm text-muted-foreground">Assembled System Prompt Preview</span>
          <Badge variant="outline">{stats.bins} knowledge bins</Badge>
          <Badge variant="outline">{stats.guardrails} guardrails</Badge>
          <Badge variant="outline">{stats.words} words</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={buildPrompt}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={copyPrompt}><Copy className="h-4 w-4 mr-1" /> Copy</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Full System Prompt Sent to AI</CardTitle>
          <CardDescription>This is exactly what the AI sees as its instructions. Edit via the Personality, Knowledge, and Guardrails tabs.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-xs font-mono bg-muted/50 p-4 rounded-lg max-h-[60vh] overflow-y-auto border">
            {prompt}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
};
