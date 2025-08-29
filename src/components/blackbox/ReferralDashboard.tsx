import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, Users, Gift, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ReferralResponse {
  success: boolean;
  message: string;
}

interface DiscountResponse {
  has_discount: boolean;
  discount_percent?: number;
  message: string;
}

interface ReferralProgram {
  id: string;
  referral_code: string;
  referrals_count: number;
  successful_referrals: number;
  discount_earned: boolean;
  discount_used: boolean;
}

export function ReferralDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [referralProgram, setReferralProgram] = useState<ReferralProgram | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchReferralProgram();
    }
  }, [user]);

  const fetchReferralProgram = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('referral_programs')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching referral program:', error);
        return;
      }

      setReferralProgram(data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const copyReferralCode = async () => {
    if (!referralProgram) return;

    const referralUrl = `${window.location.origin}?ref=${referralProgram.referral_code}`;
    
    try {
      await navigator.clipboard.writeText(referralUrl);
      toast({
        title: "Copied!",
        description: "Referral link copied to clipboard",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Please copy the link manually",
        variant: "destructive",
      });
    }
  };

  const submitReferralCode = async () => {
    if (!user || !referralCode.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('track_referral_signup', {
        referral_code_param: referralCode.trim().toUpperCase(),
        new_user_id: user.id
      });

      if (error) throw error;

      const result = data as ReferralResponse;
      if (result.success) {
        toast({
          title: "Success!",
          description: result.message,
        });
        setReferralCode("");
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error submitting referral code:', error);
      toast({
        title: "Error",
        description: "Failed to submit referral code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyDiscount = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('apply_referral_discount', {
        user_id_param: user.id
      });

      if (error) throw error;

      const result = data as DiscountResponse;
      if (result.has_discount) {
        toast({
          title: "Discount Applied!",
          description: `${result.discount_percent}% discount applied to your next campaign`,
        });
        fetchReferralProgram(); // Refresh data
      } else {
        toast({
          title: "No Discount Available",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error applying discount:', error);
      toast({
        title: "Error",
        description: "Failed to apply discount",
        variant: "destructive",
      });
    }
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">Please log in to view your referral program.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Referral Program Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Referral Program
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {referralProgram ? (
            <>
              {/* Your Referral Code */}
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">Your Referral Code</h3>
                  <Button variant="outline" size="sm" onClick={copyReferralCode}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Link
                  </Button>
                </div>
                <div className="font-mono text-lg text-primary">
                  {referralProgram.referral_code}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Share this code with friends to earn rewards!
                </p>
              </div>

              {/* Stats */}
              <div className="grid md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {referralProgram.referrals_count}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Referrals</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {referralProgram.successful_referrals}
                  </div>
                  <div className="text-sm text-muted-foreground">Successful Referrals</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-orange-500">
                    {Math.max(0, 5 - referralProgram.successful_referrals)}
                  </div>
                  <div className="text-sm text-muted-foreground">Needed for Reward</div>
                </div>
              </div>

              {/* Reward Status */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium mb-1">25% Discount Reward</h3>
                    <p className="text-sm text-muted-foreground">
                      Refer 5 friends who create campaigns to earn a 25% discount
                    </p>
                  </div>
                  <div className="text-right">
                    {referralProgram.successful_referrals >= 5 ? (
                      referralProgram.discount_used ? (
                        <Badge variant="secondary">Used</Badge>
                      ) : (
                        <Button onClick={applyDiscount}>
                          <Gift className="h-4 w-4 mr-2" />
                          Apply Discount
                        </Button>
                      )
                    ) : (
                      <Badge variant="outline">
                        {referralProgram.successful_referrals}/5
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading referral program...</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enter Referral Code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Were You Referred?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="referralCode">Enter Referral Code</Label>
            <div className="flex gap-2">
              <Input
                id="referralCode"
                placeholder="Enter code here..."
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                maxLength={8}
              />
              <Button 
                onClick={submitReferralCode} 
                disabled={!referralCode.trim() || loading}
              >
                Submit
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              If someone referred you, enter their code here to give them credit!
            </p>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle>How the Referral Program Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">1</div>
              <div>
                <strong>Share your code:</strong> Give your unique referral code to friends
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">2</div>
              <div>
                <strong>They sign up:</strong> Friends use your code when creating their account
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">3</div>
              <div>
                <strong>They create campaigns:</strong> When they create their first campaign, it counts as a successful referral
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">4</div>
              <div>
                <strong>Earn rewards:</strong> After 5 successful referrals, get 25% off your next big campaign
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}