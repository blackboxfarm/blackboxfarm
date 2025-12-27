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
import { Save, RotateCcw, Twitter, Eye } from "lucide-react";

interface Template {
  id: string;
  template_type: string;
  template_text: string;
  is_enabled: boolean;
  updated_at: string;
}

const PLACEHOLDER_DOCS = {
  buy: [
    { placeholder: "{{TOKEN_SYMBOL}}", description: "Token symbol (e.g., BONK)" },
    { placeholder: "{{TOKEN_NAME}}", description: "Full token name" },
    { placeholder: "{{ENTRY_PRICE}}", description: "Entry price in USD" },
    { placeholder: "{{TARGET_MULTIPLIER}}", description: "Target multiplier (e.g., 2)" },
    { placeholder: "{{AMOUNT_SOL}}", description: "Amount in SOL" },
  ],
  sell: [
    { placeholder: "{{TOKEN_SYMBOL}}", description: "Token symbol" },
    { placeholder: "{{TOKEN_NAME}}", description: "Full token name" },
    { placeholder: "{{ENTRY_PRICE}}", description: "Entry price in USD" },
    { placeholder: "{{EXIT_PRICE}}", description: "Exit price in USD" },
    { placeholder: "{{PROFIT_PERCENT}}", description: "Profit percentage" },
    { placeholder: "{{PROFIT_SOL}}", description: "Profit in SOL" },
    { placeholder: "{{PROFIT_SIGN}}", description: "+ or - based on profit" },
    { placeholder: "{{PROFIT_EMOJI}}", description: "🟢 for profit, 🔴 for loss" },
    { placeholder: "{{RESULT_EMOJI}}", description: "Contextual emoji based on result" },
    { placeholder: "{{RESULT_MESSAGE}}", description: "Contextual message based on profit %" },
  ],
  rebuy: [
    { placeholder: "{{TOKEN_SYMBOL}}", description: "Token symbol" },
    { placeholder: "{{TOKEN_NAME}}", description: "Full token name" },
    { placeholder: "{{ENTRY_PRICE}}", description: "New entry price in USD" },
    { placeholder: "{{TARGET_MULTIPLIER}}", description: "Target multiplier" },
    { placeholder: "{{AMOUNT_SOL}}", description: "Amount in SOL" },
  ],
};

const DEFAULT_TEMPLATES: Record<string, string> = {
  buy: "🎯 FLIP IT: Just entered ${{TOKEN_SYMBOL}}\n\n💰 Entry: ${{ENTRY_PRICE}}\n🎯 Target: {{TARGET_MULTIPLIER}}x\n📊 Amount: {{AMOUNT_SOL}} SOL\n\nLet's see if this one prints! 🚀\n\n#Solana #{{TOKEN_SYMBOL}} #FlipIt",
  sell: "{{PROFIT_EMOJI}} FLIP IT CLOSED: ${{TOKEN_SYMBOL}}\n\n💰 Entry: ${{ENTRY_PRICE}}\n💵 Exit: ${{EXIT_PRICE}}\n{{RESULT_EMOJI}} PnL: {{PROFIT_SIGN}}{{PROFIT_PERCENT}}% ({{PROFIT_SIGN}}{{PROFIT_SOL}} SOL)\n\n{{RESULT_MESSAGE}}\n\n#Solana #{{TOKEN_SYMBOL}} #FlipIt",
  rebuy: "🔄 FLIP IT REBUY: ${{TOKEN_SYMBOL}}\n\n💰 New Entry: ${{ENTRY_PRICE}}\n🎯 Target: {{TARGET_MULTIPLIER}}x\n📊 Amount: {{AMOUNT_SOL}} SOL\n\nBack in for another round! 🎰\n\n#Solana #{{TOKEN_SYMBOL}} #FlipIt",
};

const TweetTemplateEditor: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editedTemplates, setEditedTemplates] = useState<Record<string, string>>({});
  const [enabledStates, setEnabledStates] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("buy");

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("flipit_tweet_templates")
      .select("*")
      .order("template_type");

    if (error) {
      console.error("Failed to fetch templates:", error);
      toast({ title: "Error", description: "Failed to load templates", variant: "destructive" });
    } else if (data) {
      setTemplates(data);
      const edited: Record<string, string> = {};
      const enabled: Record<string, boolean> = {};
      data.forEach(t => {
        edited[t.template_type] = t.template_text;
        enabled[t.template_type] = t.is_enabled;
      });
      setEditedTemplates(edited);
      setEnabledStates(enabled);
    }
    setLoading(false);
  };

  const handleSave = async (templateType: string) => {
    setSaving(true);
    const template = templates.find(t => t.template_type === templateType);
    if (!template) {
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("flipit_tweet_templates")
      .update({
        template_text: editedTemplates[templateType],
        is_enabled: enabledStates[templateType],
      })
      .eq("id", template.id);

    if (error) {
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `${templateType} template updated` });
      fetchTemplates();
    }
    setSaving(false);
  };

  const handleReset = (templateType: string) => {
    setEditedTemplates(prev => ({
      ...prev,
      [templateType]: DEFAULT_TEMPLATES[templateType] || "",
    }));
  };

  const previewTemplate = (templateType: string) => {
    let text = editedTemplates[templateType] || "";
    
    // Sample data for preview
    const sampleData: Record<string, string> = {
      "{{TOKEN_SYMBOL}}": "BONK",
      "{{TOKEN_NAME}}": "Bonk",
      "{{ENTRY_PRICE}}": "0.00002345",
      "{{EXIT_PRICE}}": "0.00004690",
      "{{TARGET_MULTIPLIER}}": "2",
      "{{AMOUNT_SOL}}": "0.5000",
      "{{PROFIT_PERCENT}}": "100.00",
      "{{PROFIT_SOL}}": "0.5000",
      "{{PROFIT_SIGN}}": "+",
      "{{PROFIT_EMOJI}}": "🟢",
      "{{RESULT_EMOJI}}": "🚀",
      "{{RESULT_MESSAGE}}": "MASSIVE WIN! 🎉",
    };

    Object.entries(sampleData).forEach(([key, value]) => {
      text = text.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
    });

    return text;
  };

  const renderTemplateTab = (templateType: string, title: string, icon: string) => {
    const template = templates.find(t => t.template_type === templateType);
    const placeholders = PLACEHOLDER_DOCS[templateType as keyof typeof PLACEHOLDER_DOCS] || [];
    const hasChanges = template && (
      editedTemplates[templateType] !== template.template_text ||
      enabledStates[templateType] !== template.is_enabled
    );

    return (
      <TabsContent value={templateType} className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <h3 className="font-semibold">{title} Template</h3>
              <p className="text-sm text-muted-foreground">
                Posted when a {templateType} trade is executed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id={`${templateType}-enabled`}
                checked={enabledStates[templateType] ?? true}
                onCheckedChange={(checked) => 
                  setEnabledStates(prev => ({ ...prev, [templateType]: checked }))
                }
              />
              <Label htmlFor={`${templateType}-enabled`}>
                {enabledStates[templateType] ? "Enabled" : "Disabled"}
              </Label>
            </div>
            {hasChanges && (
              <Badge variant="secondary">Unsaved changes</Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Template Text</Label>
            <Textarea
              value={editedTemplates[templateType] || ""}
              onChange={(e) => 
                setEditedTemplates(prev => ({ ...prev, [templateType]: e.target.value }))
              }
              className="min-h-[300px] font-mono text-sm"
              placeholder="Enter your tweet template..."
            />
            <div className="flex gap-2">
              <Button onClick={() => handleSave(templateType)} disabled={saving || !hasChanges}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
              <Button variant="outline" onClick={() => handleReset(templateType)}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Default
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4" />
                Preview
              </Label>
              <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap text-sm border">
                {previewTemplate(templateType)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Character count: {previewTemplate(templateType).length}/280
              </p>
            </div>

            <div>
              <Label className="mb-2 block">Available Placeholders</Label>
              <div className="space-y-1 text-sm">
                {placeholders.map(p => (
                  <div key={p.placeholder} className="flex items-start gap-2">
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono shrink-0">
                      {p.placeholder}
                    </code>
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
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading templates...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Twitter className="w-5 h-5" />
          Tweet Templates
        </CardTitle>
        <CardDescription>
          Customize the tweets posted for each FlipIt trade action. Use placeholders for dynamic content.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="buy">🎯 Buy</TabsTrigger>
            <TabsTrigger value="sell">💰 Sell</TabsTrigger>
            <TabsTrigger value="rebuy">🔄 Rebuy</TabsTrigger>
          </TabsList>

          {renderTemplateTab("buy", "Buy", "🎯")}
          {renderTemplateTab("sell", "Sell", "💰")}
          {renderTemplateTab("rebuy", "Rebuy", "🔄")}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default TweetTemplateEditor;
