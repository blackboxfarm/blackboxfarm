import { useState } from "react";
import { useLauncherProfiles, useToggleProfile, useKillSwitch, useSetKillSwitch } from "@/hooks/useLauncherProfiles";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Plus, AlertOctagon } from "lucide-react";
import { AddLauncherDialog } from "./AddLauncherDialog";
import { LauncherProfileDetail } from "./LauncherProfileDetail";
import { toast } from "@/hooks/use-toast";

export default function LaunchersTab() {
  const { data: profiles, isLoading } = useLauncherProfiles();
  const toggle = useToggleProfile();
  const { data: kill } = useKillSwitch();
  const setKill = useSetKillSwitch();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const selected = profiles?.find((p) => p.id === selectedId) || profiles?.[0] || null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">🚀 Launchers — Dev Mint Sniper</h2>
          <p className="text-xs text-muted-foreground">Track active token launchers. Auto-buy on mint, auto-sell at target factor.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${kill?.killed ? "border-destructive bg-destructive/10" : "border-border"}`}>
            <AlertOctagon className={`h-4 w-4 ${kill?.killed ? "text-destructive" : "text-muted-foreground"}`} />
            <span className="text-xs font-medium">KILL ALL</span>
            <Switch checked={!!kill?.killed} onCheckedChange={async (v) => { try { await setKill.mutateAsync(v); toast({ title: v ? "All sniping HALTED" : "Sniping re-enabled" }); } catch (e: any) { toast({ title: e?.message, variant: "destructive" }); } }} />
          </div>
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Launcher</Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-3 space-y-2">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {(profiles || []).map((p) => {
            const isSel = (selected?.id) === p.id;
            return (
              <Card key={p.id} className={`p-3 cursor-pointer hover:bg-muted/40 transition ${isSel ? "border-primary" : ""}`} onClick={() => setSelectedId(p.id)}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{p.x_handle ? `@${p.x_handle}` : p.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{p.primary_dev_wallet?.slice(0, 6)}…{p.primary_dev_wallet?.slice(-4)}</div>
                    <div className="text-[10px] text-muted-foreground">{p.linked_wallets?.length || 0} wallets</div>
                  </div>
                  <Switch
                    checked={p.is_active}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={(v) => toggle.mutate({ id: p.id, is_active: v })}
                  />
                </div>
              </Card>
            );
          })}
          {!isLoading && !profiles?.length && (
            <div className="text-sm text-muted-foreground text-center p-6 border border-dashed rounded">
              No launchers yet. Click "Add Launcher".
            </div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-9">
          {selected ? <LauncherProfileDetail profile={selected} /> : (
            <div className="text-sm text-muted-foreground text-center p-12 border border-dashed rounded">
              Select or add a launcher.
            </div>
          )}
        </div>
      </div>

      <AddLauncherDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}