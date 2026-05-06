import { supabase } from '@/integrations/supabase/client';
import type { PipelinePhase, PhaseStatus, PipelineLogLine } from './PipelineProgressDialog';

type ToastFn = (args: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void;

export type CandidateUpsert = {
  token_mint: string;
  ticker?: string | null;
  token_name?: string | null;
  tier?: 'A' | 'B' | 'C';
  source_feed: string;
  candidate_score?: number | null;
  death_confidence?: number | null;
  ath_mcap_usd?: number | null;
  current_mcap_usd?: number | null;
  liquidity_usd?: number | null;
  age_hours?: number | null;
  creator_wallet?: string | null;
};

export type RunPipelineArgs = {
  toast: ToastFn;
  /** Either provide an existing candidate_id, or an upsert spec to create/find one. */
  candidateId?: string;
  upsert?: CandidateUpsert;
  /** Fallback when only candidateId is provided — looked up if missing. */
  mint?: string;
  /** Optional live progress reporter used by the manual-Generate dialog. */
  onProgress?: (phases: PipelinePhase[]) => void;
  /** Called once the candidate row is resolved so the dialog can subscribe to live events. */
  onCandidateResolved?: (candidateId: string) => void;
  /** Override default per-phase max attempts (default 10). */
  maxAttempts?: number;
  /** Abort signal — when triggered, the pipeline stops between phases and bails out. */
  signal?: AbortSignal;
};

export type RunPipelineResult = {
  ok: boolean;
  candidateId?: string;
  identity?: any;
  error?: string;
  phases?: PipelinePhase[];
};

const DEFAULT_MAX_ATTEMPTS = 10;
const RETRY_BASE_DELAY_MS = 2000;

const PHASE_PURPOSE: Record<string, string> = {
  'candidate':       'Find or create the autopsy_candidates row for this mint.',
  'mesh-hydrate':    'Pull identity, creator wallet, socials and holder snapshot via token-mesh-hydrate (DexScreener → Pump.fun → Helius → harvest-token-socials → x-community → capture-holder-snapshot).',
  'tx-timeline':     'Reconstruct the on-chain buy/sell timeline (autopsy-tx-timeline).',
  'tg-deep-pull':    'Scrape the Telegram channel members + recent messages.',
  'community-sweep': 'Run the X-community vulture + dissent lenses for sentiment forensics.',
  'writer':          'Send the assembled mesh to the AI writer to draft the autopsy report.',
};

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isAbort(e: any): boolean {
  return e?.name === 'AbortError' || /aborted/i.test(e?.message ?? '');
}

function pushLog(phase: PipelinePhase, level: PipelineLogLine['level'], msg: string) {
  phase.log = [...(phase.log ?? []), { ts: Date.now(), level, msg }];
}

/**
 * Run a single phase with up to `maxAttempts` retries. Caller's runner returns
 * `{ ok, detail?, error?, subSteps? }`. If never ok after retries, phase fails.
 */
async function runPhase<T>(
  phases: PipelinePhase[],
  emit: (p: PipelinePhase[]) => void,
  phase: PipelinePhase,
  runner: () => Promise<{ ok: boolean; detail?: string; error?: string; data?: T; subSteps?: PipelinePhase['subSteps'] }>,
  signal?: AbortSignal,
): Promise<{ ok: boolean; data?: T }> {
  phase.startedAt = Date.now();
  pushLog(phase, 'info', `▶ Starting: ${phase.label}`);
  for (let attempt = 1; attempt <= phase.maxAttempts; attempt++) {
    if (signal?.aborted) {
      phase.status = 'failed';
      phase.error = 'Cancelled by user';
      phase.endedAt = Date.now();
      pushLog(phase, 'warn', '✗ Cancelled by user');
      emit([...phases]);
      return { ok: false };
    }
    phase.attempt = attempt;
    phase.status = attempt === 1 ? 'running' : 'retrying';
    phase.error = undefined;
    pushLog(phase, 'info', `Attempt ${attempt}/${phase.maxAttempts} — invoking…`);
    emit([...phases]);
    try {
      const r = await runner();
      if (r.ok) {
        phase.status = 'success';
        phase.detail = r.detail;
        phase.subSteps = r.subSteps;
        phase.endedAt = Date.now();
        const dur = ((phase.endedAt - phase.startedAt!) / 1000).toFixed(1);
        pushLog(phase, 'success', `✓ Succeeded on attempt ${attempt} (${dur}s)${r.detail ? ' — ' + r.detail : ''}`);
        emit([...phases]);
        return { ok: true, data: r.data };
      }
      phase.error = r.error ?? 'phase reported not-ok';
      phase.subSteps = r.subSteps ?? phase.subSteps;
      pushLog(phase, 'error', `✗ Attempt ${attempt} failed: ${phase.error}`);
    } catch (e: any) {
      if (isAbort(e)) {
        phase.status = 'failed';
        phase.error = 'Cancelled by user';
        phase.endedAt = Date.now();
        pushLog(phase, 'warn', '✗ Cancelled by user');
        emit([...phases]);
        return { ok: false };
      }
      phase.error = e?.message ?? String(e);
      pushLog(phase, 'error', `✗ Attempt ${attempt} threw: ${phase.error}`);
    }
    emit([...phases]);
    if (attempt < phase.maxAttempts) {
      const backoff = Math.min(RETRY_BASE_DELAY_MS * attempt, 10_000);
      pushLog(phase, 'warn', `↻ Backing off ${(backoff / 1000).toFixed(1)}s before retry…`);
      emit([...phases]);
      try {
        await sleep(backoff, signal);
      } catch (e) {
        if (isAbort(e)) {
          phase.status = 'failed';
          phase.error = 'Cancelled by user';
          phase.endedAt = Date.now();
          pushLog(phase, 'warn', '✗ Cancelled by user');
          emit([...phases]);
          return { ok: false };
        }
        throw e;
      }
    }
  }
  phase.status = 'failed';
  phase.endedAt = Date.now();
  pushLog(phase, 'error', `✗ All ${phase.maxAttempts} attempts exhausted — phase failed.`);
  emit([...phases]);
  return { ok: false };
}

/**
 * Runs the full autopsy forensic pipeline with hard retries on every step.
 * Order: candidate-upsert → mesh-hydrate → tx-timeline → tg-deep-pull (if TG) →
 *        community-sweep → writer. Each step retries up to maxAttempts (default 10).
 * AI stages (community-sweep + writer) refuse to run if any data stage failed.
 */
export async function runFullAutopsyPipeline(args: RunPipelineArgs): Promise<RunPipelineResult> {
  const { toast, onProgress, maxAttempts = DEFAULT_MAX_ATTEMPTS, signal } = args;
  const phases: PipelinePhase[] = [];
  const emit = (p: PipelinePhase[]) => { onProgress?.(p); };
  const cancelled = (): RunPipelineResult => ({ ok: false, error: 'Cancelled by user', phases });
  const addPhase = (key: string, label: string, max = maxAttempts): PipelinePhase => {
    const p: PipelinePhase = {
      key, label,
      purpose: PHASE_PURPOSE[key],
      status: 'pending',
      attempt: 0,
      maxAttempts: max,
      log: [],
    };
    phases.push(p);
    emit([...phases]);
    return p;
  };

  try {
    // 1. Resolve / create candidate row.
    let candidateId = args.candidateId;
    let mint = args.mint;

    const candidatePhase = addPhase('candidate', 'Resolve candidate row', 5);
    const candRes = await runPhase(phases, emit, candidatePhase, async () => {
      if (candidateId && mint) return { ok: true, detail: `existing candidate ${candidateId.slice(0, 8)}` };
      if (candidateId && !mint) {
        const { data: row, error } = await supabase
          .from('autopsy_candidates')
          .select('token_mint')
          .eq('id', candidateId)
          .maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!row?.token_mint) return { ok: false, error: 'candidate has no token_mint' };
        mint = row.token_mint;
        return { ok: true, detail: `loaded mint ${mint.slice(0, 6)}…` };
      }
      if (!args.upsert) return { ok: false, error: 'candidateId or upsert required' };
      const spec = args.upsert;
      mint = spec.token_mint;
      const { data: cand, error } = await supabase
        .from('autopsy_candidates')
        .upsert(
          {
            token_mint: spec.token_mint,
            ticker: spec.ticker ?? null,
            token_name: spec.token_name ?? null,
            tier: spec.tier ?? 'B',
            source_feed: spec.source_feed,
            candidate_score: spec.candidate_score ?? 100,
            death_confidence: spec.death_confidence ?? null,
            ath_mcap_usd: spec.ath_mcap_usd ?? null,
            current_mcap_usd: spec.current_mcap_usd ?? null,
            liquidity_usd: spec.liquidity_usd ?? null,
            age_hours: spec.age_hours ?? null,
            creator_wallet: spec.creator_wallet ?? null,
            funneled_at: new Date().toISOString(),
            status: 'pending',
          },
          { onConflict: 'token_mint' },
        )
        .select('id, token_mint')
        .single();
      if (error || !cand) return { ok: false, error: error?.message ?? 'candidate upsert failed' };
      candidateId = cand.id;
      mint = cand.token_mint;
      return { ok: true, detail: `created/upserted ${candidateId.slice(0, 8)}` };
    }, signal);
    if (!candRes.ok) throw new Error('Could not establish candidate row');
    if (candidateId) args.onCandidateResolved?.(candidateId);
    if (signal?.aborted) return cancelled();

    // 2. Hydrate mesh — retried because partial mesh poisons the autopsy.
    toast({ title: 'Hydrating mesh…', description: 'Identity → creator → mesh → socials → holders.' });
    let hydrate: any = null;
    const hydratePhase = addPhase('mesh-hydrate', 'Hydrate token mesh', maxAttempts);
    const hydrateRes = await runPhase(phases, emit, hydratePhase, async () => {
      // Cache-first: surface='autopsy_pipeline' triggers a 30-day TTL inside
      // token-mesh-hydrate. Dead tokens don't change — KYC/creator/identity/ATH
      // are immutable, so we reuse anything <30d old.
      const { data, error } = await supabase.functions.invoke('token-mesh-hydrate', {
        body: { mint, candidate_id: candidateId, surface: 'autopsy_pipeline' },
      });
      if (error) return { ok: false, error: error.message };
      hydrate = data;
      const steps = (data?.steps ?? []) as Array<{ step: string; ok: boolean; detail?: string; reason?: string; source?: string }>;
      const ident = data?.identity ?? {};
      // Require identity OR creator OR socials present before considering hydrate "ok"
      const completeness = [ident.twitterUrl, ident.telegramUrl, ident.websiteUrl].filter(Boolean).length;
      const dataPresent = !!data?.creatorWallet || completeness >= 1 || !!ident.ticker;
      if (!dataPresent) {
        return { ok: false, error: 'no creator + no socials + no ticker — providers empty', subSteps: steps };
      }
      return {
        ok: true,
        detail: `${ident.ticker ? '$' + ident.ticker : '?'} · creator=${data?.creatorWallet ? 'yes' : 'no'} · socials=${completeness}/3`,
        subSteps: steps,
      };
    }, signal);
    if (signal?.aborted) return cancelled();
    if (!hydrateRes.ok) {
      return {
        ok: false,
        candidateId,
        error: 'mesh hydration failed after all retries — refusing to autopsy without data',
        phases,
      };
    }

    const ident = hydrate?.identity ?? {};

    // 3. On-chain timeline — retried.
    const txPhase = addPhase('tx-timeline', 'On-chain transaction timeline', maxAttempts);
    const txRes = await runPhase(phases, emit, txPhase, async () => {
      // Cache-first: tx-timeline self-skips when autopsy_tx_evidence <6h exists.
      // On-chain history for a dead token is immutable, so reuse is safe.
      const { error } = await supabase.functions.invoke('autopsy-tx-timeline', {
        body: { candidate_id: candidateId },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, detail: 'forensics captured' };
    }, signal);
    if (signal?.aborted) return cancelled();
    if (!txRes.ok) {
      return {
        ok: false,
        candidateId,
        identity: ident,
        error: 'on-chain timeline failed after all retries',
        phases,
      };
    }

    // 4. Telegram deep pull (only when a TG URL exists).
    if (ident.telegramUrl) {
      const tgPhase = addPhase('tg-deep-pull', 'Telegram deep-pull', maxAttempts);
      await runPhase(phases, emit, tgPhase, async () => {
        const { error } = await supabase.functions.invoke('autopsy-tg-deep-pull', { body: { candidate_id: candidateId } });
        if (error) return { ok: false, error: error.message };
        return { ok: true, detail: 'telegram scraped' };
      }, signal);
      if (signal?.aborted) return cancelled();
      // Non-fatal: continue even if TG pull ultimately fails.
    } else {
      const skipped = addPhase('tg-deep-pull', 'Telegram deep-pull', 1);
      skipped.status = 'skipped';
      skipped.detail = 'no telegram URL discovered';
      skipped.endedAt = Date.now();
      emit([...phases]);
    }

    // 5. Community sweep — retried.
    const csPhase = addPhase('community-sweep', 'X community sweep (vulture + dissent)', maxAttempts);
    const csRes = await runPhase(phases, emit, csPhase, async () => {
      // Cache-first: community-sweep self-skips when both lenses were swept <30min ago.
      const { error } = await supabase.functions.invoke('autopsy-community-sweep', {
        body: { candidate_id: candidateId, token_mint: mint, lenses: ['vulture', 'dissent'] },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, detail: 'x-community swept' };
    }, signal);
    if (signal?.aborted) return cancelled();
    if (!csRes.ok) {
      return {
        ok: false,
        candidateId,
        identity: ident,
        error: 'community sweep failed after all retries — refusing to send to AI writer',
        phases,
      };
    }

    // 6. Writer (AI) — only runs after every data phase succeeded.
    toast({ title: 'Writing report…' });
    const writerPhase = addPhase('writer', 'AI writer (report draft)', maxAttempts);
    const writerRes = await runPhase(phases, emit, writerPhase, async () => {
      // The writer is heavyweight (image gen + AI + several DB writes). The
      // browser → edge invocation can silently stall mid-flight (idle TCP
      // disconnect, CDN hiccup) — the promise never resolves and the dialog
      // hangs forever even though the function finished and wrote the report.
      // Defence: race the invoke() against (a) a 180s hard watchdog and (b) a
      // DB poll that watches for the autopsy_reports row to appear. Whichever
      // wins first wins the phase.
      const PHASE_BUDGET_MS = 180_000;
      const POLL_INTERVAL_MS = 3000;
      type Outcome = { ok: true; detail: string } | { ok: false; error: string };

      const invokePromise: Promise<Outcome> = supabase.functions
        .invoke('autopsy-writer', { body: { candidate_id: candidateId } })
        .then(({ error }) => error
          ? { ok: false as const, error: error.message }
          : { ok: true as const, detail: 'autopsy drafted (writer returned)' });

      const pollPromise: Promise<Outcome> = new Promise((resolve) => {
        const start = Date.now();
        const timer = setInterval(async () => {
          if (signal?.aborted) { clearInterval(timer); resolve({ ok: false, error: 'Cancelled by user' }); return; }
          try {
            const { data } = await supabase
              .from('autopsy_reports')
              .select('id, slug, version, created_at')
              .eq('candidate_id', candidateId!)
              .eq('is_current', true)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data?.id) {
              clearInterval(timer);
              resolve({ ok: true, detail: `autopsy drafted · v${data.version} (detected via DB poll)` });
            } else if (Date.now() - start > PHASE_BUDGET_MS) {
              clearInterval(timer);
              resolve({ ok: false, error: `writer watchdog timed out after ${PHASE_BUDGET_MS / 1000}s with no autopsy_reports row` });
            }
          } catch {/* keep polling */}
        }, POLL_INTERVAL_MS);
      });

      return await Promise.race([invokePromise, pollPromise]);
    }, signal);
    if (signal?.aborted) return cancelled();
    if (!writerRes.ok) {
      return {
        ok: false,
        candidateId,
        identity: ident,
        error: 'AI writer failed after all retries',
        phases,
      };
    }

    toast({
      title: '✓ Autopsy drafted',
      description: `${ident.ticker ? '$' + ident.ticker + ' · ' : ''}${(mint ?? '').slice(0, 6)}…${(mint ?? '').slice(-4)}`,
    });
    return { ok: true, candidateId, identity: ident, phases };
  } catch (e: any) {
    if (isAbort(e)) {
      return { ok: false, error: 'Cancelled by user', phases };
    }
    args.toast({
      title: 'Pipeline failed',
      description: e?.message ?? String(e),
      variant: 'destructive',
    });
    return { ok: false, error: e?.message ?? String(e), phases };
  }
}