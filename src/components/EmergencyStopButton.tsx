import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePreviewSuperAdmin } from "@/hooks/usePreviewSuperAdmin";
import { Play, Square, Loader2 } from "lucide-react";

export function EmergencyStopButton() {
  const [stopLoading, setStopLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'stopped' | 'started'>('idle');
  const isPreview = usePreviewSuperAdmin();

  const handleEmergencyStop = async () => {
    setStopLoading(true);
    try {
      // Mark all pending/processing items as skipped
      const { data, error } = await supabase
        .from("holders_intel_post_queue")
        .update({
          status: "skipped",
          error_message: "Emergency stop (Intel XBot)",
        })
        .in("status", ["pending", "processing"])
        .select("id");

      if (error) throw error;

      // Also call the kill function to unschedule crons
      const { error: killError } = await supabase.functions.invoke('intel-xbot-kill');
      if (killError) console.warn("Kill function error:", killError);

      const clearedCount = data?.length ?? 0;
      setStatus('stopped');
      toast.success(`Intel XBot stopped. Cleared ${clearedCount} queued posts.`);
    } catch (err: any) {
      console.error("[Intel XBot] Emergency stop failed", err);
      toast.error(`Error: ${err.message}`);
    } finally {
      setStopLoading(false);
    }
  };

  const handleStart = async () => {
    setStartLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('intel-xbot-start');
      
      if (error) throw error;
      
      setStatus('started');
      toast.success(data?.message || 'Intel XBot crons started!');
      
      // Show detailed results
      if (data?.results) {
        const scheduled = data.results.filter((r: any) => r.status === 'scheduled').length;
        const failed = data.results.filter((r: any) => r.status !== 'scheduled');
        if (failed.length > 0) {
          console.warn("Some crons failed to schedule:", failed);
        }
      }
    } catch (err: any) {
      console.error("[Intel XBot] Start failed", err);
      toast.error(`Error: ${err.message}`);
    } finally {
      setStartLoading(false);
    }
  };

  // Only show on preview/development environments
  if (!isPreview) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex gap-2">
      {/* START Button */}
      <Button 
        onClick={handleStart}
        disabled={startLoading || stopLoading}
        size="lg"
        className="h-14 px-6 text-base font-semibold shadow-xl bg-green-600 hover:bg-green-700 text-white"
      >
        {startLoading ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            STARTING...
          </>
        ) : (
          <>
            <Play className="w-5 h-5 mr-2" />
            START INTEL XBOT
          </>
        )}
      </Button>

      {/* STOP Button */}
      <Button 
        onClick={handleEmergencyStop}
        disabled={stopLoading || startLoading}
        variant="destructive"
        size="lg"
        className="h-14 px-6 text-base font-semibold shadow-xl"
      >
        {stopLoading ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            STOPPING...
          </>
        ) : (
          <>
            <Square className="w-5 h-5 mr-2" />
            STOP
          </>
        )}
      </Button>

      {/* Status indicator */}
      {status !== 'idle' && (
        <div className={`flex items-center px-4 rounded-lg shadow-xl ${
          status === 'started' ? 'bg-green-600 text-white' : 'bg-primary text-primary-foreground'
        }`}>
          {status === 'started' ? '✓ RUNNING' : '⏹ STOPPED'}
        </div>
      )}
    </div>
  );
}
