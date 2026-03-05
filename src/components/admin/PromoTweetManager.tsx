import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Save, RotateCcw, Eye, Play, Square, Clock, Megaphone, Send, Loader2 } from "lucide-react";

interface PromoTemplate {
  id: string;
  template_type: string;
  template_text: string;
  is_enabled: boolean;
  updated_at: string;
}

interface PromoConfig {
  id: string;
  interval_hours: number;
  is_running: boolean;
  last_posted_type: string | null;
  last_posted_at: string | null;
}

const PROMO_TABS = [
  { key: "promo1", label: "Promo 1", icon: "📢" },
  { key: "promo2", label: "Promo 2", icon: "📣" },
  { key: "promo3", label: "Promo 3", icon: "🔊" },
  { key: "promo4", label: "Promo 4", icon: "📡" },
  { key: "promo5", label: "Promo 5", icon: "🎯" },
  { key: "promo6", label: "Promo 6", icon: "⚡" },
];

const PromoTweetManager: React.FC = () => {
  const [templates, setTemplates] = useState<PromoTemplate[]>([]);
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});
  const [enabledStates, setEnabledStates] = useState<Record<string, boolean>>({});
  const [config, setConfig] = useState<PromoConfig | null>(null);
  const [intervalInput, setIntervalInput] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("promo1");
  const [postingType, setPostingType] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, []);

  const fetchAll = async (preserveScroll = false) => {
    const scrollY = preserveScroll ? window.scrollY : null;
    setLoading(false); // Don't show loading on refetch
    const [tmplRes, cfgRes] = await Promise.all([
      supabase.from("promo_tweet_templates").select("*").order("template_type"),
      supabase.from("promo_tweet_config").select("*").limit(1).single(),
    ]);

    if (tmplRes.data) {
      setTemplates(tmplRes.data);
      const texts: Record<string, string> = {};
      const enabled: Record<string, boolean> = {};
      tmplRes.data.forEach(t => {
        texts[t.template_type] = t.template_text;
        enabled[t.template_type] = t.is_enabled;
      });
      setEditedTexts(texts);
      setEnabledStates(enabled);
    }

    if (cfgRes.data) {
      setConfig(cfgRes.data);
      setIntervalInput(cfgRes.data.interval_hours);
    }
    
    if (scrollY !== null) {
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
    }
  };

  const handleSaveTemplate = async (type: string) => {
    setSaving(true);
    const template = templates.find(t => t.template_type === type);
    if (!template) { setSaving(false); return; }

    const { error } = await supabase
      .from("promo_tweet_templates")
      .update({
        template_text: editedTexts[type],
        is_enabled: enabledStates[type],
      })
      .eq("id", template.id);

    if (error) {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `${type} template updated` });
      fetchAll(true);
    }
    setSaving(false);
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    const { error } = await supabase
      .from("promo_tweet_config")
      .update({ interval_hours: intervalInput })
      .eq("id", config.id);

    if (error) {
      toast({ title: "Error", description: "Failed to save config", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `Interval set to ${intervalInput}h` });
      fetchAll(true);
    }
  };

  const handleToggleRunning = async () => {
    if (!config) return;
    const newState = !config.is_running;
    const { error } = await supabase
      .from("promo_tweet_config")
      .update({ is_running: newState })
      .eq("id", config.id);

    if (error) {
      toast({ title: "Error", description: "Failed to toggle", variant: "destructive" });
    } else {
      toast({ title: newState ? "Started" : "Stopped", description: `Promo rotation ${newState ? "started" : "stopped"}` });
      fetchAll(true);
    }
  };

  const enabledCount = Object.values(enabledStates).filter(Boolean).length;

  const handlePostNow = async (type: string) => {
    const text = editedTexts[type];
    if (!text?.trim()) {
      toast({ title: "Empty", description: "Template has no text to post", variant: "destructive" });
      return;
    }
    setPostingType(type);
    try {
      const { data, error } = await supabase.functions.invoke("post-share-card-twitter", {
        body: { tweetText: text, twitterHandle: "HoldersIntel" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Tweet failed");

      // Update config to reflect this manual post
      if (config) {
        await supabase
          .from("promo_tweet_config")
          .update({ last_posted_type: type, last_posted_at: new Date().toISOString() })
          .eq("id", config.id);
      }

      toast({ title: "✅ Posted!", description: `${type} tweeted successfully (ID: ${data.tweetId})` });
      fetchAll(true);
    } catch (err: any) {
      console.error("Post now error:", err);
      toast({ title: "Failed", description: err.message || "Could not post tweet", variant: "destructive" });
    } finally {
      setPostingType(null);
    }
  };

  const renderTab = (type: string, label: string, icon: string) => {
    const template = templates.find(t => t.template_type === type);
    const hasChanges = template && (
      editedTexts[type] !== template.template_text ||
      enabledStates[type] !== template.is_enabled
    );
    const charCount = (editedTexts[type] || "").length;

    return (
      <TabsContent value={type} className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <h3 className="font-semibold">{label}</h3>
              <p className="text-sm text-muted-foreground">
                {enabledStates[type] ? "Active in rotation" : "Disabled — skipped in rotation"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id={`${type}-enabled`}
                checked={enabledStates[type] ?? false}
                onCheckedChange={(checked) =>
                  setEnabledStates(prev => ({ ...prev, [type]: checked }))
                }
              />
              <Label htmlFor={`${type}-enabled`}>
                {enabledStates[type] ? "Enabled" : "Disabled"}
              </Label>
            </div>
            {hasChanges && <Badge variant="secondary">Unsaved</Badge>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Tweet Text</Label>
            <Textarea
              value={editedTexts[type] || ""}
              onChange={(e) =>
                setEditedTexts(prev => ({ ...prev, [type]: e.target.value }))
              }
              className="min-h-[250px] font-mono text-sm"
              placeholder="Write your promo tweet..."
            />
            <p className={`text-xs ${charCount > 280 ? "text-destructive" : "text-muted-foreground"}`}>
              {charCount}/280 characters
            </p>
            <div className="flex gap-2">
              <Button onClick={() => handleSaveTemplate(type)} disabled={saving || !hasChanges}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
              <Button
                variant="secondary"
                onClick={() => handlePostNow(type)}
                disabled={postingType === type || !editedTexts[type]?.trim() || hasChanges === true}
                title={hasChanges ? "Save changes before posting" : "Post this template now"}
              >
                {postingType === type ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Post Now
              </Button>
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4" />
              Preview
            </Label>
            <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap text-sm border min-h-[250px]">
              {editedTexts[type] || <span className="text-muted-foreground italic">Empty template</span>}
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
          Loading promo templates...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="w-5 h-5" />
          Promo Tweet Rotation
        </CardTitle>
        <CardDescription>
          6 promo templates that rotate automatically on your main feed. Enable the ones you want in rotation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Control bar */}
        <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg border bg-muted/50">
          <Button
            onClick={handleToggleRunning}
            variant={config?.is_running ? "destructive" : "default"}
            className="gap-2"
          >
            {config?.is_running ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {config?.is_running ? "Stop Rotation" : "Start Rotation"}
          </Button>

          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Label>Every</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={intervalInput}
              onChange={(e) => setIntervalInput(Number(e.target.value))}
              className="w-20"
            />
            <Label>hours</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveConfig}
              disabled={intervalInput === config?.interval_hours}
            >
              Set
            </Button>
          </div>

          <div className="flex items-center gap-2 ml-auto text-sm text-muted-foreground">
            <Badge variant={config?.is_running ? "default" : "secondary"}>
              {config?.is_running ? "🟢 Running" : "⏸ Stopped"}
            </Badge>
            <span>{enabledCount}/6 enabled</span>
            {config?.last_posted_type && (
              <span>• Last: {config.last_posted_type}</span>
            )}
            {config?.last_posted_at && (
              <span>• {new Date(config.last_posted_at).toLocaleString()}</span>
            )}
          </div>
        </div>

        {/* Promo tabs - second row */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            {PROMO_TABS.map(tab => (
              <TabsTrigger key={tab.key} value={tab.key} className="text-xs sm:text-sm">
                {tab.icon} {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {PROMO_TABS.map(tab => renderTab(tab.key, tab.label, tab.icon))}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default PromoTweetManager;
