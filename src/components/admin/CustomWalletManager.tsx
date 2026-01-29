import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Loader2, Key } from "lucide-react";

interface CustomWalletManagerProps {
  onWalletsChange?: () => void;
}

export function CustomWalletManager({ onWalletsChange }: CustomWalletManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Add wallet form
  const [privateKey, setPrivateKey] = useState("");
  const [nickname, setNickname] = useState("");

  const handleAddWallet = async () => {
    if (!privateKey.trim()) {
      toast.error("Please enter a private key");
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('rent-reclaimer-wallets', {
        body: { 
          action: 'add',
          privateKey: privateKey.trim(),
          nickname: nickname.trim() || null,
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success(`Wallet ${data.wallet.pubkey.slice(0, 8)}... imported successfully`);
      setPrivateKey("");
      setNickname("");
      setIsAddDialogOpen(false);
      onWalletsChange?.();
    } catch (err: any) {
      console.error("Failed to add wallet:", err);
      toast.error(err.message || "Failed to add wallet");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-amber-600 text-amber-600 hover:bg-amber-600 hover:text-white">
          <Plus className="h-4 w-4 mr-2" />
          Import Custom Wallet
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Import Wallet
          </DialogTitle>
          <DialogDescription>
            Import a wallet by entering its private key. The key will be encrypted and stored securely.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="nickname">Nickname (optional)</Label>
            <Input
              id="nickname"
              placeholder="My trading wallet"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="privateKey">Private Key</Label>
            <Textarea
              id="privateKey"
              placeholder="Enter base58 private key or JSON array..."
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="font-mono text-xs min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">
              Supports base58 format or JSON array format. Key will be encrypted with AES-GCM.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleAddWallet} 
            disabled={isSaving || !privateKey.trim()}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Import Wallet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
