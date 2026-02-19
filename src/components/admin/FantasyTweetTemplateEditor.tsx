import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Save, RotateCcw, Eye, Send, Zap } from "lucide-react";

interface Template {
  id: string;
  template_type: string;
  template_text: string;
  is_enabled: boolean;
  post_to_community: boolean;
  post_to_main_feed: boolean;
  updated_at: string;
}

const PLACEHOLDER_DOCS = {
  buy: [
    { placeholder: "{{TOKEN_SYMBOL}}", description: "Token symbol (e.g., BONK)" },
    { placeholder: "{{TOKEN_NAME}}", description: "Full token name" },
    { placeholder: "{{TOKEN_CA}}", description: "Contract address (mint)" },
    { placeholder: "{{ENTRY_PRICE}}", description: "Entry price in USD" },
    { placeholder: "{{TARGET_MULTIPLIER}}", description: "Target multiplier (e.g., 2)" },
    { placeholder: "{{AMOUNT_SOL}}", description: "Position size in SOL" },
    { placeholder: "{{AMOUNT_USD}}", description: "Position size in USD" },
    { placeholder: "{{HOLDERS}}", description: "Holder count at entry" },
    { placeholder: "{{MCAP}}", description: "Market cap at entry (formatted)" },
  ],
  sell: [
    { placeholder: "{{TOKEN_SYMBOL}}", description: "Token symbol" },
    { placeholder: "{{TOKEN_CA}}", description: "Contract address (mint)" },
    { placeholder: "{{ENTRY_PRICE}}", description: "Entry price in USD" },
    { placeholder: "{{EXIT_PRICE}}", description: "Exit price in USD" },
    { placeholder: "{{MULTIPLIER}}", description: "Exit multiplier (e.g., 1.50)" },
    { placeholder: "{{PROFIT_PERCENT}}", description: "Profit percentage" },
    { placeholder: "{{PROFIT_SOL}}", description: "Profit in SOL" },
    { placeholder: "{{PROFIT_SIGN}}", description: "+ or -" },
    { placeholder: "{{PROFIT_EMOJI}}", description: "🟢 or 🔴" },
    { placeholder: "{{RESULT_EMOJI}}", description: "Contextual emoji" },
    { placeholder: "{{RESULT_MESSAGE}}", description: "AI result message" },
    { placeholder: "{{HOLD_DURATION}}", description: "Time held (e.g., 12m, 1.5h)" },
    { placeholder: "{{EXIT_REASON}}", description: "Why sold (Target hit, etc.)" },
  ],
};

const DEFAULT_TEMPLATES: Record<string, string> = {
  buy: "🤖 ALPHA DETECTED — $" + "{{TOKEN_SYMBOL}}" + "\n\n⚡ AI Signal Lock\n💰 Entry: $" + "{{ENTRY_PRICE}}" + "\n🎯 Target: " + "{{TARGET_MULTIPLIER}}" + "x\n📊 Position: " + "{{AMOUNT_SOL}}" + " SOL\n👥 Holders: " + "{{HOLDERS}}" + " | MCap: $" + "{{MCAP}}" + "\n\n🔗 https://pump.fun/coin/" + "{{TOKEN_CA}}" + "\n\n#Solana #PumpFun #" + "{{TOKEN_SYMBOL}}",
  sell: "{{PROFIT_EMOJI}}" + " TARGET LOCKED — $" + "{{TOKEN_SYMBOL}}" + "\n\n🏆 " + "{{RESULT_MESSAGE}}" + "\n💰 Entry: $" + "{{ENTRY_PRICE}}" + "\n💵 Exit: $" + "{{EXIT_PRICE}}" + " (" + "{{MULTIPLIER}}" + "x)\n📈 P&L: " + "{{PROFIT_SIGN}}" + "{{PROFIT_SOL}}" + " SOL (" + "{{PROFIT_SIGN}}" + "{{PROFIT_PERCENT}}" + "%)\n⏱️ Hold: " + "{{HOLD_DURATION}}" + "\n\n🔗 https://pump.fun/coin/" + "{{TOKEN_CA}}" + "\n\n#Solana #PumpFun #" + "{{TOKEN_SYMBOL}}",
};

const FantasyTweetTemplateEditor: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editedTemplates, setEditedTemplates] = useState<Record<string, string>>({});
  const [enabledStates, setEnabledStates] = useState<Record<string, boolean>>({});
  const [communityStates, setCommunityStates] = useState<Record<string, boolean>>({});
  const [mainFeedStates, setMainFeedStates] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState("buy");

  useEffect(() => { fetchTemplates(); }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("fantasy_tweet_templates")
      .select("*")
      .order("template_type");

    if (error) {
      console.error("Failed to fetch templates:", error);
      toast({ title: "Error", description: "Failed to load fantasy templates", variant: "destructive" });
    } else if (data) {
      setTemplates(data as Template[]);
      const edited: Record<string, string> = {};
      const enabled: Record<string, boolean> = {};
      const community: Record<string, boolean> = {};
      const mainFeed: Record<string, boolean> = {};
      (data as Template[]).forEach(t => {
        edited[t.template_type] = t.template_text;
        enabled[t.template_type] = t.is_enabled;
        community[t.template_type] = t.post_to_community;
        mainFeed[t.template_type] = t.post_to_main_feed;
      });
      setEditedTemplates(edited);
      setEnabledStates(enabled);
      setCommunityStates(community);
      setMainFeedStates(mainFeed);
    }
    setLoading(false);
  };

  const handleSave = async (templateType: string) => {
    setSaving(true);
    const template = templates.find(t => t.template_type === templateType);
    if (!template) { setSaving(false); return; }

    const { error } = await supabase
      .from("fantasy_tweet_templates")
      .update({
        template_text: editedTemplates[templateType],
        is_enabled: enabledStates[templateType],
        post_to_community: communityStates[templateType],
        post_to_main_feed: mainFeedStates[templateType],
      })
      .eq("id", template.id);

    if (error) {
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `Fantasy ${templateType} template updated` });
      fetchTemplates();
    }
    setSaving(false);
  };

  const handleReset = (templateType: string) => {
    setEditedTemplates(prev => ({ ...prev, [templateType]: DEFAULT_TEMPLATES[templateType] || "" }));
  };

  const handleTestPost = async (templateType: string) => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('fantasy-tweet', {
        body: {
          type: templateType,
          tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
          tokenSymbol: 'BONK',
          tokenName: 'Bonk',
          entryPrice: 0.00002345,
          targetMultiplier: 2,
          amountSol: 0.3,
          amountUsd: 25,
          holders: 68,
          mcap: 7348,
          exitPrice: 0.0000469,
          multiplier: 2.0,
          profitSol: 0.3,
          profitPercent: 100,
          exitReason: 'Target 2x reached',
          holdDurationMins: 45,
        },
      });

      if (error) throw error;
      if (data?.skipped) {
        toast({ title: "Skipped", description: data.reason });
      } else if (data?.success) {
        toast({ title: "✅ Test Posted!", description: `Tweet ID: ${data.community_id || data.main_feed_id || 'sent'}` });
      } else {
        toast({ title: "Failed", description: "No tweet was posted", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Test post failed", variant: "destructive" });
    }
    setTesting(false);
  };

  const previewTemplate = (templateType: string) => {
    let text = editedTemplates[templateType] || "";
    const sampleData: Record<string, string> = {
      "{{TOKEN_SYMBOL}}": "BONK", "{{TOKEN_NAME}}": "Bonk",
      "{{TOKEN_CA}}": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      "{{ENTRY_PRICE}}": "0.00002345", "{{EXIT_PRICE}}": "0.00004690",
      "{{TARGET_MULTIPLIER}}": "2", "{{AMOUNT_SOL}}": "0.3000", "{{AMOUNT_USD}}": "25",
      "{{HOLDERS}}": "68", "{{MCAP}}": "7.3K", "{{MULTIPLIER}}": "2.00",
      "{{PROFIT_PERCENT}}": "100.0", "{{PROFIT_SOL}}": "0.3000",
      "{{PROFIT_SIGN}}": "+", "{{PROFIT_EMOJI}}": "🟢",
      "{{RESULT_EMOJI}}": "🚀", "{{RESULT_MESSAGE}}": "MASSIVE HIT! 🎉 AI called it.",
      "{{HOLD_DURATION}}": "45m", "{{EXIT_REASON}}": "Target 2x reached",
    };
    Object.entries(sampleData).forEach(([key, value]) => {
      text = text.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
    });
    return text;
  };

  const renderTab = (templateType: string, title: string, icon: string) => {
    const template = templates.find(t => t.template_type === templateType);
    const placeholders = PLACEHOLDER_DOCS[templateType as keyof typeof PLACEHOLDER_DOCS] || [];
    const hasChanges = template && (
      editedTemplates[templateType] !== template.template_text ||
      enabledStates[templateType] !== template.is_enabled ||
      communityStates[templateType] !== template.post_to_community ||
      mainFeedStates[templateType] !== template.post_to_main_feed
    );

    return (
      <TabsContent value={templateType} className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <h3 className="font-semibold">{title} Template</h3>
              <p className="text-sm text-muted-foreground">
                {templateType === 'buy' ? 'Posted for every fantasy buy' : 'Posted only for profitable fantasy sells'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch id={`${templateType}-enabled`} checked={enabledStates[templateType] ?? true}
                onCheckedChange={(checked) => setEnabledStates(prev => ({ ...prev, [templateType]: checked }))} />
              <Label htmlFor={`${templateType}-enabled`}>{enabledStates[templateType] ? "Enabled" : "Disabled"}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id={`${templateType}-community`} checked={communityStates[templateType] ?? true}
                onCheckedChange={(checked) => setCommunityStates(prev => ({ ...prev, [templateType]: checked }))} />
              <Label htmlFor={`${templateType}-community`} className="text-xs">Community</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id={`${templateType}-mainfeed`} checked={mainFeedStates[templateType] ?? false}
                onCheckedChange={(checked) => setMainFeedStates(prev => ({ ...prev, [templateType]: checked }))} />
              <Label htmlFor={`${templateType}-mainfeed`} className="text-xs">Main Feed</Label>
            </div>
            {hasChanges && <Badge variant="secondary">Unsaved</Badge>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Template Text</Label>
            <Textarea
              value={editedTemplates[templateType] || ""}
              onChange={(e) => setEditedTemplates(prev => ({ ...prev, [templateType]: e.target.value }))}
              className="min-h-[280px] font-mono text-sm"
              placeholder="Enter your tweet template..."
            />
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => handleSave(templateType)} disabled={saving || !hasChanges} size="sm">
                <Save className="w-4 h-4 mr-1" /> Save
              </Button>
              <Button variant="outline" onClick={() => handleReset(templateType)} size="sm">
                <RotateCcw className="w-4 h-4 mr-1" /> Reset
              </Button>
              <Button variant="secondary" onClick={() => handleTestPost(templateType)} disabled={testing} size="sm">
                <Send className="w-4 h-4 mr-1" /> {testing ? 'Posting...' : 'Test Post'}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4" /> Preview
              </Label>
              <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap text-sm border">
                {previewTemplate(templateType)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {previewTemplate(templateType).length}/280 chars
              </p>
            </div>
            <div>
              <Label className="mb-2 block">Placeholders</Label>
              <div className="space-y-1 text-sm">
                {placeholders.map(p => (
                  <div key={p.placeholder} className="flex items-start gap-2">
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono shrink-0">{p.placeholder}</code>
                    <span className="text-muted-foreground text-xs">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </TabsContent>
    );
  };

  if (loading) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">Loading fantasy templates...</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Fantasy X Community Posts
        </CardTitle>
        <CardDescription>
          Auto-post Fantasy buys and profitable sells to your X Community. Loss trades are never posted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buy">🤖 Buy Alert</TabsTrigger>
            <TabsTrigger value="sell">🏆 Profit Alert</TabsTrigger>
          </TabsList>
          {renderTab("buy", "Buy", "🤖")}
          {renderTab("sell", "Profit Sell", "🏆")}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default FantasyTweetTemplateEditor;
