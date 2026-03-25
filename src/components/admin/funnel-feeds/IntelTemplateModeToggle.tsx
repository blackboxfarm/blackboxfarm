import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";

export function IntelTemplateModeToggle() {
  const [mode, setMode] = useState<string>("active_only");
  const [lastUsed, setLastUsed] = useState<string>("large");
  const [loading, setLoading] = useState(true);

  const fetchConfig = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("holders_intel_config" as any)
      .select("key, value")
      .in("key", ["template_mode", "last_used_template"]);

    if (data) {
      const rows = data as any[];
      const modeRow = rows.find((r: any) => r.key === "template_mode");
      const lastRow = rows.find((r: any) => r.key === "last_used_template");
      if (modeRow) setMode(modeRow.value);
      if (lastRow) setLastUsed(lastRow.value);
    }
    setLoading(false);
  };

  useEffect(() => { fetchConfig(); }, []);

  const toggleMode = async (alternating: boolean) => {
    const newMode = alternating ? "alternating" : "active_only";
    const { error } = await supabase
      .from("holders_intel_config" as any)
      .update({ value: newMode, updated_at: new Date().toISOString() } as any)
      .eq("key", "template_mode");

    if (error) {
      toast({ title: "Error", description: "Failed to update template mode", variant: "destructive" });
    } else {
      setMode(newMode);
      toast({ title: "Updated", description: `Template mode: ${newMode === "alternating" ? "Alternating (small ↔ large)" : "Active template only"}` });
    }
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground text-sm"><RefreshCw className="h-4 w-4 animate-spin" /> Loading...</div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          𝕏 Post Template Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Alternating Templates</Label>
            <p className="text-xs text-muted-foreground">
              Swap between <strong>small</strong> and <strong>large</strong> formats on each post
            </p>
          </div>
          <Switch
            checked={mode === "alternating"}
            onCheckedChange={toggleMode}
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Current mode:</span>
          <Badge variant={mode === "alternating" ? "default" : "secondary"} className="text-xs">
            {mode === "alternating" ? "🔄 Alternating" : "📌 Active Only"}
          </Badge>
          {mode === "alternating" && (
            <>
              <span>•</span>
              <span>Next post will use: <strong>{lastUsed === "large" ? "small" : "large"}</strong></span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
