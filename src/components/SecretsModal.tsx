import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocalSecrets } from "@/hooks/useLocalSecrets";
import { toast } from "@/hooks/use-toast";

const fieldClass = "space-y-2";

const SecretsModal: React.FC = () => {
  const { secrets, ready, update, reset } = useLocalSecrets();
  const [open, setOpen] = React.useState(false);
  const [rpcUrl, setRpcUrl] = React.useState(secrets?.rpcUrl ?? "");
  const [pk, setPk] = React.useState(secrets?.tradingPrivateKey ?? "");

  React.useEffect(() => {
    if (open) {
      // refresh values from storage when opening
      setRpcUrl(secrets?.rpcUrl ?? "");
      setPk(secrets?.tradingPrivateKey ?? "");
    }
  }, [open, secrets]);

  const handleSave = () => {
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
    update({ rpcUrl: rpcUrl.trim(), tradingPrivateKey: pk.trim() });
    toast({ title: "Secrets saved", description: "Stored locally in your browser only." });
    setOpen(false);
  };

  const handleClear = () => {
    reset();
    toast({ title: "Secrets cleared", description: "Local secrets were removed from this browser." });
    setRpcUrl("");
    setPk("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={ready ? "secondary" : "default"}>{ready ? "Secrets: Set" : "Set Secrets"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trading Secrets (Local)</DialogTitle>
          <DialogDescription>
            These values are stored only in your browser via localStorage. They are not uploaded.
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
