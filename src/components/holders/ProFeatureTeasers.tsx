import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Crown, AlertTriangle, Network, TrendingUp, Lock, Sparkles, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ProFeatureTeasersProps {
  isPro: boolean;
  tokenSymbol?: string;
}

export function ProFeatureTeasers({ isPro, tokenSymbol }: ProFeatureTeasersProps) {
  const navigate = useNavigate();

  if (isPro) return null;

  return (
    <div className="space-y-4">
      {/* Risk Assessment Teaser */}
      <Card className="relative overflow-hidden border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-background to-red-500/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.05),transparent_60%)]" />
        <CardContent className="py-6 relative z-10">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                  <Shield className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-foreground">AI Risk Assessment</h3>
                    <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
                      <Crown className="h-2.5 w-2.5 mr-1" /> PRO
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Powered by the Telegram /risk command</p>
                </div>
              </div>
              
              {/* Blurred preview */}
              <div className="relative">
                <div className="filter blur-sm opacity-40 pointer-events-none select-none p-3 bg-muted/20 rounded-lg border border-border/30 font-mono text-xs space-y-1">
                  <p>🎯 Risk: <span className="text-primary font-bold">MODERATE STRENGTH</span></p>
                  <p>🏆 Stability: 72/100 · Distribution: Healthy</p>
                  <p>⚠️ 1 flagged holder from reputation DB</p>
                  <p>💬 Token shows healthy distribution with 68% in small wallets...</p>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-orange-400" /> Risk Signal Classification</span>
                <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-green-400" /> Multi-factor AI Analysis</span>
                <span className="flex items-center gap-1"><Users className="h-3 w-3 text-blue-400" /> Holder Behavior Scoring</span>
              </div>
            </div>

            <Button 
              onClick={() => navigate('/pricing')}
              className="bg-gradient-to-r from-primary to-primary/70 shrink-0"
              size="sm"
            >
              <Crown className="h-3.5 w-3.5 mr-1.5" />
              Unlock Risk Reports
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dev Reputation Teaser */}
      <Card className="relative overflow-hidden border-purple-500/20 bg-gradient-to-br from-purple-500/5 via-background to-blue-500/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,hsl(var(--primary)/0.05),transparent_60%)]" />
        <CardContent className="py-6 relative z-10">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                  <Network className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-foreground">Dev Reputation History</h3>
                    <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
                      <Crown className="h-2.5 w-2.5 mr-1" /> PRO
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Deep-linked developer intelligence report</p>
                </div>
              </div>
              
              {/* Blurred preview */}
              <div className="relative">
                <div className="filter blur-sm opacity-40 pointer-events-none select-none p-3 bg-muted/20 rounded-lg border border-border/30 font-mono text-xs space-y-1">
                  <p>📡 Dev: <span className="text-purple-300">4xR9...mK7p</span></p>
                  <p>💰 Funder: <span className="text-blue-300">7bQ2...nJ4d</span> → 🔑 KYC Root: Binance</p>
                  <p>📊 History: 12 tokens launched · 3 graduated · Score: 34/100</p>
                  <p>⚠️ Pattern: serial_launcher · 2 abandoned projects</p>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Network className="h-3 w-3 text-purple-400" /> Wallet Family Tree</span>
                <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-green-400" /> KYC Root Discovery</span>
                <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-400" /> Rug History Detection</span>
              </div>
            </div>

            <Button 
              onClick={() => navigate('/pricing')}
              className="bg-gradient-to-r from-primary to-primary/70 shrink-0"
              size="sm"
            >
              <Crown className="h-3.5 w-3.5 mr-1.5" />
              Unlock Dev Intel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
