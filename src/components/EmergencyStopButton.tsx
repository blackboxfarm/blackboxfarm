import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePreviewSuperAdmin } from "@/hooks/usePreviewSuperAdmin";

export function EmergencyStopButton() {
  const [loading, setLoading] = useState(false);
  const [stopped, setStopped] = useState(false);
  const isPreview = usePreviewSuperAdmin();

  const handleEmergencyStop = async () => {
    setLoading(true);
    try {
      // IMPORTANT: 'cancelled' is not a valid status for this queue (DB constraint).
      // Use 'skipped' to immediately prevent posting.
      const { data, error } = await supabase
        .from("holders_intel_post_queue")
        .update({
          status: "skipped",
          error_message: "Emergency stop (Intel XBot)",
        })
        .in("status", ["pending", "processing"])
        .select("id");

      if (error) throw error;

      const clearedCount = data?.length ?? 0;

      setStopped(true);
      toast.success(`Intel XBot stopped. Cleared ${clearedCount} queued posts.`);
    } catch (err: any) {
      console.error("[Intel XBot] Emergency stop failed", err);
      toast.error(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Only show on preview/development environments
  if (!isPreview) {
    return null;
  }

  if (stopped) {
    return (
      <div className="fixed top-4 right-4 z-50 bg-primary text-primary-foreground p-4 rounded-lg shadow-xl">
        Intel XBot STOPPED
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <Button 
        onClick={handleEmergencyStop}
        disabled={loading}
        variant="destructive"
        size="lg"
        className="h-14 px-6 text-base font-semibold shadow-xl"
      >
        {loading ? "STOPPING..." : "EMERGENCY STOP INTEL XBOT"}
      </Button>
    </div>
  );
}
