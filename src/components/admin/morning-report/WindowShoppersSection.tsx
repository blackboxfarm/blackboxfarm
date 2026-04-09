import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Eye, CreditCard, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface WindowShopper {
  user_id: string;
  pricing_page_views: number;
  checkout_attempts: number;
  last_pricing_visit: string | null;
  last_checkout_attempt: string | null;
  intent_level: string;
  funnel_tag: string | null;
  email?: string;
}

export function WindowShoppersSection({ reportPeriodStart }: { reportPeriodStart?: string }) {
  const [shoppers, setShoppers] = useState<WindowShopper[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchShoppers = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('buyer_intent_signals')
        .select('*')
        .order('checkout_attempts', { ascending: false })
        .order('pricing_page_views', { ascending: false })
        .limit(10) as any;

      if (data) {
        // Enrich with emails
        const userIds = data.map((s: any) => s.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);

        const profileMap = new Map(profiles?.map((p: any) => [p.user_id, p.display_name]) || []);
        setShoppers(data.map((s: any) => ({ ...s, email: profileMap.get(s.user_id) || s.user_id.slice(0, 8) })));
      }
    } catch (err) {
      console.error('Failed to fetch window shoppers:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshSignals = async () => {
    setRefreshing(true);
    try {
      await supabase.rpc('refresh_buyer_intent_signals' as any);
      await fetchShoppers();
    } catch (err) {
      console.error('Failed to refresh signals:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchShoppers(); }, []);

  const almostBought = shoppers.filter(s => s.intent_level === 'almost_bought');
  const considering = shoppers.filter(s => s.intent_level === 'considering');
  const browsing = shoppers.filter(s => s.intent_level === 'browsing');

  const intentColor = (level: string) => {
    switch (level) {
      case 'almost_bought': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'considering': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-orange-400" />
            Window Shoppers
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={refreshSignals} disabled={refreshing}>
            <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          </div>
        ) : shoppers.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">No window shoppers detected yet. Click Refresh to compute.</p>
        ) : (
          <div className="space-y-3">
            {/* Summary */}
            <div className="flex gap-3 text-xs">
              <div className="flex items-center gap-1">
                <CreditCard className="h-3 w-3 text-red-400" />
                <span className="font-medium">{almostBought.length}</span>
                <span className="text-muted-foreground">abandoned cart</span>
              </div>
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3 text-orange-400" />
                <span className="font-medium">{considering.length}</span>
                <span className="text-muted-foreground">considering</span>
              </div>
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3 text-blue-400" />
                <span className="font-medium">{browsing.length}</span>
                <span className="text-muted-foreground">browsing</span>
              </div>
            </div>

            {/* Top shoppers */}
            <div className="space-y-1">
              {shoppers.slice(0, 5).map((s) => (
                <div key={s.user_id} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${intentColor(s.intent_level)}`}>
                      {s.intent_level.replace('_', ' ')}
                    </Badge>
                    <span className="truncate max-w-[150px]">{s.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{s.pricing_page_views} views</span>
                    {s.checkout_attempts > 0 && (
                      <span className="text-red-400">{s.checkout_attempts} checkout(s)</span>
                    )}
                    {s.last_pricing_visit && (
                      <span>{format(new Date(s.last_pricing_visit), 'MMM d')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
