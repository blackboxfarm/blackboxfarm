import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, Fingerprint, Network, Zap, AlertTriangle } from "lucide-react";

interface FeatureFlag {
  feature_name: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
}

const FEATURE_CONFIG: Record<string, { label: string; icon: React.ReactNode; tier: string }> = {
  behavioral_scoring: {
    label: "Behavioral Scoring Engine",
    icon: <Shield className="h-4 w-4" />,
    tier: "Tier 1",
  },
  template_fingerprinting: {
    label: "Template Fingerprinting",
    icon: <Fingerprint className="h-4 w-4" />,
    tier: "Tier 1",
  },
  co_mint_clustering: {
    label: "Co-Mint Cluster Detection",
    icon: <Network className="h-4 w-4" />,
    tier: "Tier 1",
  },
  predictive_burst_mode: {
    label: "Predictive Burst Mode",
    icon: <Zap className="h-4 w-4" />,
    tier: "Tier 2",
  },
  funding_contamination: {
    label: "Funding Tree Contamination",
    icon: <AlertTriangle className="h-4 w-4" />,
    tier: "Tier 2",
  },
};

export function IntelligenceFeatureToggles() {
  const queryClient = useQueryClient();

  const { data: flags, isLoading } = useQuery({
    queryKey: ["intelligence-feature-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intelligence_feature_flags")
        .select("*")
        .order("feature_name");
      if (error) throw error;
      return data as FeatureFlag[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ feature_name, enabled }: { feature_name: string; enabled: boolean }) => {
      const { data, error } = await supabase
        .from("intelligence_feature_flags")
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq("feature_name", feature_name)
        .select();
      if (error) throw error;
      if (!data?.length) throw new Error("Update failed — check admin permissions");
      return { feature_name, enabled };
    },
    onMutate: async ({ feature_name, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ["intelligence-feature-flags"] });
      const previous = queryClient.getQueryData<FeatureFlag[]>(["intelligence-feature-flags"]);
      queryClient.setQueryData<FeatureFlag[]>(["intelligence-feature-flags"], (old) =>
        old?.map((f) => (f.feature_name === feature_name ? { ...f, enabled } : f))
      );
      return { previous };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["intelligence-feature-flags"] });
      const cfg = FEATURE_CONFIG[variables.feature_name];
      const state = variables.enabled ? "✅ Enabled" : "⛔ Disabled";
      toast.success(`${cfg?.label || variables.feature_name} → ${state}`);
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["intelligence-feature-flags"], context.previous);
      }
      toast.error(err.message);
    },
  });

  const disableAll = () => {
    flags?.forEach((f) => {
      if (f.enabled) {
        toggleMutation.mutate({ feature_name: f.feature_name, enabled: false });
      }
    });
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Intelligence Feature Toggles — Failsafe Control
          </CardTitle>
          <button
            onClick={disableAll}
            className="text-[10px] px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors font-medium"
          >
            ⛔ DISABLE ALL
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {flags?.map((flag) => {
          const cfg = FEATURE_CONFIG[flag.feature_name] || {
            label: flag.feature_name,
            icon: null,
            tier: "?",
          };
          return (
            <div
              key={flag.feature_name}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <div className="text-muted-foreground">{cfg.icon}</div>
                <div>
                  <p className="text-sm font-medium">
                    <span className="text-xs text-muted-foreground mr-1">[{cfg.tier}]</span>
                    {cfg.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{flag.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${flag.enabled ? "text-green-500" : "text-muted-foreground"}`}>
                  {flag.enabled ? "✅ Active" : "⛔ Off"}
                </span>
                <Switch
                  checked={flag.enabled}
                  onCheckedChange={(checked) =>
                    toggleMutation.mutate({ feature_name: flag.feature_name, enabled: checked })
                  }
                />
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-muted-foreground">
          Toggle any feature off instantly. Edge functions will skip execution when disabled.
          Use "DISABLE ALL" as emergency rollback — existing data is preserved.
        </p>
      </CardContent>
    </Card>
  );
}
