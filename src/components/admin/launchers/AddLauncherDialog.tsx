import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { invokeSpider } from "@/hooks/useLauncherProfiles";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

interface Props { open: boolean; onOpenChange: (v: boolean) => void }

export function AddLauncherDialog({ open, onOpenChange }: Props) {
  const [xHandle, setXHandle] = useState("");
  const [devWallet, setDevWallet] = useState("");
  const [tokenMint, setTokenMint] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  async function submit() {
    if (!xHandle && !devWallet && !tokenMint) {
      toast({ title: "Enter at least one identifier", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await invokeSpider({ xHandle: xHandle || undefined, devWallet: devWallet || undefined, tokenMint: tokenMint || undefined });
      toast({ title: "Launcher added", description: `${res?.walletCount ?? 0} wallets spidered` });
      qc.invalidateQueries({ queryKey: ["launcher-profiles"] });
      onOpenChange(false);
      setXHandle(""); setDevWallet(""); setTokenMint("");
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Launcher</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>X handle</Label><Input value={xHandle} onChange={(e) => setXHandle(e.target.value)} placeholder="pumpfun711" /></div>
          <div className="text-xs text-muted-foreground text-center">— or —</div>
          <div><Label>Dev wallet</Label><Input value={devWallet} onChange={(e) => setDevWallet(e.target.value)} placeholder="Ao...MFe" /></div>
          <div className="text-xs text-muted-foreground text-center">— or —</div>
          <div><Label>Token mint (spider from token)</Label><Input value={tokenMint} onChange={(e) => setTokenMint(e.target.value)} placeholder="...pump" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Spidering..." : "Add & Spider"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}