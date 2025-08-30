import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wallet, Copy, Download, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GeneratedWallet {
  id: string;
  pubkey: string;
  sol_balance: number;
  tier: string;
  setup_fee_charged: number;
}

export function WalletGenerator() {
  const [campaignId, setCampaignId] = useState("");
  const [generatedWallet, setGeneratedWallet] = useState<GeneratedWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const { toast } = useToast();

  const generateWallet = async () => {
    if (!campaignId.trim()) {
      toast({
        title: "Campaign ID Required",
        description: "Please enter a campaign ID",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('premium-wallet-generator', {
        body: { campaign_id: campaignId }
      });

      if (error) throw error;

      setGeneratedWallet(data.wallet);
      toast({
        title: "Wallet Generated Successfully!",
        description: `Setup fee: ${data.wallet.setup_fee_charged} SOL charged`,
      });

    } catch (error: any) {
      console.error('Wallet generation error:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate wallet",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const downloadWalletInfo = () => {
    if (!generatedWallet) return;

    const walletInfo = {
      public_key: generatedWallet.pubkey,
      wallet_id: generatedWallet.id,
      tier: generatedWallet.tier,
      setup_fee_charged: generatedWallet.setup_fee_charged,
      generated_at: new Date().toISOString(),
      warning: "Keep this information secure. Never share your private keys."
    };

    const blob = new Blob([JSON.stringify(walletInfo, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet-${generatedWallet.pubkey.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Premium Wallet Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="campaignId">Campaign ID</Label>
            <Input
              id="campaignId"
              placeholder="Enter campaign ID to generate wallet for..."
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            />
          </div>

          <Button 
            onClick={generateWallet}
            disabled={loading || !campaignId.trim()}
            className="w-full"
          >
            {loading ? "Generating..." : "Generate Premium Wallet"}
          </Button>
        </CardContent>
      </Card>

      {generatedWallet && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-green-600" />
                Wallet Generated Successfully
              </span>
              <Badge variant="outline" className="text-green-600 border-green-600">
                {generatedWallet.tier} Tier
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Public Key */}
            <div>
              <Label className="text-sm font-medium">Public Key (Address)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input 
                  value={generatedWallet.pubkey} 
                  readOnly 
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(generatedWallet.pubkey, "Public key")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Wallet ID */}
            <div>
              <Label className="text-sm font-medium">Wallet ID</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input 
                  value={generatedWallet.id} 
                  readOnly 
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(generatedWallet.id, "Wallet ID")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Fee Information */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-muted-foreground">Setup Fee Charged</Label>
                <p className="text-lg font-semibold text-green-600">
                  {generatedWallet.setup_fee_charged} SOL
                </p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Current Balance</Label>
                <p className="text-lg font-semibold">
                  {generatedWallet.sol_balance} SOL
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4 border-t">
              <Button
                onClick={downloadWalletInfo}
                variant="outline"
                className="flex-1"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Info
              </Button>
              <Button
                onClick={() => setGeneratedWallet(null)}
                variant="outline"
                className="flex-1"
              >
                Generate Another
              </Button>
            </div>

            {/* Security Notice */}
            <div className="text-xs text-amber-600 bg-amber-50 p-3 rounded border border-amber-200">
              <strong>Security Notice:</strong> This wallet is encrypted and stored securely. 
              Revenue is automatically collected on each transaction. Private keys are only accessible 
              through secure edge functions.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue Information */}
      <Card className="bg-background/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            💰 Revenue Collection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-2 text-foreground">Automatic Collection</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Setup fees collected immediately</li>
                <li>• Per-trade fees on every transaction</li>
                <li>• Revenue tracked in database</li>
                <li>• Transparent fee structure</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2 text-foreground">Your Revenue Wallet</h4>
              <p className="text-xs font-mono bg-muted/50 text-foreground p-2 rounded border border-border">
                Revenue flows to your configured Solana wallet address
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Configure in platform settings
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}