import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserSecrets } from "@/hooks/useUserSecrets";
import { toast } from "@/hooks/use-toast";

const fieldClass = "space-y-2";

const SecretsModal: React.FC = () => {
  const { secrets, ready, update, reset, isLoading } = useUserSecrets();
  const [open, setOpen] = React.useState(false);
  const [rpcUrl, setRpcUrl] = React.useState(secrets?.rpcUrl ?? "");
  const [pk, setPk] = React.useState(secrets?.tradingPrivateKey ?? "");
  const [fnToken, setFnToken] = React.useState(secrets?.functionToken ?? "");

  React.useEffect(() => {
    if (open) {
      // refresh values from storage when opening
      setRpcUrl(secrets?.rpcUrl ?? "");
      setPk(secrets?.tradingPrivateKey ?? "");
      setFnToken(secrets?.functionToken ?? "");
    }
  }, [open, secrets]);

  const handleSave = async () => {
    if (!rpcUrl || !pk) {
      toast({ title: "Missing values", description: "Enter both RPC URL and private key." });
      return;
    }
    try {
      const u = new URL(rpcUrl);
      if (u.protocol !== "https:") throw new Error("Only HTTPS URLs are allowed");
    } catch (e) {
      toast({ title: "Invalid RPC URL", description: "Provide a valid HTTPS RPC endpoint." });
      return;
    }
    
    try {
      await update({ rpcUrl: rpcUrl.trim(), tradingPrivateKey: pk.trim(), functionToken: fnToken.trim() || undefined });
      toast({ title: "Secrets saved", description: "Saved to database successfully." });
      setOpen(false);
    } catch (error) {
      toast({ title: "Save failed", description: "Could not save secrets to database." });
    }
  };

  const handleClear = async () => {
    try {
      await reset();
      toast({ title: "Secrets cleared", description: "Secrets were removed from database." });
      setRpcUrl("");
      setPk("");
      setFnToken("");
    } catch (error) {
      toast({ title: "Clear failed", description: "Could not clear secrets from database." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={ready ? "secondary" : "default"}>{ready ? "Secrets: Set" : "Set Secrets"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trading Secrets</DialogTitle>
          <DialogDescription>
            These values are encrypted and stored securely in the database.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className={fieldClass}>
            <Label htmlFor="rpc">RPC URL (HTTPS)</Label>
            <Input id="rpc" placeholder="https://..." value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} />
          </div>
          <div className={fieldClass}>
            <Label htmlFor="pk">Private Key (base58 or JSON array)</Label>
            <Input id="pk" placeholder="Base58 or [1,2,3,...]" value={pk} onChange={(e) => setPk(e.target.value)} />
          </div>
          <div className={fieldClass}>
            <Label htmlFor="ft">Function Token (optional, must match Supabase secret)</Label>
            <Input id="ft" placeholder="Leave empty if not set server-side" value={fnToken} onChange={(e) => setFnToken(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleSave}>Save</Button>
            <Button variant="secondary" onClick={handleClear}>Clear</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SecretsModal;
