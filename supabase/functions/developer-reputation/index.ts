import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { walletAddress } = await req.json();

    if (!walletAddress) {
      return new Response(
        JSON.stringify({ error: 'walletAddress is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching reputation for wallet: ${walletAddress}`);

    // Check if this wallet is a known developer master wallet
    const { data: developerProfile, error: profileError } = await supabase
      .from('developer_profiles')
      .select('*')
      .eq('master_wallet_address', walletAddress)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Error fetching developer profile:', profileError);
    }

    // Check if this wallet is in developer_wallets (could be a sub-wallet)
    const { data: developerWallet, error: walletError } = await supabase
      .from('developer_wallets')
      .select(`
        *,
        developer_profiles!inner(*)
      `)
      .eq('wallet_address', walletAddress)
      .single();

    if (walletError && walletError.code !== 'PGRST116') {
      console.error('Error fetching developer wallet:', walletError);
    }

    // Use whichever we found
    const profile = developerProfile || developerWallet?.developer_profiles;

    if (!profile) {
      return new Response(
        JSON.stringify({
          found: false,
          message: 'Wallet not in developer intelligence database',
          riskLevel: 'unknown',
          canTrade: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate risk level based on reputation score and trust level
    let riskLevel = 'unknown';
    let riskColor = 'gray';
    let canTrade = true;
    let warning = '';

    if (profile.trust_level === 'blacklisted') {
      riskLevel = 'critical';
      riskColor = 'red';
      canTrade = false;
      warning = 'This developer is blacklisted due to confirmed malicious activity';
    } else if (profile.trust_level === 'untrusted') {
      riskLevel = 'high';
      riskColor = 'orange';
      canTrade = true;
      warning = 'This developer has a history of failed or suspicious tokens';
    } else if (profile.reputation_score < 30) {
      riskLevel = 'high';
      riskColor = 'orange';
      canTrade = true;
      warning = 'Low reputation score indicates high risk';
    } else if (profile.reputation_score < 50) {
      riskLevel = 'medium';
      riskColor = 'yellow';
      canTrade = true;
      warning = 'Moderate risk - proceed with caution';
    } else if (profile.reputation_score < 70) {
      riskLevel = 'low';
      riskColor = 'green';
      canTrade = true;
      warning = '';
    } else {
      riskLevel = 'verified';
      riskColor = 'blue';
      canTrade = true;
      warning = '';
    }

    // Get token statistics
    const { data: tokens, error: tokensError } = await supabase
      .from('developer_tokens')
      .select('outcome')
      .eq('developer_id', profile.id);

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
    }

    const stats = {
      totalTokens: profile.total_tokens_created || 0,
      successfulTokens: profile.successful_tokens || 0,
      failedTokens: profile.failed_tokens || 0,
      rugPulls: profile.rug_pull_count || 0,
      slowDrains: profile.slow_drain_count || 0,
      reputationScore: profile.reputation_score || 50,
      trustLevel: profile.trust_level || 'neutral'
    };

    return new Response(
      JSON.stringify({
        found: true,
        walletAddress,
        profile: {
          id: profile.id,
          displayName: profile.display_name,
          masterWallet: profile.master_wallet_address,
          kycVerified: profile.kyc_verified,
          tags: profile.tags || []
        },
        risk: {
          level: riskLevel,
          color: riskColor,
          score: profile.reputation_score,
          trustLevel: profile.trust_level,
          canTrade,
          warning
        },
        stats,
        lastAnalyzed: profile.last_analysis_at
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in developer-reputation function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
