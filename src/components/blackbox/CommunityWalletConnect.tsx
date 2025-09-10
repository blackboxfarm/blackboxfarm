import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Wallet, AlertCircle, CheckCircle } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CommunityCampaign {
  id: string;
  creator_id: string;
  title: string;
  description?: string;
  token_address: string;
  funding_goal_sol: number;
  current_funding_sol: number;
  target_deadline: string;
  campaign_parameters: any;
  multisig_wallet_address?: string;
  status: string;
  min_contribution_sol: number;
  max_contribution_sol?: number;
  contributor_count: number;
  created_at: string;
  updated_at: string;
  funded_at?: string;
  executed_at?: string;
}

interface CommunityWalletConnectProps {
  isOpen: boolean;
  onClose: () => void;
  onContribute: (amount: number, signature: string) => Promise<void>;
  campaign: CommunityCampaign;
}

export default function CommunityWalletConnect({
  isOpen,
  onClose,
  onContribute,
  campaign
}: CommunityWalletConnectProps) {
  const [contributionAmount, setContributionAmount] = useState('0.01');
  const [isProcessing, setIsProcessing] = useState(false);
  const { publicKey, sendTransaction, connected } = useWallet();
  const { toast } = useToast();

  const handleContribute = async () => {
    if (!connected || !publicKey) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to contribute.",
        variant: "destructive"
      });
      return;
    }

    const amount = parseFloat(contributionAmount);
    if (amount < campaign.min_contribution_sol) {
      toast({
        title: "Invalid amount",
        description: `Minimum contribution is ${campaign.min_contribution_sol} SOL`,
        variant: "destructive"
      });
      return;
    }

    if (campaign.max_contribution_sol && amount > campaign.max_contribution_sol) {
      toast({
        title: "Invalid amount", 
        description: `Maximum contribution is ${campaign.max_contribution_sol} SOL`,
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Use Supabase edge function directly
      const { data, error } = await supabase.functions.invoke('community-contribution', {
        body: {
          campaignId: campaign.id,
          contributionAmount: amount,
          contributorPublicKey: publicKey.toBase58()
        }
      });

      if (error) {
        throw error;
      }

      const { signature } = data;

      await onContribute(amount, signature);
      onClose();
      
      toast({
        title: "Contribution successful! ✅",
        description: `Successfully contributed ${amount} SOL to ${campaign.title}`,
      });
    } catch (error) {
      console.error('Contribution failed:', error);
      toast({
        title: "Contribution failed",
        description: error instanceof Error ? error.message : "Failed to process contribution",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const fundingProgress = campaign.funding_goal_sol > 0 
    ? (campaign.current_funding_sol / campaign.funding_goal_sol) * 100 
    : 0;

  const remainingAmount = Math.max(0, campaign.funding_goal_sol - campaign.current_funding_sol);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
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
          <div className="space-y-4">
            <h3 className="font-semibold">Campaign Progress</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Current Funding:</span>
                <span className="font-mono">{campaign.current_funding_sol.toFixed(3)} SOL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Funding Goal:</span>
                <span className="font-mono">{campaign.funding_goal_sol.toFixed(3)} SOL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Remaining:</span>
                <span className="font-mono">{remainingAmount.toFixed(3)} SOL</span>
              </div>
              <Progress value={fundingProgress} className="h-2" />
            </div>
          </div>

          {/* Wallet Connection */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              Wallet Connection
              {connected ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-yellow-500" />
              )}
            </h3>
            
            {!connected ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect your Solana wallet to contribute
                </p>
                <WalletMultiButton />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm">
                    <span className="font-medium">Connected:</span>{' '}
                    <button
                      onClick={() => navigator.clipboard.writeText(publicKey?.toBase58() || '')}
                      className="font-mono text-xs hover:text-muted-foreground transition-colors cursor-pointer break-all"
                      title="Click to copy full address"
                    >
                      {publicKey?.toBase58()}
                    </button>
                  </p>
                </div>

                {/* Contribution Amount */}
                <div className="space-y-2">
                  <label htmlFor="amount" className="text-sm font-medium">
                    Contribution Amount (SOL)
                  </label>
                  <input
                    id="amount"
                    type="number"
                    step="0.001"
                    min={campaign.min_contribution_sol}
                    max={campaign.max_contribution_sol || undefined}
                    value={contributionAmount}
                    onChange={(e) => setContributionAmount(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                    placeholder="0.01"
                  />
                  <p className="text-xs text-muted-foreground">
                    Min: {campaign.min_contribution_sol} SOL
                    {campaign.max_contribution_sol && ` • Max: ${campaign.max_contribution_sol} SOL`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Security Notice */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              🔒 Your wallet remains secure. This transaction only transfers the specified SOL amount to the campaign's multisig wallet.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleContribute}
              disabled={!connected || isProcessing || parseFloat(contributionAmount) < campaign.min_contribution_sol}
              className="flex-1"
            >
              {isProcessing ? "Processing..." : `Contribute ${contributionAmount} SOL`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}