import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Brain, Bot, Globe, Twitter } from "lucide-react";

interface HealthMode {
  id: string;
  medium: string;
  use_ai: boolean;
  updated_at: string;
}

const MEDIUM_CONFIG: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  telegram_bot: {
    label: "Telegram Bot",
    icon: <Bot className="h-4 w-4" />,
    description: "/holders, /verdict, /ca commands",
  },
  holders_page: {
    label: "/holders Page",
    icon: <Globe className="h-4 w-4" />,
    description: "Public BaglessHoldersReport UI",
  },
  x_posts: {
    label: "HoldersIntel X Posts",
    icon: <Twitter className="h-4 w-4" />,
    description: "Intel XBot automated posts",
  },
};

export function HealthModeToggles() {
  const queryClient = useQueryClient();

  const { data: modes, isLoading } = useQuery({
    queryKey: ["platform-health-mode"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_health_mode")
        .select("*")
        .order("medium");
      if (error) throw error;
      return data as HealthMode[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, use_ai, label }: { id: string; use_ai: boolean; label: string }) => {
      const { data, error, count } = await supabase
        .from("platform_health_mode")
        .update({ use_ai, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Update failed — check your admin permissions");
      return { use_ai, label };
    },
    onMutate: async ({ id, use_ai }) => {
      await queryClient.cancelQueries({ queryKey: ["platform-health-mode"] });
      const previous = queryClient.getQueryData<HealthMode[]>(["platform-health-mode"]);
      queryClient.setQueryData<HealthMode[]>(["platform-health-mode"], (old) =>
        old?.map((m) => (m.id === id ? { ...m, use_ai } : m))
      );
      return { previous };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-health-mode"] });
      const mode = variables.use_ai ? "🧠 AI" : "📊 Basic";
      toast.success(`${variables.label} → ${mode}`);
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["platform-health-mode"], context.previous);
      }
      toast.error(err.message);
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Health Score Mode — Basic vs AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {modes?.map((mode) => {
          const cfg = MEDIUM_CONFIG[mode.medium] || {
            label: mode.medium,
            icon: null,
            description: "",
          };
          return (
            <div
              key={mode.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <div className="text-muted-foreground">{cfg.icon}</div>
                <div>
                  <p className="text-sm font-medium">{cfg.label}</p>
                  <p className="text-xs text-muted-foreground">{cfg.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${mode.use_ai ? "text-primary" : "text-muted-foreground"}`}>
                  {mode.use_ai ? "🧠 AI" : "📊 Basic"}
                </span>
                <Switch
                  checked={mode.use_ai}
                  onCheckedChange={(checked) =>
                    toggleMutation.mutate({ id: mode.id, use_ai: checked })
                  }
                />
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-muted-foreground">
          AI mode uses Gemini to generate lifecycle analysis, narrative health interpretation & enhanced scoring.
          Basic mode uses deterministic weighted metrics only.
        </p>
      </CardContent>
    </Card>
  );
}
