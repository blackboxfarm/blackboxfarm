import { useCallback, useState } from 'react';
import type { PipelinePhase } from './PipelineProgressDialog';

export function usePipelineProgress() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('Generating Autopsy');
  const [phases, setPhases] = useState<PipelinePhase[]>([]);
  const [done, setDone] = useState(false);
  const [finalError, setFinalError] = useState<string | undefined>();

  const start = useCallback((label: string) => {
    setTitle(label);
    setPhases([]);
    setDone(false);
    setFinalError(undefined);
    setOpen(true);
  }, []);

  const onProgress = useCallback((p: PipelinePhase[]) => {
    setPhases(p);
  }, []);

  const finish = useCallback((err?: string) => {
    setFinalError(err);
    setDone(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return { open, title, phases, done, finalError, start, onProgress, finish, close };
}