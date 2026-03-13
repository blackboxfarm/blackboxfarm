import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Eye, Sparkles, Shield, Twitter, Network } from "lucide-react";

interface MonitorConfig {
  id: string;
  is_enabled: boolean;
  monitor_is_enabled: boolean;
  enricher_is_enabled: boolean;
  kol_scanner_is_enabled: boolean;
  community_enricher_is_enabled: boolean;
  social_mesh_linker_is_enabled: boolean;
}

const SERVICE_CONFIG = [
  {
    field: "monitor_is_enabled" as const,
    label: "Watchlist Monitor",
    icon: <Eye className="h-4 w-4" />,
    description: "Scores watching tokens every 5min (up to 50/run). Promotes to qualified or marks dead/rejected.",
    emoji: "👁️",
  },
  {
    field: "enricher_is_enabled" as const,
    label: "Token Enricher",
    icon: <Sparkles className="h-4 w-4" />,
    description: "Triages pending_triage tokens (5/run). Runs RugCheck, bundle/authority/bump analysis, blacklist mesh.",
    emoji: "🔬",
  },
  {
    field: "community_enricher_is_enabled" as const,
    label: "X Community Enricher",
    icon: <Shield className="h-4 w-4" />,
    description: "Apify-powered X Community member scraping. Used by social-mesh-linker, FlipIt, MeshSpider, and manual scrape actions.",
    emoji: "🏘️",
  },
  {
    field: "social_mesh_linker_is_enabled" as const,
    label: "Social Mesh Linker",
    icon: <Network className="h-4 w-4" />,
    description: "Background cron (10min). Auto-links Twitter, Telegram, website socials to creator wallets in reputation mesh. Triggers x-community-enricher for communities.",
    emoji: "🔗",
  },
  {
    field: "kol_scanner_is_enabled" as const,
    label: "KOL Twitter Scanner",
    icon: <Twitter className="h-4 w-4" />,
    description: "Apify-powered KOL timeline scraping. Uses paid compute units per scan. Disable to save Apify credits.",
    emoji: "🐦",
  },
  {
    field: "is_enabled" as const,
    label: "Master Kill Switch",
    icon: <Shield className="h-4 w-4" />,
    description: "Disables ALL pump.fun pipeline services at once.",
    emoji: "🛑",
  },
];

export function ServiceToggles() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["pumpfun-monitor-config"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("pumpfun_monitor_config" as any)
        .select("id, is_enabled, monitor_is_enabled, enricher_is_enabled, kol_scanner_is_enabled, community_enricher_is_enabled, social_mesh_linker_is_enabled")
        .limit(1)
        .single() as any);
      if (error) throw error;
      return data as MonitorConfig;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: boolean }) => {
      const { data, error } = await (supabase
        .from("pumpfun_monitor_config" as any)
        .update({ [field]: value })
        .eq("id", config!.id)
        .select() as any);
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Update failed");
      return { field, value };
    },
    onMutate: async ({ field, value }) => {
      await queryClient.cancelQueries({ queryKey: ["pumpfun-monitor-config"] });
      const previous = queryClient.getQueryData<MonitorConfig>(["pumpfun-monitor-config"]);
      queryClient.setQueryData<MonitorConfig>(["pumpfun-monitor-config"], (old) =>
        old ? { ...old, [field]: value } : old
      );
      return { previous };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pumpfun-monitor-config"] });
      const svc = SERVICE_CONFIG.find((s) => s.field === variables.field);
      toast.success(`${svc?.label ?? variables.field} → ${variables.value ? "✅ ON" : "⏸️ OFF"}`);
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["pumpfun-monitor-config"], context.previous);
      toast.error(err.message);
    },
  });

  // Fetch live counts
  const { data: counts } = useQuery({
    queryKey: ["pumpfun-pipeline-counts"],
    queryFn: async () => {
      const { data } = await (supabase
        .from("pumpfun_watchlist" as any)
        .select("status") as any);
      const c: Record<string, number> = {};
      for (const row of (data || [])) {
        c[row.status] = (c[row.status] || 0) + 1;
      }
      return c;
    },
    refetchInterval: 30000,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>;
  if (!config) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Pipeline Services
          </CardTitle>
          <div className="flex gap-2">
            {counts && (
              <>
                <Badge variant="outline" className="text-xs">👁️ {counts["watching"] || 0} watching</Badge>
                <Badge variant="outline" className="text-xs">⏳ {counts["pending_triage"] || 0} pending</Badge>
                <Badge variant="outline" className="text-xs">✅ {counts["qualified"] || 0} qualified</Badge>
                <Badge variant="secondary" className="text-xs">❌ {counts["rejected"] || 0} rejected</Badge>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {SERVICE_CONFIG.map((svc) => {
          const isOn = config[svc.field];
          const isKillSwitch = svc.field === "is_enabled";
          return (
            <div
              key={svc.field}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                isKillSwitch ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="text-muted-foreground">{svc.icon}</div>
                <div>
                  <p className="text-sm font-medium">
                    {svc.emoji} {svc.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{svc.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${isOn ? "text-green-500" : "text-muted-foreground"}`}>
                  {isOn ? "✅ ON" : "⏸️ OFF"}
                </span>
                <Switch
                  checked={isOn}
                  onCheckedChange={(checked) =>
                    toggleMutation.mutate({ field: svc.field, value: checked })
                  }
                />
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-muted-foreground">
          Monitor checks 50 watching tokens/run (skips recently checked). Enricher processes 5 pending_triage tokens/run.
          Tokens exit via: rejected, dead, qualified, or max watch time (600min).
        </p>
      </CardContent>
    </Card>
  );
}

export default ServiceToggles;
