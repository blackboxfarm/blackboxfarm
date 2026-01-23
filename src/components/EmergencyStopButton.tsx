import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function EmergencyStopButton() {
  const [loading, setLoading] = useState(false);
  const [stopped, setStopped] = useState(false);

  const handleEmergencyStop = async () => {
    setLoading(true);
    try {
      // Cancel all pending posts directly
      const { error } = await supabase
        .from('holders_intel_post_queue')
        .update({ status: 'cancelled', error_message: 'Emergency stop' })
        .eq('status', 'pending');

      if (error) throw error;

      // Also cancel processing ones
      await supabase
        .from('holders_intel_post_queue')
        .update({ status: 'cancelled', error_message: 'Emergency stop' })
        .eq('status', 'processing');

      setStopped(true);
      toast.success("STOPPED! All pending posts cancelled.");
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (stopped) {
    return (
      <div className="fixed top-4 right-4 z-50 bg-green-600 text-white p-4 rounded-lg shadow-xl">
        ✅ Intel XBot STOPPED
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <Button 
        onClick={handleEmergencyStop}
        disabled={loading}
        className="bg-red-600 hover:bg-red-700 text-white text-xl px-8 py-6 shadow-xl"
      >
        {loading ? "STOPPING..." : "🛑 EMERGENCY STOP INTEL XBOT"}
      </Button>
    </div>
  );
}
