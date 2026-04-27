// One-shot backfill: walk every telegram_insider_token_lifecycle row,
// extract whatever signals are already known (creator_wallet, kyc_root,
// + matching token_social_links for the X handle), and run them through
// fuseCreator(). After this finishes every historical token is attached
// to a Creator Profile.
//
// Safe to re-run — fuseCreator is idempotent.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fuseCreator } from '../_shared/creator-fusion.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 1000, 5000);
    const offset = Number(body.offset) || 0;

    // Pull lifecycle rows that have at least a creator_wallet.
    const { data: rows, error } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('token_mint, token_symbol, creator_wallet, genealogy_kyc_root, genealogy_chain, first_called_at')
      .not('creator_wallet', 'is', null)
      .order('first_called_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const tokenMints = (rows || []).map((r: any) => r.token_mint);

    // Bulk-fetch social links so we can attach X / TG / website signals.
    const socialMap = new Map<string, any>();
    if (tokenMints.length > 0) {
      const { data: socials } = await supabase
        .from('token_social_links')
        .select('token_mint, twitter, telegram, website, discord')
        .in('token_mint', tokenMints);
      for (const s of (socials || []) as any[]) {
        socialMap.set(s.token_mint, s);
      }
    }

    let processed = 0;
    let created = 0;
    let merged = 0;
    const errors: Array<{ mint: string; error: string }> = [];

    for (const row of (rows || []) as any[]) {
      try {
        const social = socialMap.get(row.token_mint) || {};
        const sisterWallets = ((row.genealogy_chain || []) as any[])
          .filter((h) => h?.wallet && h.wallet !== row.creator_wallet)
          .map((h) => h.wallet);

        const result = await fuseCreator(
          {
            devWallet: row.creator_wallet,
            kycRoot: row.genealogy_kyc_root,
            sisterWallets,
            xHandle: social.twitter || null,
            telegramHandle: social.telegram || null,
            discordHandle: social.discord || null,
            websiteDomain: social.website || null,
            source: 'creator-profile-backfill',
          },
          supabase,
        );
        processed++;
        if (result.isNew) created++;
        if (result.mergedAbsorbedIds.length > 0) merged += result.mergedAbsorbedIds.length;
      } catch (e) {
        errors.push({ mint: row.token_mint, error: (e as Error).message });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        created,
        merged,
        errorCount: errors.length,
        errors: errors.slice(0, 20),
        nextOffset: offset + (rows?.length || 0),
        done: (rows?.length || 0) < limit,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[creator-profile-backfill] Fatal:', e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
