import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CommunityWalletConnectProps {
  isOpen: boolean;
  onClose: () => void;
  onContribute: (amount: number, walletSecret: string) => Promise<boolean>;
  campaign: {
    id: string;
    title: string;
    min_contribution_sol: number;
    max_contribution_sol?: number;
    current_funding_sol: number;
    funding_goal_sol: number;
  };
}

export default function CommunityWalletConnect({ 
  isOpen, 
  onClose, 
  onContribute, 
  campaign 
}: CommunityWalletConnectProps) {
  const [contributionAmount, setContributionAmount] = useState('');
  const [walletSecret, setWalletSecret] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSecretInput, setShowSecretInput] = useState(false);
  const { toast } = useToast();

  const handleContribute = async () => {
    if (!contributionAmount || !walletSecret) {
      toast({
        title: "Missing Information",
        description: "Please enter both contribution amount and wallet secret",
        variant: "destructive"
      });
      return;
    }

    const amount = parseFloat(contributionAmount);
    
    // Validate contribution amount
    if (amount < campaign.min_contribution_sol) {
      toast({
        title: "Invalid Amount",
        description: `Minimum contribution is ${campaign.min_contribution_sol} SOL`,
        variant: "destructive"
      });
      return;
    }

    if (campaign.max_contribution_sol && amount > campaign.max_contribution_sol) {
      toast({
        title: "Invalid Amount",
        description: `Maximum contribution is ${campaign.max_contribution_sol} SOL`,
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      const success = await onContribute(amount, walletSecret);
      if (success) {
        setContributionAmount('');
        setWalletSecret('');
        setShowSecretInput(false);
        onClose();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Address copied to clipboard"
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Contribute to {campaign.title}
          </DialogTitle>
          <DialogDescription>
            Fund this community campaign with SOL
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Campaign Progress */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Campaign Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span>Current Funding:</span>
                <span className="font-mono">{campaign.current_funding_sol.toFixed(3)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span>Funding Goal:</span>
                <span className="font-mono">{campaign.funding_goal_sol.toFixed(3)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining:</span>
                <span className="font-mono text-muted-foreground">
                  {(campaign.funding_goal_sol - campaign.current_funding_sol).toFixed(3)} SOL
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Contribution Form */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount">Contribution Amount (SOL)</Label>
              <Input
                id="amount"
                type="number"
                step="0.001"
                value={contributionAmount}
                onChange={(e) => setContributionAmount(e.target.value)}
                placeholder={`Min: ${campaign.min_contribution_sol} SOL`}
              />
              <div className="text-xs text-muted-foreground mt-1">
                Min: {campaign.min_contribution_sol} SOL
                {campaign.max_contribution_sol && ` • Max: ${campaign.max_contribution_sol} SOL`}
              </div>
            </div>

            {/* Wallet Connection */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Wallet Connection</CardTitle>
                <CardDescription>
                  Provide your wallet's secret key to make the contribution
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!showSecretInput ? (
                  <div className="space-y-3">
                    <div className="bg-muted p-4 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="bg-warning/10 p-2 rounded-full">
                          <Wallet className="h-4 w-4 text-warning" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">Security Notice</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Your wallet secret will be used only for this transaction and not stored.
                            Only proceed if you trust this application.
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowSecretInput(true)}
                      className="w-full"
                    >
                      Connect Wallet
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label htmlFor="secret">Wallet Secret Key (Base58)</Label>
                    <Input
                      id="secret"
                      type="password"
                      value={walletSecret}
                      onChange={(e) => setWalletSecret(e.target.value)}
                      placeholder="Enter your wallet's secret key..."
                    />
                    <div className="text-xs text-muted-foreground">
                      Your secret key is used only for this transaction and is not stored anywhere.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button 
              onClick={handleContribute} 
              disabled={!contributionAmount || !walletSecret || isProcessing}
            >
              {isProcessing ? 'Processing...' : `Contribute ${contributionAmount || '0'} SOL`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}