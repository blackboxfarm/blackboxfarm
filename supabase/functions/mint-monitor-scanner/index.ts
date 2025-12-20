import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenMint {
  mint: string;
  name?: string;
  symbol?: string;
  image?: string;
  timestamp: number;
}

async function scanWalletForMints(
  walletAddress: string, 
  heliusApiKey: string,
  maxAgeHours: number = 24
): Promise<TokenMint[]> {
  console.log(`Scanning wallet ${walletAddress} for mints...`);
  
  const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusApiKey}&limit=100`;
  
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Helius API error: ${response.status}`);
    return [];
  }
  
  const transactions = await response.json();
  const mints: TokenMint[] = [];
  const cutoffTime = Date.now() / 1000 - (maxAgeHours * 3600);
  
  for (const tx of transactions) {
    // Skip old transactions
    if (tx.timestamp && tx.timestamp < cutoffTime) continue;
    
    // Look for token creation instructions
    const instructions = tx.instructions || [];
    for (const ix of instructions) {
      // Check for initializeMint instruction (Token Program)
      if (ix.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
          ix.programId === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P') { // pump.fun
        
        // Extract mint address from accounts
        if (ix.accounts && ix.accounts.length > 0) {
          const mintAccount = ix.accounts[0];
          
          // Fetch metadata for this mint
          const metadata = await fetchTokenMetadata(mintAccount, heliusApiKey);
          
          mints.push({
            mint: mintAccount,
            name: metadata?.name,
            symbol: metadata?.symbol,
            image: metadata?.image,
            timestamp: tx.timestamp || Date.now() / 1000
          });
        }
      }
    }
    
    // Also check tokenTransfers for mints where this wallet received tokens first
    if (tx.tokenTransfers) {
      for (const transfer of tx.tokenTransfers) {
        if (transfer.toUserAccount === walletAddress && transfer.mint) {
          // This could be initial token distribution
          const metadata = await fetchTokenMetadata(transfer.mint, heliusApiKey);
          if (metadata) {
            mints.push({
              mint: transfer.mint,
              name: metadata.name,
              symbol: metadata.symbol,
              image: metadata.image,
              timestamp: tx.timestamp || Date.now() / 1000
            });
          }
        }
      }
    }
  }
  
  // Deduplicate by mint address
  const uniqueMints = Array.from(
    new Map(mints.map(m => [m.mint, m])).values()
  );
  
  console.log(`Found ${uniqueMints.length} mints for wallet ${walletAddress}`);
  return uniqueMints;
}

async function fetchTokenMetadata(
  mint: string, 
  heliusApiKey: string
): Promise<{ name?: string; symbol?: string; image?: string } | null> {
  try {
    const url = `https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mintAccounts: [mint] })
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data && data.length > 0) {
      const token = data[0];
      return {
        name: token.onChainMetadata?.metadata?.data?.name || token.legacyMetadata?.name,
        symbol: token.onChainMetadata?.metadata?.data?.symbol || token.legacyMetadata?.symbol,
        image: token.onChainMetadata?.metadata?.data?.uri || token.legacyMetadata?.logoURI
      };
    }
    return null;
  } catch (e) {
    console.error(`Error fetching metadata for ${mint}:`, e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { action, walletAddress, userId, sourceToken, maxAgeHours } = await req.json();
    
    console.log(`Mint monitor action: ${action}`);
    
    if (action === 'scan_now') {
      // Immediate scan of a single wallet
      if (!walletAddress) {
        return new Response(JSON.stringify({ error: 'walletAddress required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const mints = await scanWalletForMints(walletAddress, heliusApiKey, maxAgeHours || 168); // 7 days default
      
      return new Response(JSON.stringify({ 
        success: true, 
        wallet: walletAddress,
        mints,
        scannedAt: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'add_to_cron') {
      // Add wallet to monitored list with cron enabled
      if (!walletAddress || !userId) {
        return new Response(JSON.stringify({ error: 'walletAddress and userId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const { data, error } = await supabase
        .from('mint_monitor_wallets')
        .upsert({
          user_id: userId,
          wallet_address: walletAddress,
          source_token: sourceToken,
          is_cron_enabled: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,wallet_address' })
        .select()
        .single();
      
      if (error) {
        console.error('Error adding to cron:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Wallet added to cron monitoring',
        wallet: data
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'remove_from_cron') {
      if (!walletAddress || !userId) {
        return new Response(JSON.stringify({ error: 'walletAddress and userId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const { error } = await supabase
        .from('mint_monitor_wallets')
        .update({ is_cron_enabled: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('wallet_address', walletAddress);
      
      if (error) {
        console.error('Error removing from cron:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ success: true, message: 'Wallet removed from cron' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'run_cron') {
      // Scan all cron-enabled wallets
      const { data: wallets, error: fetchError } = await supabase
        .from('mint_monitor_wallets')
        .select('*')
        .eq('is_cron_enabled', true);
      
      if (fetchError) {
        console.error('Error fetching wallets:', fetchError);
        return new Response(JSON.stringify({ error: fetchError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.log(`Running cron scan for ${wallets?.length || 0} wallets`);
      
      const results = [];
      for (const wallet of (wallets || [])) {
        try {
          const mints = await scanWalletForMints(wallet.wallet_address, heliusApiKey, 1); // Last hour
          
          // Store new detections
          for (const mint of mints) {
            const { error: insertError } = await supabase
              .from('mint_monitor_detections')
              .upsert({
                wallet_id: wallet.id,
                token_mint: mint.mint,
                token_name: mint.name,
                token_symbol: mint.symbol,
                token_image: mint.image,
                detected_at: new Date(mint.timestamp * 1000).toISOString()
              }, { onConflict: 'wallet_id,token_mint', ignoreDuplicates: true });
            
            if (insertError) {
              console.error(`Error storing detection: ${insertError.message}`);
            }
          }
          
          // Update last scanned time
          await supabase
            .from('mint_monitor_wallets')
            .update({ last_scanned_at: new Date().toISOString() })
            .eq('id', wallet.id);
          
          results.push({
            wallet: wallet.wallet_address,
            newMints: mints.length,
            mints
          });
        } catch (e) {
          console.error(`Error scanning wallet ${wallet.wallet_address}:`, e);
          results.push({
            wallet: wallet.wallet_address,
            error: e.message
          });
        }
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        scannedWallets: wallets?.length || 0,
        results
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'get_monitored') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const { data: wallets, error } = await supabase
        .from('mint_monitor_wallets')
        .select(`
          *,
          detections:mint_monitor_detections(*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ success: true, wallets }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in mint-monitor-scanner:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
