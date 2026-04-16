import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Clock } from "lucide-react";

const INTERVAL_OPTIONS = [
  { value: "15", label: "Every 15 min" },
  { value: "30", label: "Every 30 min" },
  { value: "60", label: "Every 60 min" },
];

export function PollingIntervalControl() {
  const [interval, setInterval_] = useState<string>("30");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("dex_scrape_config")
        .select("value")
        .eq("key", "polling_interval")
        .single();
      if (data?.value && typeof data.value === "object" && "interval_minutes" in (data.value as any)) {
        setInterval_(String((data.value as any).interval_minutes));
      }
      setLoading(false);
    })();
  }, []);

  const handleChange = async (val: string) => {
    setInterval_(val);
    try {
      const { data, error } = await supabase.functions.invoke("dex-top-200", {
        body: { action: "update_cron", interval_minutes: Number(val) },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Failed to update cron");
      toast({ title: `Polling interval set to ${val} minutes` });
    } catch (err: any) {
      toast({ title: "Failed to update interval", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Poll every:</span>
      <Select value={interval} onValueChange={handleChange} disabled={loading}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INTERVAL_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
