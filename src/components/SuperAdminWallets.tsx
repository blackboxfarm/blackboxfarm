import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Copy, Plus, Shield, Wallet, AlertTriangle, Key, DollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { WalletTokenManager } from "@/components/blackbox/WalletTokenManager";

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
  const [expandedWallets, setExpandedWallets] = useState<Set<string>>(new Set());

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
    
    // Set up real-time subscription for wallet updates
    const channel = supabase
      .channel('super_admin_wallets_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'super_admin_wallets'
        },
        () => {
          console.log('Super admin wallets updated, reloading...');
          loadSuperAdminWallets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadSuperAdminWallets = async () => {
    try {
      // Use edge function to load wallets with proper authentication
      const { data: response, error } = await supabase.functions.invoke('super-admin-wallet-generator', {
        method: 'GET'
      });

      if (error) throw error;
      setWallets(response?.data || []);
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

      // Get auth token for edge function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Call edge function to create wallet securely
      const { data, error } = await supabase.functions.invoke('super-admin-wallet-generator', {
        body: {
          label: newWallet.label,
          wallet_type: newWallet.wallet_type,
          pubkey: pubkey,
          secret_key_encrypted: secretKey
        }
      });

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

  const toggleWalletExpansion = (walletId: string) => {
    setExpandedWallets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(walletId)) {
        newSet.delete(walletId);
      } else {
        newSet.add(walletId);
      }
      return newSet;
    });
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
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {wallets.map((wallet) => {
                const typeInfo = getWalletTypeInfo(wallet.wallet_type);
                const isExpanded = expandedWallets.has(wallet.id);
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
                              <button
                                onClick={() => copyToClipboard(wallet.pubkey, "Public key")}
                                className="font-mono text-sm bg-muted px-2 py-1 rounded hover:bg-muted/80 transition-colors cursor-pointer text-left flex-1"
                                title="Click to copy full address"
                              >
                                {wallet.pubkey}
                              </button>
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
                            onClick={() => toggleWalletExpansion(wallet.id)}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            Tokens
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleWalletStatus(wallet)}
                          >
                            {wallet.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </div>
                      
                      <Collapsible open={isExpanded}>
                        <CollapsibleContent className="mt-4 border-t pt-4">
                          <WalletTokenManager
                            walletId={wallet.id}
                            walletPubkey={wallet.pubkey}
                            onTokensSold={() => {
                              // Optional callback when tokens are sold
                              toast({
                                title: "Tokens sold",
                                description: "Wallet tokens have been processed"
                              });
                            }}
                          />
                        </CollapsibleContent>
                      </Collapsible>
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