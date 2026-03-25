import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Megaphone } from "lucide-react";

export function AdvertTemplateConfig() {
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState("5");
  const [postCounter, setPostCounter] = useState("0");
  const [lastXTemplate, setLastXTemplate] = useState("x_advert_1");
  const [lastTgTemplate, setLastTgTemplate] = useState("tg_advert_1");
  const [loading, setLoading] = useState(true);

  const fetchConfig = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("holders_intel_config" as any)
      .select("key, value")
      .in("key", ["advert_enabled", "advert_frequency", "advert_post_counter", "advert_last_x_template", "advert_last_tg_template"]);

    if (data) {
      const rows = data as any[];
      const find = (k: string) => rows.find((r: any) => r.key === k)?.value;
      setEnabled(find("advert_enabled") === "true");
      setFrequency(find("advert_frequency") || "5");
      setPostCounter(find("advert_post_counter") || "0");
      setLastXTemplate(find("advert_last_x_template") || "x_advert_1");
      setLastTgTemplate(find("advert_last_tg_template") || "tg_advert_1");
    }
    setLoading(false);
  };

  useEffect(() => { fetchConfig(); }, []);

  const updateConfig = async (key: string, value: string) => {
    const { error } = await supabase
      .from("holders_intel_config" as any)
      .update({ value, updated_at: new Date().toISOString() } as any)
      .eq("key", key);

    if (error) {
      toast({ title: "Error", description: `Failed to update ${key}`, variant: "destructive" });
      return false;
    }
    return true;
  };

  const toggleEnabled = async (checked: boolean) => {
    const ok = await updateConfig("advert_enabled", checked ? "true" : "false");
    if (ok) {
      setEnabled(checked);
      toast({ title: "Updated", description: `Advert interleaving ${checked ? "enabled" : "disabled"}` });
    }
  };

  const changeFrequency = async (val: string) => {
    const ok = await updateConfig("advert_frequency", val);
    if (ok) {
      setFrequency(val);
      toast({ title: "Updated", description: `Advert frequency set to every ${val} posts` });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading advert config...
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4" />
          Advert Interleaving
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Enable Advert Posts</Label>
            <p className="text-xs text-muted-foreground">
              Interleave advert templates between normal intel posts on both X and TG
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={toggleEnabled} />
        </div>

        {/* Frequency selector */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Frequency</Label>
            <p className="text-xs text-muted-foreground">
              Insert an advert every N normal posts
            </p>
          </div>
          <Select value={frequency} onValueChange={changeFrequency}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Every 3 posts</SelectItem>
              <SelectItem value="5">Every 5 posts</SelectItem>
              <SelectItem value="10">Every 10 posts</SelectItem>
              <SelectItem value="15">Every 15 posts</SelectItem>
              <SelectItem value="20">Every 20 posts</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status info */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
          <Badge variant={enabled ? "default" : "secondary"} className="text-xs">
            {enabled ? "🟢 Active" : "⏸ Disabled"}
          </Badge>
          <span>•</span>
          <span>Posts since last ad: <strong>{postCounter}</strong> / {frequency}</span>
          <span>•</span>
          <span>Next X ad: <strong>{lastXTemplate === "x_advert_1" ? "Advert 2" : "Advert 1"}</strong></span>
          <span>•</span>
          <span>Next TG ad: <strong>{lastTgTemplate === "tg_advert_1" ? "Advert 2" : "Advert 1"}</strong></span>
        </div>
      </CardContent>
    </Card>
  );
}
