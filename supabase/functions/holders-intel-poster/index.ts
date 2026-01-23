import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWITTER_HANDLE = 'HoldersIntel';

// Quality thresholds
const MIN_HOLDERS = 50;
const MIN_HEALTH_SCORE = 20;
const SKIP_GRADES = ['F'];

// Tweet template matching ShareCardDemo
const TWEET_TEMPLATE = `🔍 ${'{TICKER}'} Holder Analysis

📊 {TOTAL_WALLETS} Total Wallets
↓
✅ Only {REAL_HOLDERS} Real Holders!

{DUST_PERCENTAGE}% are dust wallets

🐋 {WHALES} Whales ($5K+)
💪 {SERIOUS} Strong ($50-$5K)
🌱 {REAL_RETAIL} Active ($1-$50)
💨 {DUST_COUNT} Dust (<$1)

Health Grade: {HEALTH_GRADE} ({HEALTH_SCORE}/100)

Free report 👉 blackbox.farm/holders?token={TOKEN_ADDRESS}`;

function processTemplate(template: string, data: any): string {
  return template
    .replace('{TICKER}', `$${data.symbol || 'TOKEN'}`)
    .replace('{TOTAL_WALLETS}', (data.totalHolders || 0).toLocaleString())
    .replace('{REAL_HOLDERS}', (data.realHolders || 0).toLocaleString())
    .replace('{DUST_PERCENTAGE}', String(data.dustPercentage || 0))
    .replace('{WHALES}', (data.whaleCount || 0).toLocaleString())
    .replace('{SERIOUS}', (data.seriousCount || 0).toLocaleString())
    .replace('{REAL_RETAIL}', (data.activeCount || 0).toLocaleString())
    .replace('{DUST_COUNT}', (data.dustCount || 0).toLocaleString())
    .replace('{HEALTH_GRADE}', data.healthGrade || 'N/A')
    .replace('{HEALTH_SCORE}', String(data.healthScore || 0))
    .replace('{TOKEN_ADDRESS}', data.tokenMint || '');
}

async function fetchHolderReport(tokenMint: string, supabaseUrl: string, anonKey: string): Promise<any> {
  console.log(`[poster] Fetching holder report for ${tokenMint}`);
  
  const response = await fetch(
    `${supabaseUrl}/functions/v1/bagless-holders-report`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ tokenMint }),
    }
  );
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Holder report failed: ${response.status} - ${text}`);
  }
  
  return response.json();
}

async function postTweet(tweetText: string, supabaseUrl: string, anonKey: string): Promise<any> {
  console.log(`[poster] Posting tweet (${tweetText.length} chars)`);
  
  const response = await fetch(
    `${supabaseUrl}/functions/v1/post-share-card-twitter`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        tweetText,
        twitterHandle: TWITTER_HANDLE,
      }),
    }
  );
  
  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Tweet posting failed');
  }
  
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || 
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU';
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check for any pending items that are due
    const now = new Date().toISOString();
    
    const { data: pendingItems, error: fetchError } = await supabase
      .from('holders_intel_post_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(1);
    
    if (fetchError) {
      throw fetchError;
    }
    
    if (!pendingItems || pendingItems.length === 0) {
      // Check if there are future pending items
      const { count } = await supabase
        .from('holders_intel_post_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No items due for posting',
          pendingCount: count || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const item = pendingItems[0];
    console.log(`[poster] Processing: ${item.symbol} (${item.token_mint})`);
    
    // Mark as processing
    await supabase
      .from('holders_intel_post_queue')
      .update({ status: 'processing' })
      .eq('id', item.id);
    
    try {
      // Fetch holder report
      const report = await fetchHolderReport(item.token_mint, supabaseUrl, anonKey);
      
      if (!report || report.error) {
        throw new Error(report?.error || 'Empty report returned');
      }
      
      // Extract stats from report
      const stats = {
        symbol: report.symbol || report.tokenSymbol || item.symbol,
        tokenMint: item.token_mint,
        totalHolders: report.totalHolders || 0,
        realHolders: report.realHolders || 0,
        dustCount: report.dustCount || 0,
        dustPercentage: report.dustPercentage || 
          Math.round((report.dustCount / report.totalHolders) * 100) || 0,
        whaleCount: report.whaleCount || report.simpleTiers?.whales || 0,
        seriousCount: report.seriousCount || report.simpleTiers?.serious || 0,
        activeCount: report.activeCount || report.simpleTiers?.retail || 0,
        healthGrade: report.healthGrade || report.stabilityGrade || 'N/A',
        healthScore: report.healthScore || report.stabilityScore || 0,
      };
      
      console.log(`[poster] Stats: ${stats.totalHolders} holders, grade ${stats.healthGrade}`);
      
      // Quality checks
      if (stats.totalHolders < MIN_HOLDERS) {
        console.log(`[poster] Skipping: too few holders (${stats.totalHolders})`);
        await supabase
          .from('holders_intel_post_queue')
          .update({ 
            status: 'skipped', 
            error_message: `Too few holders: ${stats.totalHolders}` 
          })
          .eq('id', item.id);
        
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: 'Too few holders' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (SKIP_GRADES.includes(stats.healthGrade)) {
        console.log(`[poster] Skipping: low health grade (${stats.healthGrade})`);
        await supabase
          .from('holders_intel_post_queue')
          .update({ 
            status: 'skipped', 
            error_message: `Low health grade: ${stats.healthGrade}` 
          })
          .eq('id', item.id);
        
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: 'Low health grade' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Build tweet
      const tweetText = processTemplate(TWEET_TEMPLATE, stats);
      
      // Post tweet
      const tweetResult = await postTweet(tweetText, supabaseUrl, anonKey);
      
      // Update queue with success
      await supabase
        .from('holders_intel_post_queue')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          tweet_id: tweetResult.tweetId,
        })
        .eq('id', item.id);
      
      // Update seen tokens
      await supabase
        .from('holders_intel_seen_tokens')
        .update({
          was_posted: true,
          health_grade: stats.healthGrade,
        })
        .eq('token_mint', item.token_mint);
      
      console.log(`[poster] Successfully posted tweet: ${tweetResult.tweetId}`);
      
      const elapsed = Date.now() - startTime;
      
      return new Response(
        JSON.stringify({
          success: true,
          posted: true,
          symbol: stats.symbol,
          tweetId: tweetResult.tweetId,
          tweetUrl: tweetResult.tweetUrl,
          executionTimeMs: elapsed,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
      
    } catch (postError: any) {
      console.error(`[poster] Error processing ${item.symbol}:`, postError);
      
      const errorMsg = postError.message || '';
      
      // ANY Twitter API rejection = skip immediately, never retry
      // We do NOT want to repeatedly hit their API and risk a ban
      const isTwitterRejection = errorMsg.includes('Twitter API error') ||
                                  errorMsg.includes('duplicate') ||
                                  errorMsg.includes('already posted') ||
                                  errorMsg.includes('Status is a duplicate') ||
                                  errorMsg.includes('187') ||
                                  errorMsg.includes('You are not allowed') ||
                                  errorMsg.includes('403') ||
                                  errorMsg.includes('401') ||
                                  errorMsg.includes('429') || // rate limit
                                  errorMsg.includes('Too Many Requests');
      
      if (isTwitterRejection) {
        console.log(`[poster] Twitter rejected, skipping (no retry): ${item.symbol} - ${errorMsg.substring(0, 100)}`);
        
        await supabase
          .from('holders_intel_post_queue')
          .update({
            status: 'skipped',
            error_message: `Twitter rejected: ${errorMsg.substring(0, 500)}`,
          })
          .eq('id', item.id);
        
        return new Response(
          JSON.stringify({
            success: true,
            skipped: true,
            reason: 'Twitter rejected',
            symbol: item.symbol,
            error: errorMsg.substring(0, 200),
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Non-Twitter errors (e.g., our holder report failed) - can retry once
      const newRetryCount = (item.retry_count || 0) + 1;
      const finalStatus = newRetryCount >= 2 ? 'failed' : 'pending'; // Max 1 retry for internal errors
      
      const retryAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min delay
      
      await supabase
        .from('holders_intel_post_queue')
        .update({
          status: finalStatus,
          error_message: postError.message,
          retry_count: newRetryCount,
          scheduled_at: finalStatus === 'pending' ? retryAt : item.scheduled_at,
        })
        .eq('id', item.id);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: postError.message,
          retryCount: newRetryCount,
          willRetry: finalStatus === 'pending',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
  } catch (error: any) {
    console.error('[poster] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
