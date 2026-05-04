import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PipelinePhase, PipelineSubStep } from './PipelineProgressDialog';

/** Map server-side phase keys to the client phase keys used by runFullAutopsyPipeline. */
const SERVER_TO_CLIENT_PHASE: Record<string, string> = {
  'mesh-hydrate': 'mesh-hydrate',
  'tx-timeline': 'tx-timeline',
  'community-sweep': 'community-sweep',
  'tg-deep-pull': 'tg-deep-pull',
  'writer': 'writer',
};

export function usePipelineProgress() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('Generating Autopsy');
  const [phases, setPhases] = useState<PipelinePhase[]>([]);
  const [done, setDone] = useState(false);
  const [finalError, setFinalError] = useState<string | undefined>();
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const phasesRef = useRef<PipelinePhase[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const [signal, setSignal] = useState<AbortSignal | undefined>();

  useEffect(() => { phasesRef.current = phases; }, [phases]);

  const start = useCallback((label: string) => {
    // Abort any previous run before starting a new one.
    controllerRef.current?.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    setSignal(ctrl.signal);
    setTitle(label);
    setPhases([]);
    phasesRef.current = [];
    setDone(false);
    setFinalError(undefined);
    setOpen(true);
    setCandidateId(null);
  }, []);

  const onProgress = useCallback((p: PipelinePhase[]) => {
    // Preserve any live sub-steps we received via realtime so the runner's
    // coarser snapshot doesn't overwrite the granular per-fetch trace.
    const live = phasesRef.current;
    const liveSubsByKey = new Map(live.map(ph => [ph.key, ph.subSteps ?? []] as const));
    const liveLogsByKey = new Map(live.map(ph => [ph.key, ph.log ?? []] as const));
    const merged = p.map(ph => {
      const liveSubs = liveSubsByKey.get(ph.key);
      const liveLogs = liveLogsByKey.get(ph.key);
      const next = { ...ph } as PipelinePhase;
      if (liveSubs && liveSubs.length > 0) next.subSteps = liveSubs;
      if (liveLogs && liveLogs.length > 0) next.log = [...(ph.log ?? []), ...liveLogs];
      return next;
    });
    phasesRef.current = merged;
    setPhases(merged);
  }, []);

  const bindCandidate = useCallback((id: string) => {
    setCandidateId(id);
  }, []);

  const finish = useCallback((err?: string) => {
    setFinalError(err);
    setDone(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    // Mark any in-flight phase as failed so the UI reflects cancellation immediately.
    const next = phasesRef.current.map(ph => {
      if (ph.status === 'running' || ph.status === 'retrying') {
        return {
          ...ph,
          status: 'failed' as const,
          error: 'Cancelled by user',
          endedAt: Date.now(),
          log: [...(ph.log ?? []), { ts: Date.now(), level: 'warn' as const, msg: '✗ Cancelled by user' }],
        };
      }
      return ph;
    });
    phasesRef.current = next;
    setPhases(next);
    setFinalError('Cancelled by user');
    setDone(true);
  }, []);

  // Subscribe to autopsy_pipeline_events for live sub-step trace.
  useEffect(() => {
    if (!open || !candidateId) return;

    const applyEvent = (row: any) => {
      const phaseKey = SERVER_TO_CLIENT_PHASE[row.phase];
      if (!phaseKey) return;
      const next = phasesRef.current.map(ph => {
        if (ph.key !== phaseKey) return ph;
        const existing = ph.subSteps ?? [];
        const idx = existing.findIndex(s => s.step === row.step);
        const sub: PipelineSubStep = {
          step: row.step,
          status: row.status,
          detail: row.detail ?? undefined,
          reason: row.reason ?? undefined,
          outcome: row.outcome ?? undefined,
          ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        };
        const subSteps = idx >= 0
          ? existing.map((s, i) => i === idx ? { ...s, ...sub } : s)
          : [...existing, sub];
        const logLine = {
          ts: sub.ts!,
          level: (row.status === 'fail' ? 'error'
                : row.status === 'ok' ? 'success'
                : row.status === 'skipped' ? 'warn'
                : 'info') as 'info' | 'warn' | 'error' | 'success',
          msg: `${row.step}: ${row.status}${row.detail ? ' — ' + row.detail : ''}${row.reason ? ' — ' + row.reason : ''}`,
        };
        const log = [...(ph.log ?? []), logLine];
        return { ...ph, subSteps, log };
      });
      phasesRef.current = next;
      setPhases(next);
    };

    // Backfill any events that already happened before the subscription attached.
    supabase
      .from('autopsy_pipeline_events')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: true })
      .then(({ data }) => { (data ?? []).forEach(applyEvent); });

    const ch = supabase
      .channel(`pipeline-events-${candidateId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'autopsy_pipeline_events',
          filter: `candidate_id=eq.${candidateId}`,
        },
        (payload) => applyEvent(payload.new),
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [open, candidateId]);

  return { open, title, phases, done, finalError, start, onProgress, finish, close, bindCandidate, cancel, signal };
}