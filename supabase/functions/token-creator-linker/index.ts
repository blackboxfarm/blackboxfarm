import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('token-creator-linker');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const heliusKey = Deno.env.get('HELIUS_API_KEY');
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
      errors: [] as string[]
    };

    for (const tokenMint of tokenMints) {
      try {
        // Get token creation transaction from Helius
        const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
        const response = await fetch(heliusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'creator-scan',
            method: 'getSignaturesForAddress',
            params: [
              tokenMint,
              { limit: 1 } // Get first (creation) transaction
            ]
          })
        });

        const data = await response.json();
        
        if (!data.result || data.result.length === 0) {
          console.log(`[CreatorLinker] No transactions found for ${tokenMint}`);
          results.failed++;
          continue;
        }

        const signature = data.result[0].signature;

        // Get transaction details
        const txResponse = await fetch(heliusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'tx-details',
            method: 'getTransaction',
            params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
          })
        });

        const txData = await txResponse.json();
        const creatorWallet = txData.result?.transaction?.message?.accountKeys?.[0]?.pubkey;

        if (!creatorWallet) {
          console.log(`[CreatorLinker] Could not extract creator for ${tokenMint}`);
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
              trust_level: 'neutral'
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
          await supabase
            .from('developer_wallets')
            .insert({
              developer_id: developerId,
              wallet_address: creatorWallet,
              wallet_type: 'master',
              depth_level: 0
            });
        }

        // Update token_lifecycle with creator info
        await supabase
          .from('token_lifecycle')
          .update({
            creator_wallet: creatorWallet,
            developer_id: developerId
          })
          .eq('token_mint', tokenMint);

        // Add/update developer_tokens
        const { data: existingToken } = await supabase
          .from('developer_tokens')
          .select('id')
          .eq('token_mint', tokenMint)
          .single();

        if (!existingToken) {
          await supabase
            .from('developer_tokens')
            .insert({
              developer_id: developerId,
              token_mint: tokenMint,
              creator_wallet: creatorWallet,
              launch_date: new Date().toISOString(),
              is_active: true
            });
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
    supabase.functions.invoke('calculate-developer-integrity', {
      body: { recalculateAll: true }
    }).catch(err => console.error('[CreatorLinker] Integrity calc error:', err));

    return new Response(
      JSON.stringify({
        success: true,
        results,
        message: `Linked ${results.linked} tokens, created ${results.created} new profiles`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[CreatorLinker] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
