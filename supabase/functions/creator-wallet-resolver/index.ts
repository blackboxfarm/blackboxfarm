// creator-wallet-resolver
// Backfill driver that fills missing `creator_wallet` for every token in
// master_token_directory by calling the canonical resolveTokenCreator()
// chain (Pump.fun → Helius DAS → Helius RPC). Writes the resolved wallet
// back to the underlying base table (pumpfun_watchlist for pump mints,
// otherwise scraped_tokens) so the matview reflects it on next refresh.
//
// Newest-first. Auto-skips when nothing left to resolve.

import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { resolveTokenCreator } from '../_shared/creator-resolver.ts';
import { assertUpsert, assertUpdate } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_DEFAULT = 50;

Deno.serve(withRunLog('creator-wallet-resolver', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const batchSize: number = Math.min(Math.max(body.batchSize ?? BATCH_DEFAULT, 1), 200);
  const singleTargetMint: string | null = typeof body.tokenMint === 'string' && body.tokenMint.length > 30
    ? body.tokenMint.trim()
    : null;

  // Single-target mode: admin button click for one specific mint. Bypass the
  // newest-first backfill queue and just run the canonical chain for this mint.
  let targets: Array<{ token_mint: string; created_at?: string }> | null = null;
  let tErr: any = null;
  if (singleTargetMint) {
    targets = [{ token_mint: singleTargetMint }];
  } else {
    // Pull newest tokens missing creator_wallet from the matview.
    const res = await supabase
      .from('master_token_directory')
      .select('token_mint, created_at')
      .is('creator_wallet', null)
      .order('created_at', { ascending: false })
      .limit(batchSize);
    targets = res.data as any;
    tErr = res.error;
  }

  if (tErr) {
    return new Response(JSON.stringify({ error: tErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!targets || targets.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, attempted: 0, resolved: 0, message: 'No tokens missing creator_wallet — backfill complete.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const errors: string[] = [];
  const results: any[] = [];
  let resolved = 0;

  for (const t of targets) {
    const mint = t.token_mint as string;
    try {
      const res = await resolveTokenCreator(mint, supabase, errors);
      if (!res.creatorWallet) {
        results.push({ mint, ok: false, source: 'none' });
        continue;
      }

      // Write back to the right base table so the matview picks it up.
      const isPump = mint.endsWith('pump');
      if (isPump) {
        // pumpfun_watchlist may already have the row — update if creator_wallet null.
        const { data: pwExists } = await supabase
          .from('pumpfun_watchlist')
          .select('token_mint, creator_wallet')
          .eq('token_mint', mint)
          .maybeSingle();
        if (pwExists) {
          if (!pwExists.creator_wallet) {
            await assertUpdate(
              supabase
                .from('pumpfun_watchlist')
                .update({ creator_wallet: res.creatorWallet })
                .eq('token_mint', mint)
                .is('creator_wallet', null),
              'pumpfun_watchlist',
            );
          }
        } else {
          // Fall through to scraped_tokens upsert below.
          await assertUpsert(
            supabase
              .from('scraped_tokens')
              .upsert({ token_mint: mint, creator_wallet: res.creatorWallet }, { onConflict: 'token_mint' }),
            'scraped_tokens',
          );
        }
      } else {
        await assertUpsert(
          supabase
            .from('scraped_tokens')
            .upsert({ token_mint: mint, creator_wallet: res.creatorWallet }, { onConflict: 'token_mint' }),
          'scraped_tokens',
        );
      }

      // Make sure the dev profile shell exists so the KYC backfill can pick it up.
      await assertUpsert(
        supabase
          .from('developer_profiles')
          .upsert({ master_wallet_address: res.creatorWallet, source: 'creator-wallet-resolver' },
                  { onConflict: 'master_wallet_address', ignoreDuplicates: true }),
        'developer_profiles',
      );

      // Inline mesh-funnel hook: kick off KYC trace immediately for newly
      // discovered dev wallets so they don't have to wait for the 5-min
      // bulk runner cron. Skipped in singleTarget mode — the admin UI fires
      // mesh-kyc-deep-search itself as a second explicit step so it can
      // surface a separate toast.
      if (!singleTargetMint) {
        supabase.functions.invoke('mesh-kyc-deep-search', {
          body: { walletAddress: res.creatorWallet, maxDepth: 6, discoverBundle: false },
        }).catch(() => { /* swallow — bulk runner will retry */ });
      }

      resolved++;
      results.push({ mint, ok: true, creator: res.creatorWallet, source: res.source });
    } catch (e) {
      results.push({ mint, ok: false, error: (e as Error).message });
    }
    await new Promise(r => setTimeout(r, 250));
  }

  return new Response(
    JSON.stringify({
      ok: true,
      attempted: targets.length,
      resolved,
      results: results.slice(0, 20),
      apiErrors: errors.slice(0, 10),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}));