import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Execution {
  id: string;
  loop_type: string;
  starting_amount_eth: number;
  final_amount_eth: number | null;
  realized_profit_eth: number | null;
  realized_profit_bps: number | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  total_gas_spent_eth: number | null;
  total_swap_fees_eth: number | null;
  total_bridge_fees_eth: number | null;
}

export function ExecutionsTab() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadExecutions();
    const interval = setInterval(loadExecutions, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const loadExecutions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('arb_loop_executions')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setExecutions(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading executions",
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

  const completed = executions.filter(e => e.status === 'completed');
  const totalProfit = completed.reduce((sum, e) => sum + (e.realized_profit_eth || 0), 0);
  const totalFees = completed.reduce((sum, e) => 
    sum + (e.total_gas_spent_eth || 0) + (e.total_swap_fees_eth || 0) + (e.total_bridge_fees_eth || 0), 0
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Executions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{executions.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{completed.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Profit</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProfit.toFixed(6)} ETH</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Fees</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFees.toFixed(6)} ETH</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
          <CardDescription>Recent arbitrage loop executions</CardDescription>
        </CardHeader>
        <CardContent>
          {executions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No executions yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loop</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>Profit %</TableHead>
                  <TableHead>Fees</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((exec) => (
                  <TableRow key={exec.id}>
                    <TableCell className="font-medium">{exec.loop_type}</TableCell>
                    <TableCell>{exec.starting_amount_eth.toFixed(4)} ETH</TableCell>
                    <TableCell className={exec.realized_profit_eth && exec.realized_profit_eth > 0 ? 'text-green-600' : 'text-red-600'}>
                      {exec.realized_profit_eth?.toFixed(6) || '—'} ETH
                    </TableCell>
                    <TableCell>{exec.realized_profit_bps?.toFixed(0) || '—'} bps</TableCell>
                    <TableCell>{(exec.total_gas_spent_eth || 0 + exec.total_swap_fees_eth || 0 + exec.total_bridge_fees_eth || 0).toFixed(6)}</TableCell>
                    <TableCell>
                      {exec.status === 'completed' && (
                        <Badge variant="default">
                          <CheckCircle className="mr-1 h-3 w-3" /> Completed
                        </Badge>
                      )}
                      {exec.status === 'failed' && (
                        <Badge variant="destructive">
                          <XCircle className="mr-1 h-3 w-3" /> Failed
                        </Badge>
                      )}
                      {exec.status === 'in_progress' && (
                        <Badge variant="secondary">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Running
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(exec.started_at).toLocaleString()}
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
