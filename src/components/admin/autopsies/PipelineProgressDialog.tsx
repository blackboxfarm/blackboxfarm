import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, RotateCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type PhaseStatus = 'pending' | 'running' | 'retrying' | 'success' | 'failed' | 'skipped';

export interface PipelinePhase {
  key: string;
  label: string;
  status: PhaseStatus;
  attempt: number;
  maxAttempts: number;
  detail?: string;
  error?: string;
  startedAt?: number;
  endedAt?: number;
  subSteps?: { step: string; ok: boolean; detail?: string; reason?: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  phases: PipelinePhase[];
  done: boolean;
  finalError?: string;
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

export default function PipelineProgressDialog({ open, onClose, title, phases, done, finalError }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && done) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!done && <Loader2 className="h-4 w-4 animate-spin" />}
            {title}
          </DialogTitle>
          <DialogDescription>
            Each step retries up to its max before failing. AI stages only run after all data phases succeed.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-3">
            {phases.map((p) => {
              const dur = p.startedAt && p.endedAt ? `${((p.endedAt - p.startedAt) / 1000).toFixed(1)}s` : null;
              return (
                <div key={p.key} className="border rounded-md p-3 bg-muted/20">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusIcon status={p.status} />
                    <span className="font-medium text-sm">{p.label}</span>
                    {p.attempt > 1 && (
                      <Badge variant="outline" className="text-[10px]">
                        attempt {p.attempt}/{p.maxAttempts}
                      </Badge>
                    )}
                    {dur && <span className="text-[10px] text-muted-foreground ml-auto">{dur}</span>}
                  </div>
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
                    <div className="mt-2 space-y-0.5 pl-6">
                      {p.subSteps.map((s, i) => (
                        <div key={i} className="text-[11px] flex gap-2">
                          <span>{s.ok ? '✓' : '⚠'}</span>
                          <span className="font-mono">{s.step}</span>
                          <span className="text-muted-foreground truncate">
                            {s.ok ? (s.detail ?? 'ok') : (s.reason ?? 'no detail')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {finalError && (
          <div className="text-sm text-destructive border-t pt-3">
            Pipeline aborted: {finalError}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={onClose} disabled={!done}>
            {done ? 'Close' : 'Running…'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}