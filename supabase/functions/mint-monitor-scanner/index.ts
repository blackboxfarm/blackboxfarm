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
  description?: string;
  image?: string;
  timestamp: number;
  // Enhanced trading data
  holderCount?: number;
  buyCount?: number;
  sellCount?: number;
  currentPriceUsd?: number;
  currentPriceSol?: number;
  bondingCurvePercent?: number;
  marketCapUsd?: number;
  liquidityUsd?: number;
  volume24h?: number;
  // Graduation & launchpad
  isGraduated?: boolean;
  launchpad?: string;
  creatorWallet?: string;
}

async function fetchPumpFunData(mint: string): Promise<Partial<TokenMint> & { pumpFunGraduated?: boolean }> {
  try {
    // Try pump.fun API for bonding curve and trading data
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (!response.ok) {
      // If pump.fun returns 404, token might have graduated or doesn't exist on pump
      return { pumpFunGraduated: response.status === 404 ? undefined : undefined };
    }
    
    const data = await response.json();
    
    // Check if pump.fun indicates this token is complete/graduated
    // pump.fun sets complete: true and has raydium_pool when graduated
    const isPumpFunGraduated = data.complete === true || data.raydium_pool !== null;
    
    // Calculate bonding curve percentage
    // pump.fun graduates at ~$69K market cap / 85 SOL in curve
    const virtualSolReserves = data.virtual_sol_reserves ? Number(data.virtual_sol_reserves) / 1e9 : 0;
    const realSolReserves = data.real_sol_reserves ? Number(data.real_sol_reserves) / 1e9 : 0;
    const totalSolInCurve = virtualSolReserves + realSolReserves;
    const bondingCurvePercent = isPumpFunGraduated ? 100 : Math.min(100, (totalSolInCurve / 85) * 100);
    
    return {
      name: data.name,
      symbol: data.symbol,
      description: data.description,
      image: data.image_uri,
      bondingCurvePercent,
      marketCapUsd: data.usd_market_cap,
      pumpFunGraduated: isPumpFunGraduated,
    };
  } catch (e) {
    console.error(`Error fetching pump.fun data for ${mint}:`, e);
    return {};
  }
}

async function fetchDexScreenerData(mint: string): Promise<Partial<TokenMint> & { isGraduated?: boolean; launchpad?: string }> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!response.ok) return {};
    
    const data = await response.json();
    const pair = data.pairs?.[0];
    
    if (!pair) return {};
    
    // Detect if graduated to Raydium (has Raydium pair with liquidity)
    const raydiumPair = data.pairs?.find((p: any) => 
      p.dexId === 'raydium' && p.liquidity?.usd > 0
    );
    const isGraduated = !!raydiumPair;
    
    // Detect launchpad from pair URLs or dexId
    let launchpad: string | undefined;
    const pairUrl = pair.url || '';
    const websiteUrl = pair.info?.websites?.[0]?.url || '';
    
    if (pairUrl.includes('bags.fm') || websiteUrl.includes('bags.fm')) {
      launchpad = 'bags.fm';
    } else if (pairUrl.includes('bonk.fun') || websiteUrl.includes('bonk.fun')) {
      launchpad = 'bonk.fun';
    } else if (pairUrl.includes('pump.fun') || websiteUrl.includes('pump.fun') || pair.labels?.includes('pump.fun')) {
      launchpad = 'pump.fun';
    }
    
    return {
      currentPriceUsd: parseFloat(pair.priceUsd) || undefined,
      currentPriceSol: parseFloat(pair.priceNative) || undefined,
      liquidityUsd: pair.liquidity?.usd,
      volume24h: pair.volume?.h24,
      marketCapUsd: pair.fdv,
      buyCount: pair.txns?.h24?.buys,
      sellCount: pair.txns?.h24?.sells,
      isGraduated,
      launchpad,
    };
  } catch (e) {
    console.error(`Error fetching DexScreener data for ${mint}:`, e);
    return {};
  }
}

async function fetchHolderCount(mint: string, heliusApiKey: string): Promise<number | undefined> {
  try {
    const response = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mintAccounts: [mint], includeOffChain: true })
    });
    
    if (!response.ok) return undefined;
    
    const data = await response.json();
    // Note: Helius doesn't directly provide holder count, would need to use getTokenLargestAccounts
    // For now, return undefined - we get this from DexScreener if available
    return undefined;
  } catch (e) {
    return undefined;
  }
}

async function fetchEnhancedTokenData(mint: string, heliusApiKey: string, creatorWallet?: string): Promise<Partial<TokenMint>> {
  console.log(`Fetching enhanced data for ${mint}...`);
  
  // Fetch from multiple sources in parallel
  const [pumpData, dexData] = await Promise.all([
    fetchPumpFunData(mint),
    fetchDexScreenerData(mint),
  ]);
  
  // Determine if graduated:
  // 1. DexScreener shows Raydium pair with liquidity
  // 2. pump.fun API indicates complete/graduated
  // 3. Bonding curve at 100%
  const isGraduated = dexData.isGraduated || 
                      pumpData.pumpFunGraduated === true || 
                      (pumpData.bondingCurvePercent !== undefined && pumpData.bondingCurvePercent >= 100);
  
  console.log(`Graduation check for ${mint}: dexGrad=${dexData.isGraduated}, pumpGrad=${pumpData.pumpFunGraduated}, bondingCurve=${pumpData.bondingCurvePercent}`);
  
  // Merge data, preferring more complete sources
  return {
    ...pumpData,
    ...dexData,
    // Keep pump.fun metadata if DexScreener didn't have it
    name: dexData.name || pumpData.name,
    symbol: dexData.symbol || pumpData.symbol,
    description: pumpData.description,
    image: pumpData.image,
    // Keep bonding curve from pump.fun (set to 100 if graduated)
    bondingCurvePercent: isGraduated ? 100 : pumpData.bondingCurvePercent,
    isGraduated,
    launchpad: dexData.launchpad,
    creatorWallet,
  };
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
    if (tx.timestamp && tx.timestamp < cutoffTime) continue;
    
    const instructions = tx.instructions || [];
    for (const ix of instructions) {
      if (ix.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
          ix.programId === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P') {
        
        if (ix.accounts && ix.accounts.length > 0) {
          const mintAccount = ix.accounts[0];
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
    
    if (tx.tokenTransfers) {
      for (const transfer of tx.tokenTransfers) {
        if (transfer.toUserAccount === walletAddress && transfer.mint) {
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
    
    const { action, walletAddress, userId, sourceToken, maxAgeHours, testMint } = await req.json();
    
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
      const newMintsForNotification: { walletAddress: string; mints: TokenMint[]; userEmail?: string }[] = [];
      
      for (const wallet of (wallets || [])) {
        const scanStartTime = Date.now();
        let scanStatus = 'success';
        let errorMessage: string | null = null;
        let mintsFound = 0;
        let newMintsCount = 0;
        
        try {
          const mints = await scanWalletForMints(wallet.wallet_address, heliusApiKey, 1); // Last hour
          mintsFound = mints.length;
          
          const newMints: TokenMint[] = [];
          
          // Store new detections
          for (const mint of mints) {
            const { data: existing } = await supabase
              .from('mint_monitor_detections')
              .select('id')
              .eq('wallet_id', wallet.id)
              .eq('token_mint', mint.mint)
              .single();
            
            if (!existing) {
              // This is a NEW mint!
              const { error: insertError } = await supabase
                .from('mint_monitor_detections')
                .insert({
                  wallet_id: wallet.id,
                  token_mint: mint.mint,
                  token_name: mint.name,
                  token_symbol: mint.symbol,
                  token_image: mint.image,
                  detected_at: new Date(mint.timestamp * 1000).toISOString()
                });
              
              if (!insertError) {
                newMints.push(mint);
                newMintsCount++;
              } else {
                console.error(`Error storing detection: ${insertError.message}`);
              }
            }
          }
          
          // Update last scanned time
          await supabase
            .from('mint_monitor_wallets')
            .update({ last_scanned_at: new Date().toISOString() })
            .eq('id', wallet.id);
          
          // Collect for notification if new mints found
          if (newMints.length > 0) {
            // Use notification_emails from wallet config, fallback to user's auth email
            let emails: string[] = wallet.notification_emails || [];
            
            if (emails.length === 0) {
              // Fallback to auth user email
              const { data: userData } = await supabase.auth.admin.getUserById(wallet.user_id);
              if (userData?.user?.email) {
                emails = [userData.user.email];
              }
            }
            
            for (const email of emails) {
              newMintsForNotification.push({
                walletAddress: wallet.wallet_address,
                mints: newMints,
                userEmail: email
              });
            }
          }
          
          results.push({
            wallet: wallet.wallet_address,
            newMints: newMints.length,
            mints: newMints
          });
        } catch (e) {
          console.error(`Error scanning wallet ${wallet.wallet_address}:`, e);
          scanStatus = 'error';
          errorMessage = e.message;
          results.push({
            wallet: wallet.wallet_address,
            error: e.message
          });
        }
        
        // Log this scan attempt
        const scanDurationMs = Date.now() - scanStartTime;
        await supabase.from('mint_monitor_scan_logs').insert({
          wallet_id: wallet.id,
          wallet_address: wallet.wallet_address,
          scanned_at: new Date().toISOString(),
          mints_found: mintsFound,
          new_mints_detected: newMintsCount,
          status: scanStatus,
          error_message: errorMessage,
          scan_duration_ms: scanDurationMs
        });
      }
      
      // Send notifications for new mints
      if (newMintsForNotification.length > 0) {
        console.log(`Sending notifications for ${newMintsForNotification.length} wallets with new mints`);
        
        // Group by user email
        const byEmail: Record<string, { wallets: string[]; mints: TokenMint[] }> = {};
        for (const item of newMintsForNotification) {
          if (item.userEmail) {
            if (!byEmail[item.userEmail]) {
              byEmail[item.userEmail] = { wallets: [], mints: [] };
            }
            byEmail[item.userEmail].wallets.push(item.walletAddress);
            byEmail[item.userEmail].mints.push(...item.mints);
          }
        }
        
        // Send one email per user with enhanced token data
        for (const [email, data] of Object.entries(byEmail)) {
          try {
            // Fetch enhanced data for each token in parallel
            const enhancedMints = await Promise.all(
              data.mints.map(async (mint) => {
                const enhanced = await fetchEnhancedTokenData(mint.mint, heliusApiKey);
                return {
                  ...mint,
                  ...enhanced,
                  // Ensure we keep original data if enhanced is empty
                  name: enhanced.name || mint.name,
                  symbol: enhanced.symbol || mint.symbol,
                  image: enhanced.image || mint.image,
                };
              })
            );
            
            const mintsList = enhancedMints.map(m => 
              `• $${m.symbol || 'Unknown'} - ${m.name || 'No name'}`
            ).join('\n');
            
            await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                type: 'email',
                to: email,
                subject: `🚨 New Token Mint Detected - ${enhancedMints.length} token(s)`,
                message: `A monitored spawner wallet has created ${enhancedMints.length} new token(s)!\n\nMonitored Wallets: ${data.wallets.length}\n\nNew Tokens:\n${mintsList}`,
                notificationType: 'wallet',
                level: 'warning',
                data: { 
                  mints: enhancedMints.map(m => ({
                    mint: m.mint,
                    symbol: m.symbol,
                    name: m.name,
                    description: m.description,
                    image: m.image,
                    holderCount: m.holderCount,
                    buyCount: m.buyCount,
                    sellCount: m.sellCount,
                    currentPriceUsd: m.currentPriceUsd,
                    currentPriceSol: m.currentPriceSol,
                    bondingCurvePercent: m.bondingCurvePercent,
                    marketCapUsd: m.marketCapUsd,
                    liquidityUsd: m.liquidityUsd,
                    volume24h: m.volume24h,
                  }))
                }
              })
            });
            console.log(`Enhanced notification sent to ${email} with ${enhancedMints.length} tokens`);
          } catch (notifErr) {
            console.error(`Failed to send notification to ${email}:`, notifErr);
          }
        }
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        scannedWallets: wallets?.length || 0,
        newMintsDetected: newMintsForNotification.reduce((acc, w) => acc + w.mints.length, 0),
        notificationsSent: Object.keys(newMintsForNotification.reduce((acc, w) => {
          if (w.userEmail) acc[w.userEmail] = true;
          return acc;
        }, {} as Record<string, boolean>)).length,
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
    
    // Test notification action - supports custom mint via testMint param
    if (action === 'test_notification') {
      const emails = ['admin@blackbox.farm', 'wilsondavid@live.ca'];
      
      let testMintData;
      
      // If custom mint provided, fetch real data
      if (testMint?.mint) {
        console.log(`Fetching real data for custom test mint: ${testMint.mint}`);
        const enhanced = await fetchEnhancedTokenData(testMint.mint, heliusApiKey, testMint.creatorWallet);
        testMintData = {
          mint: testMint.mint,
          ...enhanced,
          creatorWallet: testMint.creatorWallet,
        };
        console.log(`Enhanced data for ${testMint.mint}:`, testMintData);
      } else {
        // Default test data
        testMintData = {
          mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          symbol: 'TESTCOIN',
          name: 'Test Token for Watchdog Demo',
          description: 'This is a sample token created to demonstrate the email notifications.',
          image: 'https://pump.fun/logo.png',
          holderCount: 1247,
          buyCount: 892,
          sellCount: 156,
          currentPriceUsd: 0.00004523,
          currentPriceSol: 0.000000234,
          bondingCurvePercent: 67.5,
          marketCapUsd: 45230,
          liquidityUsd: 12500,
          volume24h: 8750,
          isGraduated: false,
          launchpad: 'pump.fun',
        };
      }
      
      const results: { email: string; success: boolean; error?: string }[] = [];
      const tokenSymbol = testMintData.symbol || 'Token';
      
      for (const email of emails) {
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              type: 'email',
              to: email,
              subject: `🚨 New Token Mint Detected - $${tokenSymbol}`,
              message: `A monitored spawner wallet has created a new token!\n\n${testMintData.creatorWallet ? `Creator: ${testMintData.creatorWallet}` : ''}`,
              notificationType: 'wallet',
              level: 'warning',
              data: { mints: [testMintData] }
            })
          });
          
          const result = await resp.json();
          console.log(`Test notification to ${email}:`, result);
          results.push({ email, success: resp.ok, error: result.error });
        } catch (e) {
          console.error(`Failed to send test to ${email}:`, e);
          results.push({ email, success: false, error: e.message });
        }
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Test notifications sent',
        tokenData: testMintData,
        results 
      }), {
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
