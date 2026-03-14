import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { AlertTriangle, Bot, CheckCircle2, Loader2, RefreshCw, Wrench } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type HealthStatus = "healthy" | "warning" | "critical";

interface TelegramBotHealthResponse {
  success: boolean;
  status: HealthStatus;
  tokenConfigured: boolean;
  issues: string[];
  expectedWebhookUrl: string;
  webhook: {
    actualUrl: string | null;
    matchesExpected: boolean;
    pendingUpdateCount: number;
    lastErrorDate: string | null;
    lastErrorMessage: string | null;
  };
  bot: {
    ok: boolean;
    username: string | null;
    firstName: string | null;
  };
}

export function TelegramBotApiStatusCard() {
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [health, setHealth] = useState<TelegramBotHealthResponse | null>(null);

  const loadStatus = async (action: "status" | "repair_webhook" = "status") => {
    const setBusy = action === "repair_webhook" ? setRepairing : setLoading;
    setBusy(true);

    try {
      const { data, error } = await supabase.functions.invoke("telegram-bot-health", {
        body: { action },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to check Telegram health");

      setHealth(data as TelegramBotHealthResponse);

      if (action === "repair_webhook") {
        toast.success("Webhook repaired and pending updates dropped");
      }
    } catch (err: any) {
      toast.error(err?.message || "Telegram health check failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const statusBadge = useMemo(() => {
    if (!health) return <Badge variant="secondary">Unknown</Badge>;

    if (health.status === "healthy") {
      return (
        <Badge className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> Healthy
        </Badge>
      );
    }

    if (health.status === "warning") {
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertTriangle className="h-3 w-3" /> Warning
        </Badge>
      );
    }

    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" /> Critical
      </Badge>
    );
  }, [health]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5" /> HoldersIntel Bot API Status
            </CardTitle>
            <CardDescription>
              Live token/webhook diagnostics from Telegram Bot API
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge}
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadStatus()}
              disabled={loading || repairing}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => loadStatus("repair_webhook")}
              disabled={repairing || loading}
            >
              {repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              Auto Repair
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {!health ? (
          <div className="text-sm text-muted-foreground">Loading Telegram diagnostics...</div>
        ) : (
          <>
            <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Bot Identity</p>
                <p className="font-medium">
                  {health.bot?.username ? `@${health.bot.username}` : "Not available"}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Token Configured</p>
                <p className="font-medium">{health.tokenConfigured ? "Yes" : "No"}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Webhook Match</p>
                <p className="font-medium">{health.webhook?.matchesExpected ? "Yes" : "No"}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Pending Updates</p>
                <p className="font-medium">{health.webhook?.pendingUpdateCount ?? 0}</p>
              </div>
            </div>

            {health.webhook?.lastErrorMessage && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <p className="font-medium text-destructive">Telegram last error</p>
                <p>{health.webhook.lastErrorMessage}</p>
                {health.webhook.lastErrorDate && (
                  <p className="mt-1 text-muted-foreground">
                    {formatDistanceToNow(new Date(health.webhook.lastErrorDate), { addSuffix: true })}
                  </p>
                )}
              </div>
            )}

            {health.issues?.length > 0 && (
              <div className="rounded-md border p-3 text-sm">
                <p className="mb-1 font-medium">Detected Issues</p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {health.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
