import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Ban, Shield, Clock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const DeveloperAlerts = () => {
  const { data: alerts, isLoading, refetch } = useQuery({
    queryKey: ['developer-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('developer_alerts')
        .select(`
          *,
          developer_profiles(display_name, reputation_score, trust_level)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching developer alerts:', error);
        throw error;
      }

      return data;
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const getRiskBadge = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical':
        return (
          <Badge variant="destructive" className="gap-1">
            <Ban className="h-3 w-3" />
            Critical
          </Badge>
        );
      case 'high':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            High
          </Badge>
        );
      case 'medium':
        return (
          <Badge variant="outline" className="gap-1">
            <Shield className="h-3 w-3" />
            Medium
          </Badge>
        );
      default:
        return <Badge variant="secondary">{riskLevel}</Badge>;
    }
  };

  const getAlertTypeBadge = (alertType: string) => {
    switch (alertType) {
      case 'blacklisted_developer':
        return <Badge variant="destructive">Blacklisted Developer</Badge>;
      case 'high_risk_developer':
        return <Badge variant="destructive">High Risk Developer</Badge>;
      case 'rug_pull_detected':
        return <Badge variant="destructive">Rug Pull Detected</Badge>;
      case 'suspicious_activity':
        return <Badge>Suspicious Activity</Badge>;
      default:
        return <Badge variant="outline">{alertType}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Developer Alerts</CardTitle>
          <CardDescription>Real-time alerts for high-risk developer activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Developer Alerts
          </CardTitle>
          <CardDescription>
            Real-time alerts for high-risk developer activity
          </CardDescription>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {!alerts || alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No alerts detected</p>
            <p className="text-sm">The system will notify you when high-risk developers are detected</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Alert Type</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead>Token Mint</TableHead>
                  <TableHead>Creator Wallet</TableHead>
                  <TableHead>Developer</TableHead>
                  <TableHead>Rep Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell>{getAlertTypeBadge(alert.alert_type)}</TableCell>
                    <TableCell>{getRiskBadge(alert.risk_level)}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {alert.token_mint.slice(0, 8)}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {alert.creator_wallet.slice(0, 8)}...
                      </code>
                    </TableCell>
                    <TableCell>
                      {alert.developer_profiles?.display_name || 'Unknown'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {alert.metadata?.reputationScore || alert.developer_profiles?.reputation_score || 'N/A'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
