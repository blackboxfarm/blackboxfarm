import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Plus, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMarketingProfiles, updateMarketingProfile } from "./useMarketingProfiles";
import { useToast } from "@/hooks/use-toast";

const VALUES = ["yes", "warn", "no"];
const SYMBOLS: Record<string, string> = { yes: "✅", warn: "⚠️", no: "❌" };
const COLORS: Record<string, string> = {
  yes: "bg-green-500/15 text-green-700 hover:bg-green-500/25",
  warn: "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25",
  no: "bg-red-500/15 text-red-700 hover:bg-red-500/25",
};

export function CompetitiveMatrixPanel() {
  const { data, loading, refetch } = useMarketingProfiles("competitor");
  const row = data[0];
  const { toast } = useToast();
  const [draft, setDraft] = useState<any>(null);

  useEffect(() => {
    if (row) setDraft(JSON.parse(JSON.stringify(row.data)));
  }, [row]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!row || !draft) return <div className="p-6 text-muted-foreground">No matrix found.</div>;

  const competitors: string[] = draft.competitors ?? [];
  const rows: any[] = draft.rows ?? [];

  const cycleValue = (rIdx: number, cIdx: number) => {
    const cur = rows[rIdx].values[cIdx] ?? "no";
    const next = VALUES[(VALUES.indexOf(cur) + 1) % VALUES.length];
    const newRows = [...rows];
    newRows[rIdx] = { ...newRows[rIdx], values: [...newRows[rIdx].values] };
    newRows[rIdx].values[cIdx] = next;
    setDraft({ ...draft, rows: newRows });
  };

  const save = async () => {
    try {
      await updateMarketingProfile(row.id, { data: draft });
      toast({ title: "Saved" });
      refetch();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>🆚 Competitive Matrix</span>
          <Button onClick={save} size="sm"><Save className="w-4 h-4 mr-1" /> Save</Button>
        </CardTitle>
        <p className="text-sm text-muted-foreground">Click any cell to cycle ✅ → ⚠️ → ❌. The first competitor (BlackBox Farm) is us.</p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Capability</TableHead>
              {competitors.map((c, i) => (
                <TableHead key={i} className={`text-center ${i === 0 ? "font-bold text-primary" : ""}`}>
                  <Input
                    value={c}
                    onChange={(e) => {
                      const arr = [...competitors];
                      arr[i] = e.target.value;
                      setDraft({ ...draft, competitors: arr });
                    }}
                    className="h-7 text-xs text-center"
                  />
                </TableHead>
              ))}
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, rIdx) => (
              <TableRow key={rIdx}>
                <TableCell>
                  <Input
                    value={r.capability}
                    onChange={(e) => {
                      const newRows = [...rows];
                      newRows[rIdx] = { ...newRows[rIdx], capability: e.target.value };
                      setDraft({ ...draft, rows: newRows });
                    }}
                    className="h-7 text-sm"
                  />
                </TableCell>
                {competitors.map((_, cIdx) => {
                  const v = r.values?.[cIdx] ?? "no";
                  return (
                    <TableCell key={cIdx} className="text-center">
                      <button
                        onClick={() => cycleValue(rIdx, cIdx)}
                        className={`w-8 h-8 rounded-md text-lg transition-colors ${COLORS[v]}`}
                        title={v}
                      >{SYMBOLS[v]}</button>
                    </TableCell>
                  );
                })}
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => {
                    const newRows = [...rows];
                    newRows.splice(rIdx, 1);
                    setDraft({ ...draft, rows: newRows });
                  }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => setDraft({ ...draft, rows: [...rows, { capability: "New capability", values: competitors.map(() => "no") }] })}
        >
          <Plus className="w-4 h-4 mr-1" /> Add row
        </Button>
      </CardContent>
    </Card>
  );
}