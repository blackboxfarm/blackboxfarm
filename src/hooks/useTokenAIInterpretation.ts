import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AIKeyDriver {
  label: string;
  metric_value: string;
  bucket: string;
  implication: string;
}

export interface AIReasoningStep {
  metric: string;
  value: string;
  threshold_category: string;
  phrase_selected: string;
}

export interface AILifecycle {
  stage: 'Genesis' | 'Discovery' | 'Expansion' | 'Distribution' | 'Compression' | 'Dormant' | 'Reactivation';
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
}

export interface AIInterpretation {
  status_overview: string;
  lifecycle: AILifecycle;
  key_drivers: AIKeyDriver[];
  reasoning_trace: AIReasoningStep[];
  uncertainty_notes?: string[];
  abbreviated_summary: string;
}

export interface AIInterpretationResponse {
  interpretation: AIInterpretation;
  mode: string;
  mode_label?: string;
  mode_reason?: string;
  cached: boolean;
  cached_at?: string;
  metrics_context?: Record<string, unknown>;
}

export function useTokenAIInterpretation() {
  const [interpretation, setInterpretation] = useState<AIInterpretationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchInterpretation = useCallback(async (
    reportData: Record<string, unknown>,
    tokenMint: string,
    forceRefresh = false
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('token-ai-interpreter', {
        body: { reportData, tokenMint, forceRefresh }
      });

      if (invokeError) {
        throw new Error(invokeError.message || 'Failed to fetch AI interpretation');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setInterpretation(data as AIInterpretationResponse);
      return data as AIInterpretationResponse;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      
      // Show user-friendly toast for specific errors
      if (errorMessage.includes('Rate limit')) {
        toast({
          title: 'AI Rate Limited',
          description: 'Too many requests. Please wait a moment and try again.',
          variant: 'destructive'
        });
      } else if (errorMessage.includes('credits')) {
        toast({
          title: 'AI Credits Exhausted',
          description: 'AI analysis requires credits. Please add credits to continue.',
          variant: 'destructive'
        });
      }
      
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const reset = useCallback(() => {
    setInterpretation(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    interpretation,
    isLoading,
    error,
    fetchInterpretation,
    reset
  };
}