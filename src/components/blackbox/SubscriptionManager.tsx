import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Crown, Zap, Shield, Star, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PricingTier {
  id: string;
  tier_name: string;
  base_fee_sol: number;
  per_trade_fee_sol: number;
  service_markup_percent: number;
  max_trades_per_hour: number;
  max_wallets_per_campaign: number;
  features: any;
  is_active: boolean;
}

interface UserSubscription {
  id: string;
  tier_name: string;
  trades_used: number;
  max_trades_per_hour: number;
  expires_at: string | null;
  is_active: boolean;
}

export function SubscriptionManager() {
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchPricingTiers();
    fetchCurrentSubscription();
  }, []);

  const fetchPricingTiers = async () => {
    try {
      const { data, error } = await supabase
        .from('pricing_tiers')
        .select('*')
        .eq('is_active', true)
        .order('base_fee_sol', { ascending: true });

      if (error) throw error;
      setPricingTiers(data || []);
    } catch (error) {
      console.error('Error fetching pricing tiers:', error);
      toast({
        title: "Error",
        description: "Failed to load pricing tiers",
        variant: "destructive",
      });
    }
  };

  const fetchCurrentSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .rpc('get_user_subscription', { user_id_param: user.id });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setCurrentSubscription(data[0]);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeTo = async (tierId: string, tierName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please log in to subscribe",
          variant: "destructive",
        });
        return;
      }

      // Deactivate current subscription
      if (currentSubscription) {
        await supabase
          .from('user_subscriptions')
          .update({ is_active: false })
          .eq('id', currentSubscription.id);
      }

      // Create new subscription
      const { error } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: user.id,
          pricing_tier_id: tierId,
          starts_at: new Date().toISOString(),
          expires_at: null, // Permanent until cancelled
          is_active: true,
          trades_used: 0
        });

      if (error) throw error;

      toast({
        title: "Subscription Updated!",
        description: `Successfully subscribed to ${tierName} tier`,
      });

      fetchCurrentSubscription();
    } catch (error) {
      console.error('Subscription error:', error);
      toast({
        title: "Subscription Failed",
        description: "Failed to update subscription. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getTierIcon = (tierName: string) => {
    switch (tierName.toLowerCase()) {
      case 'starter': return <Zap className="h-5 w-5" />;
      case 'growth': return <Star className="h-5 w-5" />;
      case 'pro': return <Crown className="h-5 w-5" />;
      case 'enterprise': return <Shield className="h-5 w-5" />;
      default: return <Zap className="h-5 w-5" />;
    }
  };

  const getTierColor = (tierName: string) => {
    switch (tierName.toLowerCase()) {
      case 'starter': return 'bg-blue-50 border-blue-200';
      case 'growth': return 'bg-purple-50 border-purple-200';
      case 'pro': return 'bg-yellow-50 border-yellow-200';
      case 'enterprise': return 'bg-green-50 border-green-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Subscription Status */}
      {currentSubscription && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getTierIcon(currentSubscription.tier_name)}
              Current Plan: {currentSubscription.tier_name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Trades Used Today</p>
                <p className="text-2xl font-bold">{currentSubscription.trades_used}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hourly Limit</p>
                <p className="text-2xl font-bold">{currentSubscription.max_trades_per_hour}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Usage</p>
                <Progress 
                  value={(currentSubscription.trades_used / currentSubscription.max_trades_per_hour) * 100} 
                  className="mt-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Tiers */}
      <Card>
        <CardHeader>
          <CardTitle>Choose Your Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricingTiers.map((tier) => (
              <Card 
                key={tier.id} 
                className={`relative ${getTierColor(tier.tier_name)} ${
                  currentSubscription?.tier_name === tier.tier_name ? 'ring-2 ring-primary' : ''
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getTierIcon(tier.tier_name)}
                      <h3 className="font-semibold">{tier.tier_name}</h3>
                    </div>
                    {currentSubscription?.tier_name === tier.tier_name && (
                      <Badge variant="default">Active</Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold">{tier.base_fee_sol} SOL</p>
                    <p className="text-sm text-muted-foreground">Setup Fee</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Per Trade:</span>
                      <span className="font-medium">{tier.per_trade_fee_sol} SOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Trades/Hour:</span>
                      <span className="font-medium">{tier.max_trades_per_hour}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Wallets/Campaign:</span>
                      <span className="font-medium">{tier.max_wallets_per_campaign}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="font-medium text-sm">Features:</p>
                    <div className="space-y-1">
                      {tier.features.analytics && (
                        <div className="flex items-center gap-1 text-xs">
                          <Check className="h-3 w-3 text-green-600" />
                          <span>Advanced Analytics</span>
                        </div>
                      )}
                      {tier.features.advanced_strategies && (
                        <div className="flex items-center gap-1 text-xs">
                          <Check className="h-3 w-3 text-green-600" />
                          <span>Advanced Strategies</span>
                        </div>
                      )}
                      {tier.features.priority_support && (
                        <div className="flex items-center gap-1 text-xs">
                          <Check className="h-3 w-3 text-green-600" />
                          <span>Priority Support</span>
                        </div>
                      )}
                      {tier.features.white_label && (
                        <div className="flex items-center gap-1 text-xs">
                          <Check className="h-3 w-3 text-green-600" />
                          <span>White Label</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Button 
                    onClick={() => subscribeTo(tier.id, tier.tier_name)}
                    disabled={currentSubscription?.tier_name === tier.tier_name}
                    className="w-full"
                    variant={currentSubscription?.tier_name === tier.tier_name ? "outline" : "default"}
                  >
                    {currentSubscription?.tier_name === tier.tier_name ? "Current Plan" : "Subscribe"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Revenue Information */}
      <Card className="bg-yellow-50 border-yellow-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            💰 Revenue Model
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-2">How You Earn</h4>
              <ul className="space-y-1 text-sm">
                <li>• Setup fees collected upfront</li>
                <li>• Per-trade fees on every transaction</li>
                <li>• 25-35% markup on network fees</li>
                <li>• Automatic revenue collection</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Pricing Strategy</h4>
              <ul className="space-y-1 text-sm">
                <li>• 15x higher than previous rates</li>
                <li>• Still competitive with market</li>
                <li>• Premium features justify pricing</li>
                <li>• Subscription-based recurring revenue</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}