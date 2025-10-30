import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, TrendingUp, Calendar, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface SmartMoneyTrackerProps {
  tokenMint: string;
  walletAddress: string;
}

export const SmartMoneyTracker = ({ tokenMint, walletAddress }: SmartMoneyTrackerProps) => {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [tokenHistory, setTokenHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const fetchWalletBehavior = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('wallet-behavior-analysis', {
        body: { wallet_address: walletAddress, token_mint: tokenMint },
      });

      if (error) throw error;

      setProfile(data.profile);
      setTokenHistory(data.token_history);
      setOpen(true);
    } catch (error: any) {
      console.error('Error fetching wallet behavior:', error);
      toast.error('Failed to load wallet analysis');
    } finally {
      setLoading(false);
    }
  };

  const followWallet = async () => {
    if (!user) {
      toast.error('Please sign in to follow wallets');
      return;
    }

    try {
      const { error } = await supabase.from('wallet_follows').insert({
        user_id: user.id,
        wallet_address: walletAddress,
        token_mint: tokenMint,
        alert_on_movement: true,
        minimum_movement_usd: 1000,
      });

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          toast.info('Already following this wallet');
        } else {
          throw error;
        }
      } else {
        toast.success('🔔 Now following this wallet! You\'ll get email alerts for significant movements.');
      }
    } catch (error: any) {
      console.error('Error following wallet:', error);
      toast.error('Failed to follow wallet');
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/20 text-green-500 border-green-500/30';
    if (score >= 60) return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
    if (score >= 40) return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
    return 'bg-red-500/20 text-red-500 border-red-500/30';
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={fetchWalletBehavior}
        disabled={loading}
        className="text-xs"
      >
        <Brain className="w-3 h-3 mr-1" />
        {loading ? 'Loading...' : 'View Timeline'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Wallet Behavior Analysis
            </DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">
              {walletAddress}
            </DialogDescription>
          </DialogHeader>

          {profile && (
            <div className="space-y-4">
              {/* Smart Money Score */}
              <Card className={`border-2 ${getScoreColor(profile.smart_money_score)}`}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Smart Money Score</div>
                      <div className="text-3xl font-bold">{profile.smart_money_score}/100</div>
                    </div>
                    <Brain className="w-12 h-12 opacity-20" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Early Entries</div>
                      <div className="font-semibold">{profile.early_entry_count || 0}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Diamond Hands</div>
                      <div className="font-semibold">{profile.diamond_hands_count || 0}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Paper Hands</div>
                      <div className="font-semibold">{profile.paper_hands_count || 0}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Follow button */}
              <Button onClick={followWallet} className="w-full tech-button">
                🔔 Follow This Wallet for Alerts
              </Button>

              {/* Token History Timeline */}
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Activity Timeline
                </h4>
                
                {tokenHistory.length > 0 ? (
                  <div className="space-y-2">
                    {tokenHistory.map((history: any, idx: number) => (
                      <div key={idx} className="p-3 bg-muted rounded-lg">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {history.behavior_pattern || 'Unknown'}
                              </Badge>
                              {history.entry_date && (
                                <span className="text-xs text-muted-foreground">
                                  Entry: {new Date(history.entry_date).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            <div className="text-sm">
                              <span className="font-semibold">Balance: </span>
                              {history.current_balance?.toLocaleString() || 0} tokens
                            </div>
                            {history.unrealized_pnl && (
                              <div className={`text-xs ${history.unrealized_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                P&L: {history.unrealized_pnl >= 0 ? '+' : ''}{history.unrealized_pnl.toFixed(2)}%
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            {history.entry_price && (
                              <div className="text-xs text-muted-foreground">
                                Entry: ${history.entry_price.toFixed(6)}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              {history.transaction_count || 0} txs
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No detailed transaction history available yet
                  </div>
                )}
              </div>

              {/* Additional Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Total Tokens Traded</div>
                  <div className="text-lg font-bold">{profile.total_tokens_traded || 0}</div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
                  <div className="text-lg font-bold">
                    {profile.win_rate ? `${profile.win_rate.toFixed(0)}%` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
