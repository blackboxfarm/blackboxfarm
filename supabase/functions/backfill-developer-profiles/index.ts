import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getHeliusApiKey, getHeliusRestUrl } from '../_shared/helius-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BackfillRequest {
  source?: 'flipit' | 'fantasy' | 'all';
  limit?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const heliusApiKey = getHeliusApiKey();
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { source = 'all', limit = 100 } = await req.json() as BackfillRequest;
    
    console.log(`Starting backfill for source: ${source}, limit: ${limit}`);
    
    const results = {
      flipit: { processed: 0, created: 0, updated: 0, errors: [] as string[] },
      fantasy: { processed: 0, created: 0, updated: 0, errors: [] as string[] },
    };
    
    // Helper to fetch token creator from Helius
    async function getTokenCreator(tokenMint: string): Promise<string | null> {
      if (!heliusApiKey) {
        console.log('No Helius API key, skipping creator lookup');
        return null;
      }
      
      try {
        const response = await fetch(
          getHeliusRestUrl('/v0/token-metadata'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mintAccounts: [tokenMint] }),
          }
        );
        
        if (!response.ok) {
          console.error(`Helius API error: ${response.status}`);
          return null;
        }
        
        const data = await response.json();
        if (data && data[0]) {
          // Try to get update authority as creator
          return data[0].onChainMetadata?.metadata?.updateAuthority || 
                 data[0].legacyMetadata?.updateAuthority ||
                 null;
        }
        return null;
      } catch (error) {
        console.error(`Error fetching creator for ${tokenMint}:`, error);
        return null;
      }
    }
    
    // Helper to find or create developer profile
    async function findOrCreateDeveloper(creatorWallet: string, source: string): Promise<string | null> {
      // Check if profile exists
      const { data: existing } = await supabase
        .from('developer_profiles')
        .select('id')
        .eq('master_wallet_address', creatorWallet)
        .single();
      
      if (existing) {
        return existing.id;
      }
      
      // Create new profile
      const { data: newProfile, error } = await supabase
        .from('developer_profiles')
        .insert({
          master_wallet_address: creatorWallet,
          trust_level: 'neutral',
          reputation_score: 50,
          total_tokens_created: 0,
          successful_tokens: 0,
          failed_tokens: 0,
          rug_pull_count: 0,
          source: source,
        })
        .select('id')
        .single();
      
      if (error) {
        console.error('Error creating developer profile:', error);
        return null;
      }
      
      return newProfile.id;
    }
    
    // Helper to determine outcome from profit
    function determineOutcome(profitUsd: number | null, buyPrice: number, sellPrice: number | null): string {
      if (sellPrice === null || profitUsd === null) return 'pending';
      
      const pnlPercent = ((sellPrice - buyPrice) / buyPrice) * 100;
      
      if (pnlPercent >= 50) return 'success';
      if (pnlPercent >= 0) return 'neutral';
      if (pnlPercent > -50) return 'failed';
      return 'rug_pull'; // Lost more than 50%
    }
    
    // Process FlipIt positions
    if (source === 'flipit' || source === 'all') {
      console.log('Processing FlipIt positions...');
      
      const { data: flipPositions, error: flipError } = await supabase
        .from('flip_positions')
        .select('*')
        .in('status', ['sold', 'stopped_out'])
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (flipError) {
        results.flipit.errors.push(`Query error: ${flipError.message}`);
      } else if (flipPositions) {
        for (const position of flipPositions) {
          results.flipit.processed++;
          
          try {
            // Check if already tracked
            const { data: existingToken } = await supabase
              .from('developer_tokens')
              .select('id')
              .eq('flipit_position_id', position.id)
              .single();
            
            if (existingToken) {
              console.log(`Position ${position.id} already tracked, skipping`);
              continue;
            }
            
            // Get creator wallet
            const creatorWallet = await getTokenCreator(position.token_mint);
            
            if (!creatorWallet) {
              results.flipit.errors.push(`No creator found for ${position.token_symbol || position.token_mint}`);
              continue;
            }
            
            // Find or create developer
            const developerId = await findOrCreateDeveloper(creatorWallet, 'flipit_backfill');
            
            if (!developerId) {
              results.flipit.errors.push(`Failed to create developer for ${creatorWallet}`);
              continue;
            }
            
            // Determine outcome
            const outcome = determineOutcome(
              position.profit_usd,
              position.buy_price_usd,
              position.sell_price_usd
            );
            
            // Create developer token entry
            const { error: tokenError } = await supabase
              .from('developer_tokens')
              .insert({
                developer_id: developerId,
                token_mint: position.token_mint,
                creator_wallet: creatorWallet,
                launch_date: position.buy_executed_at || position.created_at,
                is_active: false,
                outcome: outcome,
                flipit_position_id: position.id,
                notes: `Backfilled from FlipIt. P&L: $${position.profit_usd?.toFixed(2) || 'N/A'}`,
              });
            
            if (tokenError) {
              results.flipit.errors.push(`Token insert error: ${tokenError.message}`);
              continue;
            }
            
            results.flipit.created++;
            
            // Update developer stats
            const updateField = outcome === 'success' ? 'successful_tokens' : 
                               outcome === 'rug_pull' ? 'rug_pull_count' : 
                               'failed_tokens';
            
            await supabase.rpc('increment_developer_stat', {
              p_developer_id: developerId,
              p_field: updateField,
            }).catch(() => {
              // Fallback: manual update
              supabase
                .from('developer_profiles')
                .select('total_tokens_created, successful_tokens, failed_tokens, rug_pull_count')
                .eq('id', developerId)
                .single()
                .then(({ data }) => {
                  if (data) {
                    const updates: Record<string, number> = {
                      total_tokens_created: (data.total_tokens_created || 0) + 1,
                    };
                    if (outcome === 'success') updates.successful_tokens = (data.successful_tokens || 0) + 1;
                    else if (outcome === 'rug_pull') updates.rug_pull_count = (data.rug_pull_count || 0) + 1;
                    else if (outcome === 'failed') updates.failed_tokens = (data.failed_tokens || 0) + 1;
                    
                    supabase.from('developer_profiles').update(updates).eq('id', developerId);
                  }
                });
            });
            
            results.flipit.updated++;
            console.log(`Processed FlipIt position: ${position.token_symbol} -> ${outcome}`);
            
          } catch (error) {
            results.flipit.errors.push(`Error processing ${position.id}: ${error}`);
          }
        }
      }
    }
    
    // Process Fantasy positions
    if (source === 'fantasy' || source === 'all') {
      console.log('Processing Fantasy positions...');
      
      const { data: fantasyPositions, error: fantasyError } = await supabase
        .from('telegram_fantasy_positions')
        .select('*')
        .eq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (fantasyError) {
        results.fantasy.errors.push(`Query error: ${fantasyError.message}`);
      } else if (fantasyPositions) {
        for (const position of fantasyPositions) {
          results.fantasy.processed++;
          
          try {
            // Check if already tracked by token mint (fantasy doesn't have position ID link)
            const { data: existingToken } = await supabase
              .from('developer_tokens')
              .select('id')
              .eq('token_mint', position.token_mint)
              .ilike('notes', '%Fantasy%')
              .single();
            
            if (existingToken) {
              console.log(`Fantasy position for ${position.token_symbol} already tracked, skipping`);
              continue;
            }
            
            // Get creator wallet
            const creatorWallet = await getTokenCreator(position.token_mint);
            
            if (!creatorWallet) {
              results.fantasy.errors.push(`No creator found for ${position.token_symbol || position.token_mint}`);
              continue;
            }
            
            // Find or create developer
            const developerId = await findOrCreateDeveloper(creatorWallet, 'fantasy_backfill');
            
            if (!developerId) {
              results.fantasy.errors.push(`Failed to create developer for ${creatorWallet}`);
              continue;
            }
            
            // Determine outcome from PnL percent
            let outcome = 'pending';
            if (position.realized_pnl_percent !== null) {
              if (position.realized_pnl_percent >= 50) outcome = 'success';
              else if (position.realized_pnl_percent >= 0) outcome = 'neutral';
              else if (position.realized_pnl_percent > -50) outcome = 'failed';
              else outcome = 'rug_pull';
            }
            
            // Create developer token entry
            const { error: tokenError } = await supabase
              .from('developer_tokens')
              .insert({
                developer_id: developerId,
                token_mint: position.token_mint,
                creator_wallet: creatorWallet,
                launch_date: position.created_at,
                is_active: false,
                outcome: outcome,
                notes: `Backfilled from Fantasy (${position.channel_name || 'Unknown Channel'}). P&L: ${position.realized_pnl_percent?.toFixed(1) || 'N/A'}%`,
              });
            
            if (tokenError) {
              results.fantasy.errors.push(`Token insert error: ${tokenError.message}`);
              continue;
            }
            
            results.fantasy.created++;
            
            // Update developer stats (similar to FlipIt)
            await supabase
              .from('developer_profiles')
              .select('total_tokens_created, successful_tokens, failed_tokens, rug_pull_count')
              .eq('id', developerId)
              .single()
              .then(({ data }) => {
                if (data) {
                  const updates: Record<string, number> = {
                    total_tokens_created: (data.total_tokens_created || 0) + 1,
                  };
                  if (outcome === 'success') updates.successful_tokens = (data.successful_tokens || 0) + 1;
                  else if (outcome === 'rug_pull') updates.rug_pull_count = (data.rug_pull_count || 0) + 1;
                  else if (outcome === 'failed') updates.failed_tokens = (data.failed_tokens || 0) + 1;
                  
                  return supabase.from('developer_profiles').update(updates).eq('id', developerId);
                }
              });
            
            results.fantasy.updated++;
            console.log(`Processed Fantasy position: ${position.token_symbol} -> ${outcome}`);
            
          } catch (error) {
            results.fantasy.errors.push(`Error processing ${position.id}: ${error}`);
          }
        }
      }
    }
    
    console.log('Backfill complete:', results);
    
    return new Response(JSON.stringify({
      success: true,
      results,
      summary: {
        totalProcessed: results.flipit.processed + results.fantasy.processed,
        totalCreated: results.flipit.created + results.fantasy.created,
        totalErrors: results.flipit.errors.length + results.fantasy.errors.length,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
