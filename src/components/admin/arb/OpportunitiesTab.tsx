import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Opportunity {
  id: string;
  loop_type: string;
  trade_size_eth: number;
  expected_profit_eth: number;
  expected_profit_bps: number;
  executable: boolean;
  skip_reason: string | null;
  detected_at: string;
  leg_breakdown: any;
}

export function OpportunitiesTab() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadOpportunities();
    const interval = setInterval(loadOpportunities, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const loadOpportunities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('arb_opportunities')
        .select('*')
        .eq('user_id', user.id)
        .order('detected_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setOpportunities(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading opportunities",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const executableOpps = opportunities.filter(o => o.executable);
  const avgProfit = executableOpps.length > 0
    ? executableOpps.reduce((sum, o) => sum + o.expected_profit_bps, 0) / executableOpps.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Opportunities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{opportunities.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Executable Now</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{executableOpps.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Profit (bps)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgProfit.toFixed(0)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Opportunities</CardTitle>
          <CardDescription>Last 50 detected arbitrage opportunities</CardDescription>
        </CardHeader>
        <CardContent>
          {opportunities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No opportunities detected yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loop Type</TableHead>
                  <TableHead>Trade Size</TableHead>
                  <TableHead>Profit (ETH)</TableHead>
                  <TableHead>Profit (bps)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.map((opp) => (
                  <TableRow key={opp.id}>
                    <TableCell className="font-medium">{opp.loop_type}</TableCell>
                    <TableCell>{opp.trade_size_eth.toFixed(4)} ETH</TableCell>
                    <TableCell className={opp.expected_profit_eth > 0 ? 'text-green-600' : 'text-red-600'}>
                      {opp.expected_profit_eth > 0 ? <TrendingUp className="inline h-4 w-4 mr-1" /> : <TrendingDown className="inline h-4 w-4 mr-1" />}
                      {opp.expected_profit_eth.toFixed(6)}
                    </TableCell>
                    <TableCell>{opp.expected_profit_bps.toFixed(0)}</TableCell>
                    <TableCell>
                      {opp.executable ? (
                        <Badge variant="default">Executable</Badge>
                      ) : (
                        <Badge variant="secondary">{opp.skip_reason || 'Not Executable'}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(opp.detected_at).toLocaleTimeString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
