import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeveloperWallet {
  id: string;
  developer_id: string;
  wallet_address: string;
  wallet_type: string;
  launchpad_detected: string | null;
  last_scanned_at: string | null;
}

interface DeveloperProfile {
  id: string;
  primary_wallet: string;
  twitter_handle: string | null;
  integrity_score: number;
  rug_count: number;
  is_active: boolean;
}

interface TokenMintEvent {
  signature: string;
  timestamp: number;
  mint: string;
  symbol?: string;
  name?: string;
  launchpad?: string;
}

// Detect launchpad from transaction data
function detectLaunchpad(programIds: string[]): string {
  const LAUNCHPAD_PROGRAMS: Record<string, string> = {
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'pump.fun',
    'BSfD6SHZigAfDWSjzD5Q41jw8LmKwtmjskPH9XW1mrRW': 'pump.fun',
    'pumpFunZG6XbN4D1XrCHiQCYymTrpKTvLK8gZj2XoaP': 'pump.fun',
    '9fQXfgGt8MjH3QLCaVmYMF9SLb6eM3dxpgNq7VLwMpD9': 'bags.fm',
    'BonkAXzJhfPbZT3J5dcfNTXpAG3KbJwn4h5gPQjGv4qB': 'bonk.fun',
  };

  for (const programId of programIds) {
    if (LAUNCHPAD_PROGRAMS[programId]) {
      return LAUNCHPAD_PROGRAMS[programId];
    }
  }
  return 'unknown';
}

// Fetch recent token mints from a wallet using Helius
async function fetchRecentMints(
  wallet: string, 
  heliusApiKey: string,
  since: Date
): Promise<TokenMintEvent[]> {
  const mints: TokenMintEvent[] = [];
  
  try {
    // Query Helius for token creation transactions
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${heliusApiKey}&type=TOKEN_MINT`,
      { method: 'GET' }
    );

    if (!response.ok) {
      console.error(`Helius API error for ${wallet}: ${response.status}`);
      return mints;
    }

    const transactions = await response.json();
    
    for (const tx of transactions || []) {
      const txTime = new Date(tx.timestamp * 1000);
      
      // Only include mints since the cutoff
      if (txTime < since) continue;
      
      // Extract mint address from token transfers
      const tokenMint = tx.tokenTransfers?.[0]?.mint || 
                        tx.nativeTransfers?.[0]?.mint;
      
      if (tokenMint) {
        const launchpad = detectLaunchpad(tx.accountData?.map((a: any) => a.account) || []);
        
        mints.push({
          signature: tx.signature,
          timestamp: tx.timestamp,
          mint: tokenMint,
          symbol: tx.tokenTransfers?.[0]?.tokenSymbol,
          name: tx.tokenTransfers?.[0]?.tokenName,
          launchpad
        });
      }
    }
  } catch (error) {
    console.error(`Error fetching mints for ${wallet}:`, error);
  }
  
  return mints;
}

// Check if developer is blacklisted or whitelisted
async function checkDeveloperStatus(
  supabase: any,
  developerId: string,
  wallet: string,
  twitterHandle: string | null
): Promise<{ status: 'blacklisted' | 'whitelisted' | 'neutral'; entry?: any }> {
  // Check blacklist by wallet
  const { data: blacklistWallet } = await supabase
    .from('pumpfun_blacklist')
    .select('*')
    .eq('identifier', wallet)
    .eq('entry_type', 'wallet')
    .eq('is_active', true)
    .single();
  
  if (blacklistWallet) {
    return { status: 'blacklisted', entry: blacklistWallet };
  }
  
  // Check blacklist by Twitter
  if (twitterHandle) {
    const { data: blacklistTwitter } = await supabase
      .from('pumpfun_blacklist')
      .select('*')
      .eq('identifier', twitterHandle.toLowerCase())
      .eq('entry_type', 'twitter_account')
      .eq('is_active', true)
      .single();
    
    if (blacklistTwitter) {
      return { status: 'blacklisted', entry: blacklistTwitter };
    }
  }
  
  // Check whitelist by wallet
  const { data: whitelistWallet } = await supabase
    .from('pumpfun_whitelist')
    .select('*')
    .eq('identifier', wallet)
    .eq('entry_type', 'wallet')
    .eq('is_active', true)
    .single();
  
  if (whitelistWallet) {
    return { status: 'whitelisted', entry: whitelistWallet };
  }
  
  // Check whitelist by Twitter
  if (twitterHandle) {
    const { data: whitelistTwitter } = await supabase
      .from('pumpfun_whitelist')
      .select('*')
      .eq('identifier', twitterHandle.toLowerCase())
      .eq('entry_type', 'twitter_account')
      .eq('is_active', true)
      .single();
    
    if (whitelistTwitter) {
      return { status: 'whitelisted', entry: whitelistTwitter };
    }
  }
  
  return { status: 'neutral' };
}

// Send alerts for new mints
async function sendMintAlert(
  supabase: any,
  developerProfile: DeveloperProfile,
  mint: TokenMintEvent,
  status: 'blacklisted' | 'whitelisted' | 'neutral',
  wallet: string
): Promise<void> {
  const alertType = status === 'blacklisted' ? 'blacklist_launch' :
                    status === 'whitelisted' ? 'whitelist_launch' : 'neutral_launch';
  
  const alertLevel = status === 'blacklisted' ? 'critical' :
                     status === 'whitelisted' ? 'success' : 'info';

  // Insert alert record
  const { data: alert, error: alertError } = await supabase
    .from('developer_mint_alerts')
    .insert({
      developer_id: developerProfile.id,
      token_mint: mint.mint,
      token_symbol: mint.symbol,
      token_name: mint.name,
      creator_wallet: wallet,
      launchpad: mint.launchpad,
      alert_type: alertType,
      alert_level: alertLevel,
      alert_sent_at: new Date().toISOString(),
      metadata: {
        developer_twitter: developerProfile.twitter_handle,
        developer_rug_count: developerProfile.rug_count,
        developer_integrity_score: developerProfile.integrity_score,
        mint_signature: mint.signature,
        mint_timestamp: mint.timestamp
      }
    })
    .select()
    .single();

  if (alertError) {
    console.error('Failed to create alert record:', alertError);
    return;
  }

  // Create admin notification
  const notificationTitle = status === 'blacklisted' 
    ? `🚨 BLACKLISTED DEV LAUNCHED: $${mint.symbol || 'UNKNOWN'}`
    : status === 'whitelisted'
    ? `✅ TRUSTED DEV LAUNCHED: $${mint.symbol || 'UNKNOWN'}`
    : `📢 Known dev launched: $${mint.symbol || 'UNKNOWN'}`;

  const notificationMessage = status === 'blacklisted'
    ? `AVOID: ${developerProfile.twitter_handle || wallet.slice(0, 8)} just minted ${mint.mint.slice(0, 12)}... on ${mint.launchpad}. History: ${developerProfile.rug_count} rugs.`
    : status === 'whitelisted'
    ? `OPPORTUNITY: Trusted dev ${developerProfile.twitter_handle || wallet.slice(0, 8)} launched on ${mint.launchpad}. Integrity: ${developerProfile.integrity_score}/100.`
    : `Known developer ${developerProfile.twitter_handle || wallet.slice(0, 8)} launched new token on ${mint.launchpad}.`;

  await supabase.from('admin_notifications').insert({
    notification_type: status === 'blacklisted' ? 'critical_alert' : 
                       status === 'whitelisted' ? 'opportunity_alert' : 'info_alert',
    title: notificationTitle,
    message: notificationMessage,
    metadata: {
      alert_id: alert.id,
      token_mint: mint.mint,
      developer_id: developerProfile.id,
      action_url: `https://pump.fun/${mint.mint}`
    }
  });

  // Trigger Telegram notification for critical alerts
  if (status === 'blacklisted') {
    try {
      await supabase.functions.invoke('telegram-bot-webhook', {
        body: {
          type: 'blacklist_launch_alert',
          data: {
            developer: developerProfile.twitter_handle || wallet,
            token_mint: mint.mint,
            token_symbol: mint.symbol,
            launchpad: mint.launchpad,
            rug_count: developerProfile.rug_count
          }
        }
      });
    } catch (e) {
      console.warn('Telegram notification failed:', e);
    }
  }

  // Trigger token-mint-watchdog for further analysis
  try {
    await supabase.functions.invoke('token-mint-watchdog-monitor', {
      body: {
        token_mint: mint.mint,
        triggered_by: 'developer_rescan',
        developer_status: status,
        priority: status === 'blacklisted' ? 'high' : 'normal'
      }
    });
  } catch (e) {
    console.warn('Watchdog trigger failed:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const heliusApiKey = Deno.env.get("HELIUS_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const { 
      batch_size = 50,
      hours_lookback = 24,
      force_full_scan = false 
    } = body;

    if (!heliusApiKey) {
      return new Response(
        JSON.stringify({ error: "HELIUS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sinceCutoff = new Date(Date.now() - hours_lookback * 60 * 60 * 1000);
    console.log(`[Developer Rescan] Starting scan for mints since ${sinceCutoff.toISOString()}`);

    // Fetch developer wallets that need scanning
    let query = supabase
      .from('developer_wallets')
      .select(`
        id,
        developer_id,
        wallet_address,
        wallet_type,
        launchpad_detected,
        last_scanned_at,
        developer_profiles!inner (
          id,
          primary_wallet,
          twitter_handle,
          integrity_score,
          rug_count,
          is_active
        )
      `)
      .eq('developer_profiles.is_active', true)
      .order('last_scanned_at', { ascending: true, nullsFirst: true })
      .limit(batch_size);

    // Only scan wallets not scanned in last 12 hours (unless force)
    if (!force_full_scan) {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      query = query.or(`last_scanned_at.is.null,last_scanned_at.lt.${twelveHoursAgo}`);
    }

    const { data: wallets, error: walletsError } = await query;

    if (walletsError) {
      throw new Error(`Failed to fetch wallets: ${walletsError.message}`);
    }

    console.log(`[Developer Rescan] Processing ${wallets?.length || 0} wallets`);

    const results = {
      wallets_scanned: 0,
      new_mints_found: 0,
      alerts_created: 0,
      blacklist_alerts: 0,
      whitelist_alerts: 0,
      neutral_alerts: 0,
      errors: [] as string[]
    };

    for (const walletRow of wallets || []) {
      try {
        const wallet = walletRow.wallet_address;
        const developerProfile = walletRow.developer_profiles as unknown as DeveloperProfile;
        
        // Fetch recent mints from this wallet
        const mints = await fetchRecentMints(wallet, heliusApiKey, sinceCutoff);
        results.wallets_scanned++;

        for (const mint of mints) {
          // Check if we already have this token tracked
          const { data: existingToken } = await supabase
            .from('developer_tokens')
            .select('id')
            .eq('token_mint', mint.mint)
            .single();

          if (existingToken) {
            // Already tracked, skip
            continue;
          }

          results.new_mints_found++;

          // Check developer status
          const { status, entry } = await checkDeveloperStatus(
            supabase,
            developerProfile.id,
            wallet,
            developerProfile.twitter_handle
          );

          // Add to developer_tokens
          await supabase.from('developer_tokens').upsert({
            developer_id: developerProfile.id,
            token_mint: mint.mint,
            token_symbol: mint.symbol,
            token_name: mint.name,
            creator_wallet: wallet,
            launchpad: mint.launchpad,
            mint_signature: mint.signature,
            created_at: new Date(mint.timestamp * 1000).toISOString()
          }, { onConflict: 'token_mint' });

          // Update launchpad_detected on wallet if detected
          if (mint.launchpad && mint.launchpad !== 'unknown') {
            await supabase
              .from('developer_wallets')
              .update({ launchpad_detected: mint.launchpad })
              .eq('id', walletRow.id);
          }

          // Send alert
          await sendMintAlert(supabase, developerProfile, mint, status, wallet);
          results.alerts_created++;

          if (status === 'blacklisted') results.blacklist_alerts++;
          else if (status === 'whitelisted') results.whitelist_alerts++;
          else results.neutral_alerts++;
        }

        // Update last_scanned_at
        await supabase
          .from('developer_wallets')
          .update({ last_scanned_at: new Date().toISOString() })
          .eq('id', walletRow.id);

        // Rate limiting: small delay between wallets
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (walletError: any) {
        results.errors.push(`Wallet ${walletRow.wallet_address}: ${walletError.message}`);
      }
    }

    console.log(`[Developer Rescan] Complete:`, results);

    return new Response(JSON.stringify({
      success: true,
      ...results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[Developer Rescan] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
