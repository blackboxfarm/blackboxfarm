import { supabase } from '@/integrations/supabase/client';

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
};

export type RunPipelineResult = {
  ok: boolean;
  candidateId?: string;
  identity?: any;
  error?: string;
};

/**
 * Runs the full autopsy forensic pipeline in one shot:
 *   token-mesh-hydrate → autopsy-tx-timeline → (autopsy-tg-deep-pull) →
 *   autopsy-community-sweep → autopsy-writer
 *
 * Mirrors the manual "Add & Draft" flow from AutopsyQueueBody.handleManualAdd
 * so Live Death Watch / Cool Deaths Backlog / Lambs all behave identically.
 */
export async function runFullAutopsyPipeline(args: RunPipelineArgs): Promise<RunPipelineResult> {
  const { toast } = args;
  try {
    // 1. Resolve / create candidate row.
    let candidateId = args.candidateId;
    let mint = args.mint;

    if (!candidateId) {
      if (!args.upsert) throw new Error('candidateId or upsert required');
      const spec = args.upsert;
      mint = spec.token_mint;
      const { data: cand, error: upErr } = await supabase
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
      if (upErr || !cand) throw new Error(upErr?.message ?? 'candidate upsert failed');
      candidateId = cand.id;
      mint = cand.token_mint;
    } else if (!mint) {
      const { data: row } = await supabase
        .from('autopsy_candidates')
        .select('token_mint')
        .eq('id', candidateId)
        .maybeSingle();
      mint = row?.token_mint;
      if (!mint) throw new Error('candidate has no token_mint');
    }

    // 2. Hydrate mesh.
    toast({ title: 'Hydrating mesh…', description: 'Identity → creator → mesh → socials → holders.' });
    const { data: hydrate, error: hErr } = await supabase.functions.invoke('token-mesh-hydrate', {
      body: { mint, candidate_id: candidateId, surface: 'autopsy_pipeline', force: true },
    });
    if (hErr) throw hErr;

    const steps: Array<{ step: string; ok: boolean; source?: string; detail?: string; reason?: string }> =
      hydrate?.steps ?? [];
    for (const s of steps) {
      const icon = s.ok ? '✓' : '⚠';
      toast({
        title: `${icon} ${s.step}${s.source ? ` (${s.source})` : ''}`,
        description: s.ok ? (s.detail ?? 'ok') : (s.reason ?? 'no detail'),
        variant: s.ok ? 'default' : 'destructive',
      });
    }

    // 3. Refusal guard — don't autopsy a vacuum.
    const ident = hydrate?.identity ?? {};
    const completeness = [ident.twitterUrl, ident.telegramUrl, ident.websiteUrl].filter(Boolean).length;
    if (!hydrate?.creatorWallet && completeness < 1 && !ident.ticker) {
      toast({
        title: 'Refusing to autopsy empty object',
        description: 'No creator + no socials + no ticker. Re-hydrate later when providers respond.',
        variant: 'destructive',
      });
      return { ok: false, candidateId, identity: ident, error: 'empty object' };
    }

    // 4. On-chain timeline.
    toast({ title: 'Forensics: on-chain timeline…' });
    const fx = await supabase.functions.invoke('autopsy-tx-timeline', {
      body: { candidate_id: candidateId, force: true },
    });
    toast({
      title: fx.error ? '⚠ tx-timeline' : '✓ tx-timeline',
      description: fx.error?.message ?? 'forensics captured',
      variant: fx.error ? 'destructive' : 'default',
    });

    // 5. Telegram deep pull (only when a TG URL exists).
    if (ident.telegramUrl) {
      const tg = await supabase.functions.invoke('autopsy-tg-deep-pull', { body: { candidate_id: candidateId } });
      toast({
        title: tg.error ? '⚠ tg deep pull' : '✓ tg deep pull',
        description: tg.error?.message ?? 'telegram scraped',
        variant: tg.error ? 'destructive' : 'default',
      });
    }

    // 6. Community sweep (vulture + dissent lenses).
    const cs = await supabase.functions.invoke('autopsy-community-sweep', {
      body: { candidate_id: candidateId, token_mint: mint, force: true, lenses: ['vulture', 'dissent'] },
    });
    toast({
      title: cs.error ? '⚠ community sweep' : '✓ community sweep',
      description: cs.error?.message ?? 'x-community swept',
      variant: cs.error ? 'destructive' : 'default',
    });

    // 7. Writer.
    toast({ title: 'Writing report…' });
    const { error: wErr } = await supabase.functions.invoke('autopsy-writer', {
      body: { candidate_id: candidateId },
    });
    if (wErr) throw wErr;

    toast({
      title: '✓ Autopsy drafted',
      description: `${ident.ticker ? '$' + ident.ticker + ' · ' : ''}${(mint ?? '').slice(0, 6)}…${(mint ?? '').slice(-4)}`,
    });
    return { ok: true, candidateId, identity: ident };
  } catch (e: any) {
    args.toast({
      title: 'Pipeline failed',
      description: e?.message ?? String(e),
      variant: 'destructive',
    });
    return { ok: false, error: e?.message ?? String(e) };
  }
}