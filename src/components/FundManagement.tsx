import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertCircle, ArrowLeftRight, Users, Wallet, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { refundToFunder, splitEvenly } from "@/lib/solana";
import { toast } from "@/hooks/use-toast";
import { useLocalSecrets } from "@/hooks/useLocalSecrets";

interface FundManagementProps {
  wallets: Array<{
    pubkey: string;
    secretBase58?: string;
    balance?: number;
  }>;
  onWalletUpdate: () => void;
}

export function FundManagement({ wallets, onWalletUpdate }: FundManagementProps) {
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [customAddress, setCustomAddress] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const { secrets } = useLocalSecrets();

  const fundManagementOptions = [
    {
      id: "refund_all",
      title: "Refund All to Original Funders",
      description: "Automatically detect and refund each wallet to its original funder",
      icon: <RefreshCw className="h-5 w-5" />,
      risk: "low"
    },
    {
      id: "refund_custom",
      title: "Refund All to Custom Address", 
      description: "Send all remaining funds to a specific address you provide",
      icon: <Wallet className="h-5 w-5" />,
      risk: "medium"
    },
    {
      id: "redistribute",
      title: "Redistribute Among Remaining Wallets",
      description: "Split funds from selected wallets among the remaining active wallets",
      icon: <ArrowLeftRight className="h-5 w-5" />,
      risk: "low"
    },
    {
      id: "treasury_transfer",
      title: "Transfer to Platform Treasury",
      description: "Send funds to the platform's treasury wallet for later distribution",
      icon: <Users className="h-5 w-5" />,
      risk: "high"
    }
  ];

  const handleFundManagement = async () => {
    if (!secrets?.rpcUrl) {
      toast({ title: "RPC missing", description: "Set RPC URL in Secrets" });
      return;
    }

    if (!selectedAction) {
      toast({ title: "No action selected", description: "Please select a fund management option" });
      return;
    }

    setIsProcessing(true);

    try {
      const connection = new Connection(secrets.rpcUrl, { commitment: "confirmed" });
      const processWallets = selectedWallets.length > 0 
        ? wallets.filter(w => selectedWallets.includes(w.pubkey))
        : wallets;

      for (const wallet of processWallets) {
        if (!wallet.secretBase58) {
          toast({ title: "Key unavailable", description: `${wallet.pubkey.slice(0, 8)}... secret not loaded client-side` });
          continue;
        }
        const owner = Keypair.fromSecretKey(bs58.decode(wallet.secretBase58));
        
        switch (selectedAction) {
          case "refund_all":
            const refundSig = await refundToFunder({ connection, owner });
            if (refundSig) {
              toast({ 
                title: "Refund successful", 
                description: `${wallet.pubkey.slice(0, 8)}... refunded to original funder` 
              });
            }
            break;

          case "refund_custom":
            if (!customAddress) {
              toast({ title: "No address provided", description: "Please enter a custom address" });
              return;
            }
            const customRefundSig = await refundToFunder({ 
              connection, 
              owner, 
              overrideDestination: new PublicKey(customAddress) 
            });
            if (customRefundSig) {
              toast({ 
                title: "Custom refund successful", 
                description: `${wallet.pubkey.slice(0, 8)}... sent to custom address` 
              });
            }
            break;

          case "redistribute":
            const remainingWallets = wallets
              .filter(w => !selectedWallets.includes(w.pubkey))
              .map(w => new PublicKey(w.pubkey));
            
            if (remainingWallets.length === 0) {
              toast({ title: "No target wallets", description: "Select some wallets to keep for redistribution" });
              return;
            }

            const splitSig = await splitEvenly({ connection, owner, targets: remainingWallets });
            if (splitSig) {
              toast({ 
                title: "Redistribution successful", 
                description: `${wallet.pubkey.slice(0, 8)}... funds redistributed` 
              });
            }
            break;

          case "treasury_transfer":
            // This would need the platform treasury address
            toast({ 
              title: "Treasury transfer", 
              description: "Treasury transfer functionality needs platform wallet configuration" 
            });
            break;
        }
      }

      onWalletUpdate();
      
    } catch (error: any) {
      toast({ 
        title: "Fund management failed", 
        description: error?.message ?? String(error) 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleWalletSelection = (pubkey: string) => {
    setSelectedWallets(prev => 
      prev.includes(pubkey) 
        ? prev.filter(p => p !== pubkey)
        : [...prev, pubkey]
    );
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "low": return "text-green-600";
      case "medium": return "text-yellow-600";
      case "high": return "text-red-600";
      default: return "text-gray-600";
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <ArrowLeftRight className="h-4 w-4 mr-2" />
          Manage Leftover Funds
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Fund Management Options</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Warning Alert */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              These operations will transfer funds and may be irreversible. Please review carefully before proceeding.
            </AlertDescription>
          </Alert>

          {/* Action Selection */}
          <div className="space-y-3">
            <Label>Select Fund Management Action</Label>
            <div className="grid gap-3">
              {fundManagementOptions.map((option) => (
                <Card 
                  key={option.id}
                  className={`cursor-pointer transition-colors ${
                    selectedAction === option.id 
                      ? "border-primary bg-primary/5" 
                      : "hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedAction(option.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="text-primary">{option.icon}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{option.title}</h4>
                          <span className={`text-xs font-medium ${getRiskColor(option.risk)}`}>
                            {option.risk.toUpperCase()} RISK
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Custom Address Input */}
          {selectedAction === "refund_custom" && (
            <div className="space-y-2">
              <Label>Custom Refund Address</Label>
              <Input
                placeholder="Enter Solana public key"
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
              />
            </div>
          )}

          {/* Wallet Selection */}
          {(selectedAction === "redistribute" || selectedAction) && wallets.length > 1 && (
            <div className="space-y-3">
              <Label>Select Wallets to Process</Label>
              <div className="text-sm text-muted-foreground mb-2">
                {selectedAction === "redistribute" 
                  ? "Select wallets to empty (funds will go to unselected wallets)"
                  : "Select specific wallets or leave empty to process all"
                }
              </div>
              <div className="grid gap-2 max-h-48 overflow-y-auto">
                {wallets.map((wallet) => (
                  <div
                    key={wallet.pubkey}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer ${
                      selectedWallets.includes(wallet.pubkey) 
                        ? "border-primary bg-primary/5" 
                        : "hover:border-primary/50"
                    }`}
                    onClick={() => toggleWalletSelection(wallet.pubkey)}
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {wallet.pubkey.slice(0, 8)}...{wallet.pubkey.slice(-6)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Balance: {wallet.balance?.toFixed(4) ?? "Unknown"} SOL
                      </div>
                    </div>
                    <div className={`w-3 h-3 rounded border ${
                      selectedWallets.includes(wallet.pubkey) 
                        ? "bg-primary border-primary" 
                        : "border-gray-300"
                    }`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Summary */}
          {selectedAction && (
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Action Summary</h4>
              <div className="text-sm space-y-1">
                <p>Action: <strong>{fundManagementOptions.find(o => o.id === selectedAction)?.title}</strong></p>
                <p>Wallets to process: <strong>
                  {selectedWallets.length > 0 ? selectedWallets.length : wallets.length}
                </strong></p>
                {selectedAction === "refund_custom" && customAddress && (
                  <p>Destination: <strong>{customAddress.slice(0, 8)}...{customAddress.slice(-6)}</strong></p>
                )}
                {selectedAction === "redistribute" && (
                  <p>Target wallets: <strong>
                    {wallets.length - selectedWallets.length} remaining wallets
                  </strong></p>
                )}
              </div>
            </div>
          )}

          {/* Execute Button */}
          <Button 
            onClick={handleFundManagement}
            disabled={!selectedAction || isProcessing}
            className="w-full"
          >
            {isProcessing ? "Processing..." : "Execute Fund Management"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}