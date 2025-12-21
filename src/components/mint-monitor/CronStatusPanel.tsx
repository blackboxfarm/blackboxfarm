import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, Copy, CheckCircle2, Info, Mail } from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const CronStatusPanel = () => {
  const [showSetup, setShowSetup] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
  const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || 'your-project-ref';

  const cronSQL = `-- Enable required extensions (run once in SQL editor)
SELECT cron.schedule(
  'mint-monitor-5min',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://${projectRef}.supabase.co/functions/v1/mint-monitor-scanner',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{"action": "run_cron"}'::jsonb
  ) AS request_id;
  $$
);`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Cron Monitoring Status
          </div>
          <Badge variant="outline" className="border-amber-500/50 text-amber-400">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Setup Required
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Status */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="p-3 rounded-lg bg-background/50">
            <div className="text-muted-foreground text-xs mb-1">Scan Frequency</div>
            <div className="font-medium">Every 5 minutes</div>
            <div className="text-xs text-muted-foreground">(when cron enabled)</div>
          </div>
          <div className="p-3 rounded-lg bg-background/50">
            <div className="text-muted-foreground text-xs mb-1">Notifications</div>
            <div className="font-medium flex items-center gap-1">
              <Mail className="h-3 w-3" /> Email Alerts
            </div>
            <div className="text-xs text-muted-foreground">On new mint detection</div>
          </div>
        </div>

        {/* How it works */}
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-300 mb-1">How it works:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Cron runs every 5 minutes checking all "active" wallets</li>
                <li>For each wallet, scans last hour of transactions for new mints</li>
                <li>New mints are saved to <code className="text-primary">mint_monitor_detections</code></li>
                <li>Email notification sent when new tokens detected</li>
                <li>Every scan is logged for review</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Setup Instructions */}
        <Collapsible open={showSetup} onOpenChange={setShowSetup}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              {showSetup ? '▼ Hide Setup Instructions' : '▶ Show Setup Instructions'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            <div className="text-sm space-y-2">
              <p className="font-medium">Step 1: Enable pg_cron & pg_net extensions</p>
              <p className="text-xs text-muted-foreground">
                Go to Supabase Dashboard → Database → Extensions → Enable "pg_cron" and "pg_net"
              </p>
            </div>

            <div className="text-sm space-y-2">
              <p className="font-medium">Step 2: Run this SQL in the SQL Editor</p>
              <div className="relative">
                <pre className="p-3 rounded bg-background text-xs overflow-x-auto max-h-[200px]">
                  {cronSQL}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(cronSQL)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-amber-400">
                ⚠️ Replace YOUR_ANON_KEY with your actual Supabase anon key
              </p>
            </div>

            <div className="text-sm space-y-2">
              <p className="font-medium">Step 3: Verify it's running</p>
              <p className="text-xs text-muted-foreground">
                Check <code className="text-primary">cron.job</code> table to see scheduled jobs.
                Logs appear in <code className="text-primary">cron.job_run_details</code>.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-2 text-sm text-green-300">
                <CheckCircle2 className="h-4 w-4" />
                <span>After setup, cron will automatically scan wallets every 5 minutes!</span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};
