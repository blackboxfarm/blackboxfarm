import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusApiKey, getHeliusRpcUrl } from '../_shared/helius-client.ts';
enableHeliusTracking('token-creator-linker');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Resolve creator wallet for a pump.fun token via the pump.fun API.
 * Returns the creator pubkey or null.
 */
async function resolvePumpFunCreator(tokenMint: string): Promise<string | null> {
  try {
    const res = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`);
    if (!res.ok) {
      console.log(`[CreatorLinker] pump.fun API returned ${res.status} for ${tokenMint}`);
      return null;
    }
    const data = await res.json();
    const creator = data?.creator;
    if (creator && typeof creator === 'string' && creator.length >= 32) {
      console.log(`[CreatorLinker] pump.fun API resolved creator: ${creator}`);
      return creator;
    }
    return null;
  } catch (e) {
    console.log(`[CreatorLinker] pump.fun API error:`, e);
    return null;
  }
}

/**
 * Resolve creator wallet via Helius on-chain lookup.
 * Gets the OLDEST transaction for the token mint (creation tx) and extracts the fee payer.
 */
async function resolveOnChainCreator(tokenMint: string, heliusKey: string): Promise<string | null> {
  const heliusUrl = getHeliusRpcUrl(heliusKey);

  // Step 1: Paginate to get the OLDEST signature (creation transaction)
  // getSignaturesForAddress returns newest-first, so we paginate until we reach the end
  let oldestSignature: string | null = null;
  let lastSignature: string | undefined = undefined;

  for (let page = 0; page < 20; page++) {
    const params: any[] = [tokenMint, { limit: 1000 }];
    if (lastSignature) {
      params[1].before = lastSignature;
    }

    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'creator-scan',
        method: 'getSignaturesForAddress',
        params,
      }),
    });

    const data = await response.json();
    const sigs = data.result;

    if (!sigs || sigs.length === 0) break;

    // The last element in the last page is the oldest transaction
    oldestSignature = sigs[sigs.length - 1].signature;
    lastSignature = oldestSignature;

    // If we got fewer than 1000, this is the last page
    if (sigs.length < 1000) break;
  }

  if (!oldestSignature) {
    console.log(`[CreatorLinker] No transactions found for ${tokenMint}`);
    return null;
  }

  console.log(`[CreatorLinker] Oldest signature for ${tokenMint}: ${oldestSignature}`);

  // Step 2: Get transaction details — first account key is the fee payer (creator)
  const txResponse = await fetch(heliusUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'tx-details',
      method: 'getTransaction',
      params: [oldestSignature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
    }),
  });

  const txData = await txResponse.json();
  const creatorWallet = txData.result?.transaction?.message?.accountKeys?.[0]?.pubkey;

  if (!creatorWallet) {
    console.log(`[CreatorLinker] Could not extract creator from tx ${oldestSignature}`);
    return null;
  }

  return creatorWallet;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const heliusKey = getHeliusApiKey();
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { tokenMints } = await req.json();

    if (!tokenMints || !Array.isArray(tokenMints)) {
      throw new Error('tokenMints array required');
    }

    console.log(`[CreatorLinker] Processing ${tokenMints.length} tokens`);

    const results = {
      linked: 0,
      created: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const tokenMint of tokenMints) {
      try {
        // PRIMARY: For pump.fun tokens, use pump.fun API (authoritative creator source)
        let creatorWallet: string | null = null;

        if (tokenMint.toLowerCase().endsWith('pump')) {
          creatorWallet = await resolvePumpFunCreator(tokenMint);
        }

        // FALLBACK: On-chain lookup via Helius (oldest transaction = creation tx)
        if (!creatorWallet) {
          creatorWallet = await resolveOnChainCreator(tokenMint, heliusKey);
        }

        if (!creatorWallet) {
          console.log(`[CreatorLinker] Could not resolve creator for ${tokenMint}`);
          results.failed++;
          continue;
        }

        console.log(`[CreatorLinker] Found creator ${creatorWallet} for ${tokenMint}`);

        // Check if developer profile exists
        let { data: profile } = await supabase
          .from('developer_profiles')
          .select('id')
          .eq('master_wallet_address', creatorWallet)
          .single();

        let developerId = profile?.id;

        // Create profile if doesn't exist
        if (!profile) {
          const { data: newProfile, error: profileError } = await supabase
            .from('developer_profiles')
            .insert({
              master_wallet_address: creatorWallet,
              display_name: `Dev ${creatorWallet.slice(0, 8)}`,
              reputation_score: 50,
              trust_level: 'neutral',
            })
            .select('id')
            .single();

          if (profileError) {
            console.error(`[CreatorLinker] Error creating profile:`, profileError);
            results.failed++;
            continue;
          }

          developerId = newProfile.id;
          results.created++;

          // Add wallet to developer_wallets
          await supabase.from('developer_wallets').insert({
            developer_id: developerId,
            wallet_address: creatorWallet,
            wallet_type: 'master',
            depth_level: 0,
          });
        }

        // Update token_lifecycle with creator info
        await supabase
          .from('token_lifecycle')
          .update({
            creator_wallet: creatorWallet,
            developer_id: developerId,
          })
          .eq('token_mint', tokenMint);

        // Add/update developer_tokens
        const { data: existingToken } = await supabase
          .from('developer_tokens')
          .select('id')
          .eq('token_mint', tokenMint)
          .single();

        if (!existingToken) {
          await supabase.from('developer_tokens').insert({
            developer_id: developerId,
            token_mint: tokenMint,
            creator_wallet: creatorWallet,
            launch_date: new Date().toISOString(),
            is_active: true,
          });
        } else {
          // Fix existing records that have the WRONG creator
          await supabase
            .from('developer_tokens')
            .update({ creator_wallet: creatorWallet, developer_id: developerId })
            .eq('token_mint', tokenMint);
        }

        results.linked++;
      } catch (error) {
        console.error(`[CreatorLinker] Error processing ${tokenMint}:`, error);
        results.failed++;
        results.errors.push(`${tokenMint}: ${error.message}`);
      }
    }

    // Trigger integrity recalculation for affected developers
    console.log(`[CreatorLinker] Triggering integrity score updates`);
    supabase.functions
      .invoke('calculate-developer-integrity', {
        body: { recalculateAll: true },
      })
      .catch((err) => console.error('[CreatorLinker] Integrity calc error:', err));

    return new Response(
      JSON.stringify({
        success: true,
        results,
        message: `Linked ${results.linked} tokens, created ${results.created} new profiles`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('[CreatorLinker] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
