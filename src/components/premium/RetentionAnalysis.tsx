import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Diamond, TrendingUp, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';
import { Progress } from '@/components/ui/progress';

interface RetentionAnalysisProps {
  tokenMint: string;
}

export const RetentionAnalysis = ({ tokenMint }: RetentionAnalysisProps) => {
  const [retentionData, setRetentionData] = useState<any[]>([]);
  const [diamondScore, setDiamondScore] = useState(0);
  const [metrics, setMetrics] = useState<any>(null);
  const [timeframe, setTimeframe] = useState('30d');
  const [loading, setLoading] = useState(true);
  const { trackView } = useFeatureTracking('retention_analysis', tokenMint);

  useEffect(() => {
    trackView();
  }, [trackView]);

  const fetchRetention = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('holder-retention-analysis', {
        body: { token_mint: tokenMint, timeframe },
      });

      if (error) throw error;

      setRetentionData(data.retention_data || []);
      setDiamondScore(data.diamond_hands_score || 0);
      setMetrics(data.metrics || null);
    } catch (error) {
      console.error('Error fetching retention:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRetention();
  }, [tokenMint, timeframe]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-blue-500';
    if (score >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="space-y-4">
      <Card className="tech-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Diamond className="w-5 h-5 text-primary" />
                Diamond Hands Analysis
              </CardTitle>
              <CardDescription>Historical holder retention & loyalty metrics</CardDescription>
            </div>
            <div className="flex gap-2">
              {['7d', '30d', '90d'].map((tf) => (
                <Button
                  key={tf}
                  variant={timeframe === tf ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeframe(tf)}
                >
                  {tf}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Diamond Hands Score */}
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 p-6 rounded-lg tech-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Diamond className="w-5 h-5" />
                Diamond Hands Score
              </h3>
              <span className={`text-4xl font-bold ${getScoreColor(diamondScore)}`}>
                {diamondScore}/100
              </span>
            </div>
            <Progress value={diamondScore} className="h-3 mb-2" />
            <p className="text-xs text-muted-foreground">
              {diamondScore >= 80 && '💎 Extremely strong holder conviction!'}
              {diamondScore >= 60 && diamondScore < 80 && '👍 Good holder loyalty'}
              {diamondScore >= 40 && diamondScore < 60 && '⚠️ Moderate retention'}
              {diamondScore < 40 && '🚨 High churn risk'}
            </p>
          </div>

          {/* Metrics grid */}
          {metrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground">Retention Rate</div>
                <div className="text-lg font-bold">{metrics.retention_rate}%</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground">Churn Rate</div>
                <div className="text-lg font-bold">{metrics.churn_rate}%</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground">Start Holders</div>
                <div className="text-lg font-bold">{metrics.total_wallets_start}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground">Current Holders</div>
                <div className="text-lg font-bold">{metrics.total_wallets_now}</div>
              </div>
            </div>
          )}

          {/* Retention chart */}
          {!loading && retentionData.length > 0 ? (
            <div>
              <h4 className="text-sm font-semibold mb-3">Retention by Tier</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={retentionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" label={{ value: 'Days', position: 'insideBottom', offset: -5 }} />
                  <YAxis label={{ value: 'Retention %', angle: -90, position: 'insideLeft' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="Whale" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Large" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Medium" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Small" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Dust" stroke="#6b7280" strokeWidth={1} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : loading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-8 h-8 animate-pulse mx-auto mb-2" />
              <p>Analyzing retention data...</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No historical data available yet. Check back after the first snapshot.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
