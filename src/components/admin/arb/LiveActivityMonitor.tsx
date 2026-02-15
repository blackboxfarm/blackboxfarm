import { useEffect, useState, useCallback } from "react";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingDown, Clock, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityLog {
  id: string;
  detected_at: string;
  loop_type: string;
  executable: boolean;
  expected_profit_bps: number;
  skip_reason: string | null;
  meets_profit_threshold: boolean;
}

export const LiveActivityMonitor = () => {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [botStatus, setBotStatus] = useState<any>(null);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: activitiesData } = await supabase
      .from("arb_opportunities")
      .select("*")
      .eq("user_id", user.id)
      .order("detected_at", { ascending: false })
      .limit(10);

    if (activitiesData) {
      setActivities(activitiesData);
    }

    const { data: statusData } = await supabase
      .from("arb_bot_status")
      .select("*")
      .eq("user_id", user.id)
      .single();

    setBotStatus(statusData);
  }, []);

  // Polling fallback - pauses when tab hidden
  useVisibleInterval(loadData, 10000);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('activity-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'arb_opportunities'
        },
        () => loadData()
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'arb_bot_status'
        },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const getActivityIcon = (activity: ActivityLog) => {
    if (activity.executable) {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    if (!activity.meets_profit_threshold) {
      return <TrendingDown className="h-4 w-4 text-yellow-500" />;
    }
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const getActivityColor = (activity: ActivityLog) => {
    if (activity.executable) return "bg-green-500/10 text-green-500 border-green-500/20";
    if (!activity.meets_profit_threshold) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    return "bg-muted";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Live Activity Feed
          </div>
          {botStatus && (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="text-xs">
                Last scan: {botStatus.last_scan_at ? formatDistanceToNow(new Date(botStatus.last_scan_at), { addSuffix: true }) : 'Never'}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Next scan: {botStatus.next_scan_at ? formatDistanceToNow(new Date(botStatus.next_scan_at), { addSuffix: true }) : 'Unknown'}
              </Badge>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No activity yet. The bot will scan for opportunities every 10 minutes.
            </p>
          ) : (
            activities.map((activity) => (
              <div
                key={activity.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${getActivityColor(activity)}`}
              >
                <div className="mt-0.5">
                  {getActivityIcon(activity)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {activity.loop_type} Scan
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(activity.detected_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      Profit: {activity.expected_profit_bps} bps
                    </Badge>
                    {activity.skip_reason && (
                      <span className="text-xs text-muted-foreground truncate">
                        {activity.skip_reason}
                      </span>
                    )}
                  </div>
                  {activity.executable && (
                    <p className="text-xs text-green-600 mt-1">
                      ✓ Executable opportunity detected!
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
