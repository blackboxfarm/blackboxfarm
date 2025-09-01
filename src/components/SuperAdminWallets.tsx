import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Copy, Plus, Shield, Wallet, AlertTriangle, Key, DollarSign } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SuperAdminWallet {
  id: string;
  label: string;
  pubkey: string;
  wallet_type: 'treasury' | 'campaign_funding' | 'refund_processing' | 'emergency';
  is_active: boolean;
  created_at: string;
}

export function SuperAdminWallets() {
  const [wallets, setWallets] = useState<SuperAdminWallet[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWallet, setNewWallet] = useState({
    label: "",
    wallet_type: "treasury" as const
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const walletTypes = [
    {
      value: "treasury",
      label: "Treasury Wallet",
      description: "Main platform treasury for revenue collection",
      icon: <DollarSign className="h-4 w-4" />,
      color: "bg-green-100 text-green-800"
    },
    {
      value: "campaign_funding",
      label: "Campaign Funding", 
      description: "Receives initial funding for new campaigns",
      icon: <Wallet className="h-4 w-4" />,
      color: "bg-blue-100 text-blue-800"
    },
    {
      value: "refund_processing",
      label: "Refund Processing",
      description: "Handles refunds and withdrawals",
      icon: <Shield className="h-4 w-4" />,
      color: "bg-purple-100 text-purple-800"
    },
    {
      value: "emergency",
      label: "Emergency Wallet",
      description: "Emergency access for critical operations",
      icon: <AlertTriangle className="h-4 w-4" />,
      color: "bg-red-100 text-red-800"
    }
  ];

  useEffect(() => {
    loadSuperAdminWallets();
  }, []);

  const loadSuperAdminWallets = async () => {
    try {
      // Using any type since Supabase types aren't updated yet
      const { data, error } = await (supabase as any)
        .from('super_admin_wallets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWallets(data || []);
    } catch (error: any) {
      toast({ 
        title: "Error loading wallets", 
        description: error.message 
      });
    }
  };

  const generateSuperAdminWallet = async () => {
    if (!newWallet.label.trim()) {
      toast({ title: "Missing label", description: "Please provide a wallet label" });
      return;
    }

    setIsGenerating(true);

    try {
      // Generate new keypair
      const keypair = Keypair.generate();
      const pubkey = keypair.publicKey.toBase58();
      const secretKey = bs58.encode(keypair.secretKey);

      // Store in database (encrypted)
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await (supabase as any)
        .from('super_admin_wallets')
        .insert({
          label: newWallet.label,
          pubkey: pubkey,
          secret_key_encrypted: secretKey, // This will be encrypted by database trigger
          wallet_type: newWallet.wallet_type,
          created_by: user?.id,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      toast({ 
        title: "Super Admin wallet created", 
        description: `${newWallet.label} generated successfully` 
      });

      // Show the secret key to the user (one time only)
      navigator.clipboard.writeText(secretKey);
      toast({
        title: "Secret key copied!",
        description: "The secret key has been copied to clipboard. Store it securely - it won't be shown again.",
      });

      setNewWallet({ label: "", wallet_type: "treasury" });
      setShowCreateForm(false);
      loadSuperAdminWallets();

    } catch (error: any) {
      toast({ 
        title: "Error creating wallet", 
        description: error.message 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard` });
  };

  const toggleWalletStatus = async (wallet: SuperAdminWallet) => {
    try {
      const { error } = await (supabase as any)
        .from('super_admin_wallets')
        .update({ is_active: !wallet.is_active })
        .eq('id', wallet.id);

      if (error) throw error;

      toast({ 
        title: wallet.is_active ? "Wallet deactivated" : "Wallet activated",
        description: `${wallet.label} status updated`
      });

      loadSuperAdminWallets();
    } catch (error: any) {
      toast({ 
        title: "Error updating wallet", 
        description: error.message 
      });
    }
  };

  const getWalletTypeInfo = (type: string) => {
    return walletTypes.find(t => t.value === type) || walletTypes[0];
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Super Admin Wallets</CardTitle>
            </div>
            <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Wallet
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Generate Super Admin Wallet</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                  <Alert>
                    <Key className="h-4 w-4" />
                    <AlertDescription>
                      Super Admin wallets are used for platform operations. The private key will only be shown once during creation.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <Label>Wallet Label</Label>
                    <Input
                      placeholder="e.g., Main Treasury 2024"
                      value={newWallet.label}
                      onChange={(e) => setNewWallet(prev => ({ ...prev, label: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Wallet Type</Label>
                    <div className="grid gap-2">
                      {walletTypes.map((type) => (
                        <div
                          key={type.value}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            newWallet.wallet_type === type.value 
                              ? "border-primary bg-primary/5" 
                              : "hover:border-primary/50"
                          }`}
                          onClick={() => setNewWallet(prev => ({ ...prev, wallet_type: type.value as any }))}
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-primary">{type.icon}</div>
                            <div>
                              <div className="font-medium">{type.label}</div>
                              <div className="text-sm text-muted-foreground">{type.description}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button 
                    onClick={generateSuperAdminWallet}
                    disabled={isGenerating || !newWallet.label.trim()}
                    className="w-full"
                  >
                    {isGenerating ? "Generating..." : "Generate Super Admin Wallet"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {wallets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No Super Admin wallets generated yet.</p>
              <p className="text-sm">Create platform wallets for treasury, funding, and emergency operations.</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {wallets.map((wallet) => {
                const typeInfo = getWalletTypeInfo(wallet.wallet_type);
                return (
                  <Card key={wallet.id} className="border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="text-primary">{typeInfo.icon}</div>
                            <h3 className="font-medium">{wallet.label}</h3>
                            <Badge className={typeInfo.color}>
                              {typeInfo.label}
                            </Badge>
                            <Badge variant={wallet.is_active ? "default" : "secondary"}>
                              {wallet.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Public Key:</span>
                              <code className="text-sm bg-muted px-2 py-1 rounded flex-1">
                                {wallet.pubkey}
                              </code>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyToClipboard(wallet.pubkey, "Public key")}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            
                            <div className="text-xs text-muted-foreground">
                              Created: {new Date(wallet.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleWalletStatus(wallet)}
                          >
                            {wallet.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Super Admin Wallet Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            {walletTypes.map((type) => (
              <div key={type.value} className="flex items-start gap-3 p-3 border rounded-lg">
                <div className="text-primary mt-0.5">{type.icon}</div>
                <div>
                  <h4 className="font-medium">{type.label}</h4>
                  <p className="text-sm text-muted-foreground">{type.description}</p>
                  <div className="text-xs text-muted-foreground mt-1">
                    {type.value === "treasury" && "Use for: Revenue collection, profit storage"}
                    {type.value === "campaign_funding" && "Use for: Initial campaign funding, client payments"}
                    {type.value === "refund_processing" && "Use for: Processing refunds, campaign cancellations"}
                    {type.value === "emergency" && "Use for: Emergency operations, recovery scenarios"}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Security Notice:</strong> Super Admin wallet private keys are encrypted and stored securely. 
              Only generate wallets when needed and store backup copies in secure, offline locations.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}