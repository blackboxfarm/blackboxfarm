import React, { useState } from "react";
import { MessageSquarePlus, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const FEEDBACK_TYPES = [
  { value: "improvement", label: "💡 Improvement", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { value: "bug", label: "🐛 Bug", color: "bg-red-500/20 text-red-300 border-red-500/30" },
  { value: "confusion", label: "❓ Confusing", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  { value: "removal", label: "🗑️ Remove This", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  { value: "general", label: "💬 General", color: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" },
];

export function TesterFeedbackWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("general");
  const [message, setMessage] = useState("");

  // Check if user is an active tester
  const { data: isTester } = useQuery({
    queryKey: ["is-tester", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase
        .from("promo_redemptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gte("expires_at", new Date().toISOString())
        .limit(1);
      if (error) return false;
      return (data?.length || 0) > 0;
    },
    enabled: !!user?.id,
  });

  const submitFeedback = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tester_feedback").insert({
        user_id: user!.id,
        feedback_type: type,
        page_path: location.pathname,
        message: message.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Thank you!", description: "Your feedback has been submitted." });
      setMessage("");
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!isTester) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-110 flex items-center justify-center"
          title="Share feedback"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </button>
      )}

      {/* Feedback panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border bg-card shadow-2xl p-4 space-y-3 animate-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">🧪 Tester Feedback</h3>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            Page: <span className="font-mono">{location.pathname}</span>
          </p>

          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={cn(
                  "text-xs px-2 py-1 rounded-md border transition-all",
                  type === t.value ? t.color + " ring-1 ring-offset-1 ring-offset-background" : "bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/50"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <Textarea
            placeholder="What's on your mind? Tell us anything..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            className="text-sm"
          />

          <Button
            size="sm"
            className="w-full"
            onClick={() => submitFeedback.mutate()}
            disabled={!message.trim() || submitFeedback.isPending}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {submitFeedback.isPending ? "Sending..." : "Submit Feedback"}
          </Button>
        </div>
      )}
    </>
  );
}
