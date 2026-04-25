import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Save, Plus, Trash2 } from "lucide-react";
import { useMarketingProfiles, updateMarketingProfile } from "./useMarketingProfiles";
import { useToast } from "@/hooks/use-toast";

export function PositioningPanel() {
  const { data, loading, refetch } = useMarketingProfiles("positioning");
  const row = data[0];
  const { toast } = useToast();
  const [draft, setDraft] = useState<any>(null);

  useEffect(() => {
    if (row) setDraft({ ...row.data });
  }, [row]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading positioning…</div>;
  if (!row || !draft) return <div className="p-6 text-muted-foreground">No positioning record found.</div>;

  const save = async () => {
    try {
      await updateMarketingProfile(row.id, { data: draft });
      toast({ title: "Saved", description: "Positioning updated." });
      refetch();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  const updatePillar = (idx: number, field: "title" | "body", value: string) => {
    const pillars = [...(draft.differentiation_pillars ?? [])];
    pillars[idx] = { ...pillars[idx], [field]: value };
    setDraft({ ...draft, differentiation_pillars: pillars });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>🧭 Core Positioning</span>
            <Button onClick={save} size="sm"><Save className="w-4 h-4 mr-1" /> Save</Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Elevator pitch (one line)</label>
            <Input
              value={draft.elevator_pitch ?? ""}
              onChange={(e) => setDraft({ ...draft, elevator_pitch: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Value proposition</label>
            <Textarea
              rows={4}
              value={draft.value_proposition ?? ""}
              onChange={(e) => setDraft({ ...draft, value_proposition: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Differentiation pillars</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(draft.differentiation_pillars ?? []).map((p: any, i: number) => (
            <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/30">
              <div className="flex items-center gap-2">
                <Input
                  className="font-semibold"
                  value={p.title ?? ""}
                  onChange={(e) => updatePillar(i, "title", e.target.value)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const arr = [...draft.differentiation_pillars];
                    arr.splice(i, 1);
                    setDraft({ ...draft, differentiation_pillars: arr });
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <Textarea rows={2} value={p.body ?? ""} onChange={(e) => updatePillar(i, "body", e.target.value)} />
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft({
                ...draft,
                differentiation_pillars: [...(draft.differentiation_pillars ?? []), { title: "", body: "" }],
              })
            }
          >
            <Plus className="w-4 h-4 mr-1" /> Add pillar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What we are NOT</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={5}
            value={(draft.what_we_are_not ?? []).join("\n")}
            onChange={(e) =>
              setDraft({ ...draft, what_we_are_not: e.target.value.split("\n").filter(Boolean) })
            }
            placeholder="One per line"
          />
        </CardContent>
      </Card>
    </div>
  );
}