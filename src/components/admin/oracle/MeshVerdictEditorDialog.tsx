import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save, Trash2, AlertTriangle } from "lucide-react";

interface MeshRow {
  id: string;
  source_type: string;
  source_id: string;
  linked_type: string;
  linked_id: string;
  relationship: string;
  confidence: number;
  evidence: any;
  discovered_via: string | null;
  discovered_at: string;
}

interface Props {
  row: MeshRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const KNOWN_RELATIONSHIPS = [
  "created_token",
  "good_actor_creator",
  "recovering_actor_creator",
  "created_rejected_token",
  "created_rug_token",
  "created_loss_token",
  "confirmed_bad",
  "directly_funded",
  "indirectly_funded",
  "funded_by",
  "funded_rejected_dev",
  "social_account_of",
  "website_of",
  "official_website",
  "official_twitter",
  "official_telegram",
  "community_for",
  "community_admin",
  "community_mod",
  "co_mod",
  "same_kyc_root",
  "same_team",
  "promotes_token",
];

export default function MeshVerdictEditorDialog({ row, open, onOpenChange, onSaved }: Props) {
  const [relationship, setRelationship] = useState("");
  const [customRel, setCustomRel] = useState("");
  const [confidence, setConfidence] = useState(50);
  const [evidenceText, setEvidenceText] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (row) {
      const isKnown = KNOWN_RELATIONSHIPS.includes(row.relationship);
      setRelationship(isKnown ? row.relationship : "__custom__");
      setCustomRel(isKnown ? "" : row.relationship);
      setConfidence(Math.max(0, Math.min(100, row.confidence ?? 50)));
      try {
        setEvidenceText(JSON.stringify(row.evidence ?? {}, null, 2));
      } catch {
        setEvidenceText("{}");
      }
      setAdminNote("");
      setConfirmDelete(false);
    }
  }, [row]);

  if (!row) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      // Validate JSON locally first
      let evidenceObj: any;
      try {
        evidenceObj = JSON.parse(evidenceText);
      } catch (e: any) {
        toast.error("Evidence must be valid JSON: " + e.message);
        setSaving(false);
        return;
      }

      const finalRel = relationship === "__custom__" ? customRel.trim() : relationship;
      if (!finalRel) {
        toast.error("Relationship is required");
        setSaving(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("mesh-verdict-edit", {
        body: {
          id: row.id,
          action: "update",
          relationship: finalRel,
          confidence,
          evidence: evidenceObj,
          admin_note: adminNote || null,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "update failed");
      toast.success("Mesh row updated");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Save failed: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("mesh-verdict-edit", {
        body: { id: row.id, action: "delete" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "delete failed");
      toast.success("Mesh row deleted");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Delete failed: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Mesh Verdict
            <Badge variant="outline" className="text-xs font-mono">{row.id.slice(0, 8)}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Read-only info */}
          <div className="border rounded-md p-3 bg-muted/30 text-xs space-y-1">
            <div><span className="text-muted-foreground">Source:</span> <Badge variant="outline" className="ml-1 text-xs">{row.source_type}</Badge> <span className="font-mono break-all">{row.source_id}</span></div>
            <div><span className="text-muted-foreground">Linked:</span> <Badge variant="outline" className="ml-1 text-xs">{row.linked_type}</Badge> <span className="font-mono break-all">{row.linked_id}</span></div>
            <div><span className="text-muted-foreground">Discovered via:</span> {row.discovered_via || "—"}</div>
            <div><span className="text-muted-foreground">Discovered at:</span> {new Date(row.discovered_at).toLocaleString()}</div>
          </div>

          {/* Relationship */}
          <div>
            <label className="text-sm font-medium mb-1 block">Relationship</label>
            <Select value={relationship} onValueChange={setRelationship}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {KNOWN_RELATIONSHIPS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
                <SelectItem value="__custom__">— Custom —</SelectItem>
              </SelectContent>
            </Select>
            {relationship === "__custom__" && (
              <Input
                placeholder="Enter custom relationship..."
                value={customRel}
                onChange={(e) => setCustomRel(e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          {/* Confidence */}
          <div>
            <label className="text-sm font-medium mb-1 block">Confidence: {confidence}%</label>
            <Slider value={[confidence]} onValueChange={(v) => setConfidence(v[0])} min={0} max={100} step={1} />
          </div>

          {/* Admin note */}
          <div>
            <label className="text-sm font-medium mb-1 block">Admin Note (optional, recorded in audit trail)</label>
            <Input
              placeholder="Why are you editing this row?"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
            />
          </div>

          {/* Evidence JSON */}
          <div>
            <label className="text-sm font-medium mb-1 block">Evidence (JSON)</label>
            <Textarea
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            variant={confirmDelete ? "destructive" : "outline"}
            onClick={handleDelete}
            disabled={saving}
            className={confirmDelete ? "" : "border-destructive/50 text-destructive hover:bg-destructive/10"}
          >
            {confirmDelete ? <AlertTriangle className="h-4 w-4 mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            {confirmDelete ? "Confirm Delete" : "Delete Row"}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
