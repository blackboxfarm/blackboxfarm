import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWalletPool } from "@/hooks/useWalletPool";
import { toast } from "sonner";

export function WalletRecovery() {
  const { state, recoverAllLocalWallets } = useWalletPool();
  const [isRecovering, setIsRecovering] = useState(false);

  const localWallets = state.generated;
  const hasLocalWallets = localWallets.length > 0;

  const handleRecover = async () => {
    if (!hasLocalWallets) return;
    
    setIsRecovering(true);
    try {
      const recovered = await recoverAllLocalWallets();
      if (recovered > 0) {
        toast.success(`Successfully recovered ${recovered} wallets to database!`);
      } else {
        toast.warning("No wallets needed recovery or failed to save.");
      }
    } catch (error) {
      console.error('Recovery failed:', error);
      toast.error("Failed to recover wallets. Please try again.");
    } finally {
      setIsRecovering(false);
    }
  };

  if (!hasLocalWallets) {
    return null;
  }

  return (
    <Card className="mb-4 border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle className="text-amber-800">🔄 Wallet Recovery Available</CardTitle>
        <CardDescription className="text-amber-700">
          Found {localWallets.length} wallet(s) stored locally. Save them to the database to prevent loss on refresh.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="text-sm text-amber-700">
            Wallets found:
            {localWallets.map((wallet, idx) => (
              <div key={wallet.pubkey} className="font-mono text-xs bg-amber-100 p-1 rounded mt-1">
                {idx + 1}. {wallet.pubkey}
              </div>
            ))}
          </div>
          <Button 
            onClick={handleRecover}
            disabled={isRecovering}
            className="w-full"
            variant="default"
          >
            {isRecovering ? "Saving to Database..." : "Save All Wallets to Database"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}