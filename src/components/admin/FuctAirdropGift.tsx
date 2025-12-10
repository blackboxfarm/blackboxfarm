import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, Loader2, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import FingerprintJS from "@fingerprintjs/fingerprintjs";

export function FuctAirdropGift() {
  const [recipientWallet, setRecipientWallet] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);

  // Initialize fingerprint on mount
  useEffect(() => {
    const initFingerprint = async () => {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        setFingerprint(result.visitorId);
        console.log("Device fingerprint loaded:", result.visitorId.slice(0, 8) + "...");
      } catch (error) {
        console.error("Failed to load fingerprint:", error);
        // Generate a fallback fingerprint
        const fallback = crypto.randomUUID();
        setFingerprint(fallback);
      }
    };
    initFingerprint();
  }, []);

  const handleSendGift = async () => {
    if (!recipientWallet.trim()) {
      toast({
        title: "Wallet Required",
        description: "Please enter a recipient wallet address",
        variant: "destructive"
      });
      return;
    }

    if (!fingerprint) {
      toast({
        title: "Please Wait",
        description: "Device verification in progress...",
        variant: "destructive"
      });
      return;
    }

    // Basic Solana address validation
    if (recipientWallet.length < 32 || recipientWallet.length > 44) {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid Solana wallet address",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    setTxSignature(null);
    setAlreadyClaimed(false);

    try {
      const { data, error } = await supabase.functions.invoke('fuct-airdrop-gift', {
        body: {
          recipientWallet: recipientWallet.trim(),
          deviceFingerprint: fingerprint
        }
      });

      if (error) throw error;

      if (data?.alreadyClaimed) {
        setAlreadyClaimed(true);
        toast({
          title: "Already Claimed",
          description: data.error || "You've already claimed your gift today!",
          variant: "destructive"
        });
        return;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setTxSignature(data.signature);
      toast({
        title: "🎉 Get $FUCT!",
        description: `1,111 $FUCT tokens sent to your wallet!`,
      });

    } catch (error: any) {
      console.error("Gift error:", error);
      toast({
        title: "Failed to Send Gift",
        description: error.message || "Something went wrong",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-fuchsia-950/50 to-purple-950/50 border-fuchsia-500/30">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-fuchsia-500/20 flex items-center justify-center">
            <Gift className="w-8 h-8 text-fuchsia-400" />
          </div>
          <CardTitle className="text-2xl bg-gradient-to-r from-fuchsia-400 to-purple-400 bg-clip-text text-transparent">
            $FUCT Airdrops
          </CardTitle>
          <CardDescription className="text-fuchsia-200/70">
            Send 1,111 $FUCT tokens to a friend • One gift per device per day
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Gift Details */}
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant="outline" className="border-fuchsia-500/50 text-fuchsia-300">
              1,111 Tokens
            </Badge>
            <Badge variant="outline" className="border-purple-500/50 text-purple-300">
              Fixed Amount
            </Badge>
            <Badge variant="outline" className="border-pink-500/50 text-pink-300">
              1 per day
            </Badge>
          </div>

          {/* Wallet Input */}
          <div className="space-y-2">
            <label className="text-sm text-fuchsia-200/80">Friend's Wallet Address</label>
            <Input
              placeholder="Enter Solana wallet address..."
              value={recipientWallet}
              onChange={(e) => setRecipientWallet(e.target.value)}
              className="bg-black/30 border-fuchsia-500/30 focus:border-fuchsia-400 text-white placeholder:text-fuchsia-200/40"
              disabled={isLoading}
            />
          </div>

          {/* Send Button */}
          <Button
            onClick={handleSendGift}
            disabled={isLoading || !fingerprint || alreadyClaimed}
            className="w-full h-12 text-lg font-bold bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 border-0"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Sending Gift...
              </>
            ) : alreadyClaimed ? (
              <>
                <AlertCircle className="w-5 h-5 mr-2" />
                Already Claimed Today
              </>
            ) : (
              <>
                <Gift className="w-5 h-5 mr-2" />
                Get $FUCT
              </>
            )}
          </Button>

          {/* Success Message */}
          {txSignature && (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">Gift Sent Successfully!</span>
              </div>
              <p className="text-sm text-green-300/80 mb-2">
                1,111 $FUCT tokens have been sent with the message: "Get $FUCT https://fuct.xyz"
              </p>
              <a
                href={`https://solscan.io/tx/${txSignature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-fuchsia-400 hover:text-fuchsia-300"
              >
                View on Solscan
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Already Claimed Message */}
          {alreadyClaimed && !txSignature && (
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <div className="flex items-center gap-2 text-yellow-400">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">
                  You've already claimed your gift today. Come back tomorrow!
                </span>
              </div>
            </div>
          )}

          {/* Fingerprint Status */}
          <div className="text-center text-xs text-fuchsia-200/40">
            {fingerprint ? (
              <span>Device verified ✓</span>
            ) : (
              <span>Verifying device...</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-black/20 border-fuchsia-500/20">
        <CardContent className="pt-6">
          <h4 className="font-semibold text-fuchsia-300 mb-2">How it works</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Enter your friend's Solana wallet address</li>
            <li>• Click "Get $FUCT" to send them 1,111 tokens</li>
            <li>• Each device can send one gift per day</li>
            <li>• Tokens include the message: "Get $FUCT https://fuct.xyz"</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}