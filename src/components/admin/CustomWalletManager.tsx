import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, Loader2, Copy, Wallet, Key, ExternalLink } from "lucide-react";

interface ManagedWallet {
  id: string;
  pubkey: string;
  nickname: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

interface CustomWalletManagerProps {
  onWalletsChange?: () => void;
}

export function CustomWalletManager({ onWalletsChange }: CustomWalletManagerProps) {
  const [managedWallets, setManagedWallets] = useState<ManagedWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<ManagedWallet | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Add wallet form
  const [privateKey, setPrivateKey] = useState("");
  const [nickname, setNickname] = useState("");

  const loadManagedWallets = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('rent-reclaimer-wallets', {
        body: { action: 'list' }
      });

      if (error) throw error;
      setManagedWallets(data.wallets || []);
    } catch (err: any) {
      console.error("Failed to load managed wallets:", err);
      toast.error("Failed to load wallets");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadManagedWallets();
  }, []);

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

      toast.success(`Wallet ${data.wallet.pubkey.slice(0, 8)}... added successfully`);
      setPrivateKey("");
      setNickname("");
      setIsAddDialogOpen(false);
      loadManagedWallets();
      onWalletsChange?.();
    } catch (err: any) {
      console.error("Failed to add wallet:", err);
      toast.error(err.message || "Failed to add wallet");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateWallet = async () => {
    if (!editingWallet) return;

    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('rent-reclaimer-wallets', {
        body: { 
          action: 'update',
          id: editingWallet.id,
          nickname: editingWallet.nickname,
          is_active: editingWallet.is_active,
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success("Wallet updated");
      setIsEditDialogOpen(false);
      setEditingWallet(null);
      loadManagedWallets();
      onWalletsChange?.();
    } catch (err: any) {
      console.error("Failed to update wallet:", err);
      toast.error(err.message || "Failed to update wallet");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWallet = async (wallet: ManagedWallet) => {
    if (!confirm(`Delete wallet ${wallet.nickname || wallet.pubkey.slice(0, 8) + '...'}?`)) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('rent-reclaimer-wallets', {
        body: { action: 'delete', id: wallet.id }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success("Wallet deleted");
      loadManagedWallets();
      onWalletsChange?.();
    } catch (err: any) {
      console.error("Failed to delete wallet:", err);
      toast.error(err.message || "Failed to delete wallet");
    }
  };

  const handleToggleActive = async (wallet: ManagedWallet) => {
    try {
      const { data, error } = await supabase.functions.invoke('rent-reclaimer-wallets', {
        body: { 
          action: 'update',
          id: wallet.id,
          is_active: !wallet.is_active,
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success(wallet.is_active ? "Wallet disabled" : "Wallet enabled");
      loadManagedWallets();
      onWalletsChange?.();
    } catch (err: any) {
      console.error("Failed to toggle wallet:", err);
      toast.error(err.message || "Failed to update wallet");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const openInExplorer = (pubkey: string) => {
    window.open(`https://solscan.io/account/${pubkey}`, '_blank');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Key className="h-6 w-6 text-amber-500" />
            <div>
              <CardTitle>Import Custom Wallets</CardTitle>
              <CardDescription>
                Import external wallets by private key for scanning and operations
              </CardDescription>
            </div>
          </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-amber-600 hover:bg-amber-700">
                <Plus className="h-4 w-4 mr-2" />
                Import Wallet
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
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : managedWallets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Wallet className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No custom wallets imported yet</p>
            <p className="text-sm mt-2">Click "Import Wallet" to add external wallets</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nickname</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managedWallets.map((wallet) => (
                  <TableRow key={wallet.id}>
                    <TableCell className="font-medium">
                      {wallet.nickname || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {wallet.pubkey}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(wallet.pubkey)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => openInExplorer(wallet.pubkey)}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={wallet.is_active}
                        onCheckedChange={() => handleToggleActive(wallet)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingWallet(wallet);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteWallet(wallet)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Wallet</DialogTitle>
            <DialogDescription>
              Update the wallet nickname or status.
            </DialogDescription>
          </DialogHeader>
          {editingWallet && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Address</Label>
                <code className="block text-xs bg-muted px-3 py-2 rounded font-mono break-all">
                  {editingWallet.pubkey}
                </code>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editNickname">Nickname</Label>
                <Input
                  id="editNickname"
                  placeholder="My trading wallet"
                  value={editingWallet.nickname || ''}
                  onChange={(e) => setEditingWallet({ ...editingWallet, nickname: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="editActive">Active</Label>
                <Switch
                  id="editActive"
                  checked={editingWallet.is_active}
                  onCheckedChange={(checked) => setEditingWallet({ ...editingWallet, is_active: checked })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateWallet} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
