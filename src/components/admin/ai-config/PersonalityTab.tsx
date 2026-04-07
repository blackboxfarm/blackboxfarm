import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, Save, Power, Plus, X } from "lucide-react";

interface PersonalityConfig {
  persona_name: string;
  persona_description: string;
  tone: string;
  expertise_areas: string[];
  language_behavior: string;
  greeting_template: string;
  fallback_response: string;
  max_response_length: number;
  is_active: boolean;
}

export const PersonalityTab: React.FC = () => {
  const [config, setConfig] = useState<PersonalityConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newExpertise, setNewExpertise] = useState("");

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data, error } = await supabase
      .from("bot_personality_config")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      console.error("Error fetching personality config:", error);
      toast.error("Failed to load personality config");
    } else {
      setConfig(data);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    const { error } = await supabase
      .from("bot_personality_config")
      .update({
        persona_name: config.persona_name,
        persona_description: config.persona_description,
        tone: config.tone,
        expertise_areas: config.expertise_areas,
        language_behavior: config.language_behavior,
        greeting_template: config.greeting_template,
        fallback_response: config.fallback_response,
        max_response_length: config.max_response_length,
        is_active: config.is_active,
      })
      .eq("id", 1);

    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success("Personality config saved!");
    }
    setSaving(false);
  };

  const addExpertise = () => {
    if (!newExpertise.trim() || !config) return;
    setConfig({ ...config, expertise_areas: [...config.expertise_areas, newExpertise.trim()] });
    setNewExpertise("");
  };

  const removeExpertise = (index: number) => {
    if (!config) return;
    setConfig({ ...config, expertise_areas: config.expertise_areas.filter((_, i) => i !== index) });
  };

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!config) return <div className="text-center py-8 text-muted-foreground">No configuration found</div>;

  return (
    <div className="space-y-6">
      {/* Kill Switch */}
      <Card className={!config.is_active ? "border-destructive/50 bg-destructive/5" : "border-green-500/30 bg-green-500/5"}>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Power className={`h-5 w-5 ${config.is_active ? 'text-green-500' : 'text-destructive'}`} />
            <div>
              <p className="font-medium">{config.is_active ? "AI Chat is ACTIVE" : "AI Chat is DISABLED"}</p>
              <p className="text-sm text-muted-foreground">Toggle to enable/disable all AI chat interactions</p>
            </div>
          </div>
          <Switch checked={config.is_active} onCheckedChange={(v) => setConfig({ ...config, is_active: v })} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> Identity</CardTitle>
            <CardDescription>Who is the bot?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Persona Name</Label>
              <Input value={config.persona_name} onChange={(e) => setConfig({ ...config, persona_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Persona Description</Label>
              <Textarea rows={5} value={config.persona_description} onChange={(e) => setConfig({ ...config, persona_description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tone</Label>
              <Input value={config.tone} onChange={(e) => setConfig({ ...config, tone: e.target.value })} placeholder="e.g. friendly, casual, emoji-rich" />
            </div>
          </CardContent>
        </Card>

        {/* Expertise Areas */}
        <Card>
          <CardHeader>
            <CardTitle>Expertise Areas</CardTitle>
            <CardDescription>Topics the bot claims expertise in</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {config.expertise_areas.map((area, i) => (
                <Badge key={i} variant="secondary" className="flex items-center gap-1 py-1">
                  {area}
                  <button onClick={() => removeExpertise(i)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newExpertise} onChange={(e) => setNewExpertise(e.target.value)} placeholder="Add expertise area" onKeyDown={(e) => e.key === 'Enter' && addExpertise()} />
              <Button variant="outline" size="sm" onClick={addExpertise}><Plus className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>

        {/* Language & Templates */}
        <Card>
          <CardHeader>
            <CardTitle>Language & Templates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Language Behavior</Label>
              <Textarea rows={2} value={config.language_behavior} onChange={(e) => setConfig({ ...config, language_behavior: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Greeting Template</Label>
              <Textarea rows={3} value={config.greeting_template} onChange={(e) => setConfig({ ...config, greeting_template: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Fallback Response</Label>
              <Textarea rows={3} value={config.fallback_response} onChange={(e) => setConfig({ ...config, fallback_response: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        {/* Response Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Response Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Max Response Length: {config.max_response_length} words</Label>
              <Slider
                value={[config.max_response_length]}
                onValueChange={([v]) => setConfig({ ...config, max_response_length: v })}
                min={50}
                max={2000}
                step={50}
              />
              <p className="text-xs text-muted-foreground">Instructs the AI to keep responses under this word count</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Personality Config"}
        </Button>
      </div>
    </div>
  );
};
