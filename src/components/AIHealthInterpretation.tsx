import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brain } from "lucide-react";

interface AIHealthInterpretationProps {
  tokenMint: string;
  reportData: any;
}

interface AIResult {
  lifecycle?: { stage: string; confidence: string; signals?: string[] };
  narrative?: string;
  riskFlags?: string[];
}

export function AIHealthInterpretation({ tokenMint, reportData }: AIHealthInterpretationProps) {
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Check if AI mode is enabled for holders_page
      const { data: modeData } = await supabase
        .from("platform_health_mode")
        .select("use_ai")
        .eq("medium", "holders_page")
        .single();

      if (cancelled) return;

      if (!modeData?.use_ai) {
        setEnabled(false);
        setLoading(false);
        return;
      }

      setEnabled(true);

      // Fetch AI interpretation
      try {
        const { data, error } = await supabase.functions.invoke("token-ai-interpreter", {
          body: { tokenMint, reportData },
        });

        if (!cancelled && data?.interpretation) {
          setAiResult(data.interpretation);
        }
      } catch (err) {
        console.error("[AIHealthInterpretation] Error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (tokenMint && reportData) {
      check();
    }

    return () => { cancelled = true; };
  }, [tokenMint, reportData]);

  if (!enabled || (!loading && !aiResult)) return null;

  if (loading) {
    return (
      <div className="mb-4 p-4 rounded-lg border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Brain className="h-4 w-4 animate-pulse" />
          <span>Generating AI health analysis...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 p-4 rounded-lg border border-primary/30 bg-primary/5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
        <Brain className="h-4 w-4 text-primary" />
        AI Health Analysis
      </h3>
      {aiResult?.lifecycle && (
        <div className="mb-2">
          <span className="text-xs font-medium text-primary">
            📍 {aiResult.lifecycle.stage}
          </span>
          <span className="text-xs text-muted-foreground ml-2">
            ({aiResult.lifecycle.confidence} confidence)
          </span>
          {aiResult.lifecycle.signals && aiResult.lifecycle.signals.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {aiResult.lifecycle.signals.slice(0, 3).map((s, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {aiResult?.narrative && (
        <p className="text-xs text-foreground/80 leading-relaxed">
          {aiResult.narrative}
        </p>
      )}
      {aiResult?.riskFlags && aiResult.riskFlags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {aiResult.riskFlags.map((flag, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
              ⚠️ {flag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
