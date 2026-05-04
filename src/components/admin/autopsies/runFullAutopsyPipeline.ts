import { supabase } from '@/integrations/supabase/client';
import type { PipelinePhase, PhaseStatus } from './PipelineProgressDialog';

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
  /** Override default per-phase max attempts (default 10). */
  maxAttempts?: number;
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

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
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
): Promise<{ ok: boolean; data?: T }> {
  phase.startedAt = Date.now();
  for (let attempt = 1; attempt <= phase.maxAttempts; attempt++) {
    phase.attempt = attempt;
    phase.status = attempt === 1 ? 'running' : 'retrying';
    phase.error = undefined;
    emit([...phases]);
    try {
      const r = await runner();
      if (r.ok) {
        phase.status = 'success';
        phase.detail = r.detail;
        phase.subSteps = r.subSteps;
        phase.endedAt = Date.now();
        emit([...phases]);
        return { ok: true, data: r.data };
      }
      phase.error = r.error ?? 'phase reported not-ok';
      phase.subSteps = r.subSteps ?? phase.subSteps;
    } catch (e: any) {
      phase.error = e?.message ?? String(e);
    }
    emit([...phases]);
    if (attempt < phase.maxAttempts) {
      await sleep(Math.min(RETRY_BASE_DELAY_MS * attempt, 10_000));
    }
  }
  phase.status = 'failed';
  phase.endedAt = Date.now();
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
  const { toast, onProgress, maxAttempts = DEFAULT_MAX_ATTEMPTS } = args;
  const phases: PipelinePhase[] = [];
  const emit = (p: PipelinePhase[]) => { onProgress?.(p); };
  const addPhase = (key: string, label: string, max = maxAttempts): PipelinePhase => {
    const p: PipelinePhase = { key, label, status: 'pending', attempt: 0, maxAttempts: max };
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
    });
    if (!candRes.ok) throw new Error('Could not establish candidate row');

    // 2. Hydrate mesh — retried because partial mesh poisons the autopsy.
    toast({ title: 'Hydrating mesh…', description: 'Identity → creator → mesh → socials → holders.' });
    let hydrate: any = null;
    const hydratePhase = addPhase('mesh-hydrate', 'Hydrate token mesh', maxAttempts);
    const hydrateRes = await runPhase(phases, emit, hydratePhase, async () => {
      const { data, error } = await supabase.functions.invoke('token-mesh-hydrate', {
        body: { mint, candidate_id: candidateId, surface: 'autopsy_pipeline', force: true },
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
    });
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
      const { error } = await supabase.functions.invoke('autopsy-tx-timeline', {
        body: { candidate_id: candidateId, force: true },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, detail: 'forensics captured' };
    });
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
      });
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
      const { error } = await supabase.functions.invoke('autopsy-community-sweep', {
        body: { candidate_id: candidateId, token_mint: mint, force: true, lenses: ['vulture', 'dissent'] },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, detail: 'x-community swept' };
    });
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
      const { error } = await supabase.functions.invoke('autopsy-writer', { body: { candidate_id: candidateId } });
      if (error) return { ok: false, error: error.message };
      return { ok: true, detail: 'autopsy drafted' };
    });
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
    args.toast({
      title: 'Pipeline failed',
      description: e?.message ?? String(e),
      variant: 'destructive',
    });
    return { ok: false, error: e?.message ?? String(e), phases };
  }
}