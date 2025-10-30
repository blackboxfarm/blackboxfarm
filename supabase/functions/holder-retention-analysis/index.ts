import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token_mint, timeframe = '30d' } = await req.json();

    if (!token_mint) {
      return new Response(
        JSON.stringify({ error: 'token_mint is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate date range
    const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get snapshots for the period
    const { data: snapshots } = await supabase
      .from('holder_snapshots')
      .select('*')
      .eq('token_mint', token_mint)
      .gte('snapshot_date', startDate)
      .order('snapshot_date', { ascending: true });

    if (!snapshots || snapshots.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No snapshot data available for this token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group by date and tier
    const dailyData: any = {};
    const tiers = ['Whale', 'Large', 'Medium', 'Small', 'Dust'];
    
    for (const snapshot of snapshots) {
      const date = snapshot.snapshot_date;
      if (!dailyData[date]) {
        dailyData[date] = { date, wallets: new Set(), byTier: {} };
        tiers.forEach(tier => dailyData[date].byTier[tier] = new Set());
      }
      dailyData[date].wallets.add(snapshot.wallet_address);
      if (snapshot.tier) {
        dailyData[date].byTier[snapshot.tier].add(snapshot.wallet_address);
      }
    }

    // Calculate retention metrics
    const dates = Object.keys(dailyData).sort();
    const firstDate = dates[0];
    const firstDayWallets = dailyData[firstDate].wallets;
    
    const retentionData = dates.map((date, index) => {
      const currentWallets = dailyData[date].wallets;
      const retainedCount = [...firstDayWallets].filter(w => currentWallets.has(w)).length;
      const retentionRate = (retainedCount / firstDayWallets.size) * 100;
      
      const tierRetention: any = {};
      tiers.forEach(tier => {
        const firstDayTierWallets = dailyData[firstDate].byTier[tier];
        const currentTierWallets = dailyData[date].byTier[tier];
        if (firstDayTierWallets.size > 0) {
          const retained = [...firstDayTierWallets].filter(w => currentTierWallets.has(w)).length;
          tierRetention[tier] = (retained / firstDayTierWallets.size) * 100;
        } else {
          tierRetention[tier] = 0;
        }
      });

      return {
        date,
        day: index,
        totalRetention: retentionRate,
        ...tierRetention,
      };
    });

    // Calculate Diamond Hands Score (0-100)
    let diamondHandsScore = 50; // Base score
    
    // Factor 1: Retention rate (+25 points)
    const latestRetention = retentionData[retentionData.length - 1]?.totalRetention || 0;
    if (latestRetention > 80) diamondHandsScore += 25;
    else if (latestRetention > 60) diamondHandsScore += 15;
    else if (latestRetention > 40) diamondHandsScore += 5;
    else diamondHandsScore -= 10;
    
    // Factor 2: Average hold duration (+20 points)
    const avgRetention = retentionData.reduce((sum, d) => sum + d.totalRetention, 0) / retentionData.length;
    if (avgRetention > 70) diamondHandsScore += 20;
    else if (avgRetention > 50) diamondHandsScore += 10;
    
    // Factor 3: Churn rate (+15 points for low churn)
    const churnRate = 100 - latestRetention;
    if (churnRate < 20) diamondHandsScore += 15;
    else if (churnRate < 40) diamondHandsScore += 5;
    else diamondHandsScore -= 10;
    
    // Factor 4: Tier diversity (+10 points)
    const whaleRetention = retentionData[retentionData.length - 1]?.Whale || 0;
    const mediumRetention = retentionData[retentionData.length - 1]?.Medium || 0;
    if (whaleRetention > 60 && mediumRetention > 50) diamondHandsScore += 10;
    
    // Cap score at 0-100
    diamondHandsScore = Math.max(0, Math.min(100, diamondHandsScore));

    return new Response(
      JSON.stringify({
        retention_data: retentionData,
        diamond_hands_score: Math.round(diamondHandsScore),
        metrics: {
          total_wallets_start: firstDayWallets.size,
          total_wallets_now: dailyData[dates[dates.length - 1]].wallets.size,
          retention_rate: latestRetention.toFixed(2),
          churn_rate: churnRate.toFixed(2),
          avg_retention: avgRetention.toFixed(2),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error analyzing holder retention:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
