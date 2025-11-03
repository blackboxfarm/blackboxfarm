import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[TokenCollector] 🚀 Using Dexscreener Official API');
    console.log('[TokenCollector] 📊 Strategy: Collect latest token profiles');

    const allTokens: Array<{
      address: string;
      rank: number;
      pageUrl: string;
      chainId: string;
    }> = [];
    
    const capturedAt = new Date().toISOString();

    // Fetch latest token profiles from Dexscreener API
    console.log('[TokenCollector] 📡 Fetching latest token profiles from API');
    
    const apiResponse = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
    
    if (!apiResponse.ok) {
      console.error(`[TokenCollector] ❌ API request failed: ${apiResponse.status}`);
      throw new Error(`Dexscreener API returned ${apiResponse.status}`);
    }

    const profiles = await apiResponse.json();
    console.log(`[TokenCollector] ✅ Received ${profiles.length} token profiles`);

    // Filter for Solana tokens and create our token list
    let rank = 1;
    for (const profile of profiles) {
      if (profile.chainId === 'solana' && profile.tokenAddress) {
        allTokens.push({
          address: profile.tokenAddress,
          rank: rank++,
          pageUrl: profile.url || `https://dexscreener.com/solana/${profile.tokenAddress}`,
          chainId: 'solana'
        });
      }
    }

    console.log(`[TokenCollector] 🎯 Found ${allTokens.length} Solana tokens from profiles`);

    // Get existing tokens from database
    const { data: existingTokens } = await supabase
      .from('token_lifecycle')
      .select('token_address');

    const existingSet = new Set(
      (existingTokens || []).map((t: any) => t.token_address)
    );

    const newTokens = allTokens.filter(t => !existingSet.has(t.address));
    console.log(`[TokenCollector] 🆕 Found ${newTokens.length} NEW tokens (not in database)`);
    console.log(`[TokenCollector] 📦 Already tracking ${existingSet.size} tokens`);

    // Insert snapshot of all token rankings
    const rankingSnapshot = allTokens.map(token => ({
      token_address: token.address,
      rank: token.rank,
      captured_at: capturedAt,
      page_url: token.pageUrl
    }));

    if (rankingSnapshot.length > 0) {
      const { error: snapshotError } = await supabase
        .from('token_rankings')
        .insert(rankingSnapshot);

      if (snapshotError) {
        console.error('[TokenCollector] ❌ Failed to insert ranking snapshot:', snapshotError);
      } else {
        console.log(`[TokenCollector] ✅ Inserted ${rankingSnapshot.length} ranking records`);
      }
    }

    // Insert new tokens into token_lifecycle
    if (newTokens.length > 0) {
      const tokenInserts = newTokens.map(token => ({
        token_address: token.address,
        first_seen_at: capturedAt,
        last_seen_at: capturedAt,
        current_rank: token.rank,
        best_rank: token.rank,
        times_seen: 1,
        page_url: token.pageUrl
      }));

      const { error: insertError } = await supabase
        .from('token_lifecycle')
        .insert(tokenInserts);

      if (insertError) {
        console.error('[TokenCollector] ❌ Failed to insert new tokens:', insertError);
      } else {
        console.log(`[TokenCollector] ✅ Added ${newTokens.length} new tokens to permanent collection`);
      }
    }

    // Update existing tokens
    const tokensToUpdate = allTokens.filter(t => existingSet.has(t.address));
    
    if (tokensToUpdate.length > 0) {
      let updateCount = 0;
      for (const token of tokensToUpdate) {
        const { error: updateError } = await supabase
          .from('token_lifecycle')
          .update({
            last_seen_at: capturedAt,
            current_rank: token.rank,
            times_seen: supabase.rpc('increment', { x: 1 }),
            best_rank: supabase.rpc('least', { a: 'best_rank', b: token.rank })
          })
          .eq('token_address', token.address);

        if (!updateError) {
          updateCount++;
        }
      }
      console.log(`[TokenCollector] 🔄 Updated ${updateCount} existing token records`);
      console.log(`[TokenCollector] 🔄 ${tokensToUpdate.length} existing tokens refreshed`);
    }

    // Trigger token-creator-linker for new tokens
    if (newTokens.length > 0) {
      console.log('[TokenCollector] 🔗 Triggering token-creator-linker for new tokens...');
      try {
        const { error: funcError } = await supabase.functions.invoke('token-creator-linker', {
          body: { 
            tokens: newTokens.map(t => t.address),
            source: 'dexscreener-collector'
          }
        });
        
        if (funcError) {
          console.error('[TokenCollector] ⚠️ token-creator-linker error:', funcError);
        } else {
          console.log('[TokenCollector] ✅ token-creator-linker triggered successfully');
        }
      } catch (err) {
        console.error('[TokenCollector] ⚠️ Failed to trigger token-creator-linker:', err);
      }
    }

    // Get total tokens in database
    const { count: totalCount } = await supabase
      .from('token_lifecycle')
      .select('*', { count: 'exact', head: true });

    console.log(`[TokenCollector] 📊 Database now contains ${totalCount} total tokens`);
    console.log(`[TokenCollector] 🆕 ${newTokens.length} new tokens added this run`);
    console.log('[TokenCollector] 🎉 COMPLETE!');

    return new Response(
      JSON.stringify({
        success: true,
        tokensScraped: allTokens.length,
        newTokens: newTokens.length,
        updatedTokens: tokensToUpdate.length,
        totalInDatabase: totalCount,
        timestamp: capturedAt
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[TokenCollector] ❌ Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
