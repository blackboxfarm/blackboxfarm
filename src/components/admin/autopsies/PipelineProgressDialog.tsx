import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, RotateCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type PhaseStatus = 'pending' | 'running' | 'retrying' | 'success' | 'failed' | 'skipped';

export type SubOutcome = 'value_present' | 'confirmed_empty' | 'fetch_failed';
export type SubStatus = 'running' | 'ok' | 'fail' | 'skipped' | 'info';

export interface PipelineSubStep {
  step: string;
  status?: SubStatus;
  ok?: boolean;          // legacy field from server steps[]
  detail?: string;
  reason?: string;
  outcome?: SubOutcome;
  ts?: number;
}

export interface PipelineLogLine {
  ts: number;
  level: 'info' | 'warn' | 'error' | 'success';
  msg: string;
}

export interface PipelinePhase {
  key: string;
  label: string;
  purpose?: string;
  status: PhaseStatus;
  attempt: number;
  maxAttempts: number;
  detail?: string;
  error?: string;
  startedAt?: number;
  endedAt?: number;
  subSteps?: PipelineSubStep[];
  log?: PipelineLogLine[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  phases: PipelinePhase[];
  done: boolean;
  finalError?: string;
  onCancel?: () => void;
}

function StatusIcon({ status }: { status: PhaseStatus }) {
  switch (status) {
    case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':  return <XCircle className="h-4 w-4 text-destructive" />;
    case 'running': return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    case 'retrying': return <RotateCw className="h-4 w-4 text-amber-500 animate-spin" />;
    case 'skipped': return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    default: return <div className="h-4 w-4 rounded-full border border-muted-foreground/40" />;
  }
}

function SubStepIcon({ s }: { s: PipelineSubStep }) {
  const status = s.status ?? (s.ok === true ? 'ok' : s.ok === false ? 'fail' : 'info');
  if (status === 'running') return <Loader2 className="h-3 w-3 text-primary animate-spin" />;
  if (status === 'ok')      return <CheckCircle2 className="h-3 w-3 text-green-500" />;
  if (status === 'fail')    return <XCircle className="h-3 w-3 text-destructive" />;
  if (status === 'skipped') return <AlertTriangle className="h-3 w-3 text-muted-foreground" />;
  return <span className="h-3 w-3 inline-block">·</span>;
}

/** Live elapsed counter — ticks every 500ms while phase is active. */
function useLiveElapsed(p: PipelinePhase): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (p.status === 'running' || p.status === 'retrying') {
      const t = setInterval(() => force((n) => n + 1), 500);
      return () => clearInterval(t);
    }
  }, [p.status]);
  if (!p.startedAt) return null;
  const end = p.endedAt ?? Date.now();
  return `${((end - p.startedAt) / 1000).toFixed(1)}s`;
}

function PhaseCard({ p }: { p: PipelinePhase }) {
  const dur = useLiveElapsed(p);
  const recentLog = (p.log ?? []).slice(-6);
  return (
    <div className="border rounded-md p-3 bg-muted/20">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusIcon status={p.status} />
        <span className="font-medium text-sm">{p.label}</span>
        {p.attempt > 1 && (
          <Badge variant="outline" className="text-[10px]">
            attempt {p.attempt}/{p.maxAttempts}
          </Badge>
        )}
        {dur && <span className="text-[10px] text-muted-foreground ml-auto font-mono">⏱ {dur}</span>}
      </div>
      {p.purpose && (
        <div className="text-[11px] text-muted-foreground mt-1 italic">
          {p.purpose}
        </div>
      )}
      {p.detail && (
        <div className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap break-words">
          {p.detail}
        </div>
      )}
      {p.error && (
        <div className="text-xs text-destructive mt-1.5 whitespace-pre-wrap break-words">
          ⚠ {p.error}
        </div>
      )}
      {p.subSteps && p.subSteps.length > 0 && (
        <div className="mt-2 space-y-1 pl-2 border-l border-muted-foreground/20 ml-1">
          {p.subSteps.map((s, i) => (
            <div key={i} className="text-[11px] flex items-start gap-2">
              <span className="mt-0.5"><SubStepIcon s={s} /></span>
              <span className="font-mono text-foreground/80">{s.step}</span>
              <span className="text-muted-foreground flex-1 break-words">
                {s.status === 'running' ? 'running…' : (s.detail ?? s.reason ?? 'ok')}
              </span>
            </div>
          ))}
        </div>
      )}
      {recentLog.length > 0 && (
        <div className="mt-2 text-[10px] font-mono text-muted-foreground/80 space-y-0.5 max-h-24 overflow-y-auto">
          {recentLog.map((l, i) => (
            <div key={i} className={
              l.level === 'error' ? 'text-destructive' :
              l.level === 'warn' ? 'text-amber-500' :
              l.level === 'success' ? 'text-green-500' :
              ''
            }>
              · {l.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PipelineProgressDialog({ open, onClose, title, phases, done, finalError, onCancel }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (v) return;
      if (done) onClose();
      else if (onCancel) onCancel();
    }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!done && <Loader2 className="h-4 w-4 animate-spin" />}
            {title}
          </DialogTitle>
          <DialogDescription>
            Live trace of every fetch and retry. AI stages only run after all data phases succeed.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-3">
            {phases.map((p) => <PhaseCard key={p.key} p={p} />)}
          </div>
        </ScrollArea>

        {finalError && (
          <div className="text-sm text-destructive border-t pt-3">
            Pipeline aborted: {finalError}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          {!done && onCancel && (
            <Button variant="destructive" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={!done}>
            {done ? 'Close' : 'Running…'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}