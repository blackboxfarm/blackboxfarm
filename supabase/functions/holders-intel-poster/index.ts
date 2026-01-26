import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWITTER_HANDLE = 'HoldersIntel';

// Quality thresholds
const MIN_HOLDERS = 50;
const SKIP_GRADES = ['F'];

// Fallback template if DB fetch fails
const FALLBACK_TEMPLATE = `🔍 $\{TICKER} Holder Analysis

📊 {TOTAL_WALLETS} Total | ✅ {REAL_HOLDERS} Real
{DUST_PERCENTAGE}% Dust | Health: {HEALTH_GRADE}

👉 blackbox.farm/holders?token={TOKEN_ADDRESS}`;

function asCount(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  // bagless-holders-report returns simpleTiers.* as objects: { count, percentage, ... }
  if (value && typeof value === 'object' && typeof value.count !== 'undefined') {
    const n = Number(value.count);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function getPostComment(timesPosted: number, triggerComment?: string | null): string {
  // If a trigger comment is provided (from DEX scanner), use it
  if (triggerComment) return triggerComment;
  
  // Default milestone-based comments
  if (timesPosted <= 1) return ' : First call out!';
  if (timesPosted === 2) return ' : Still on the Chart!';
  return ' : Steady & Strong!';
}

function processTemplate(template: string, data: any): string {
  const tickerUpper = (data.symbol || 'TOKEN').toUpperCase();
  const tokenName = data.name || data.tokenName || 'Unknown';
  // Pass trigger_comment to allow DEX scanner overrides
  const comment1 = getPostComment(data.timesPosted || 1, data.triggerComment);
  
  return template
    .replace(/\{TICKER\}/g, `$${tickerUpper}`)
    .replace(/\{ticker\}/g, tickerUpper)
    .replace(/\{NAME\}/g, tokenName)
    .replace(/\{name\}/g, tokenName)
    .replace(/\{comment1\}/g, comment1)
    .replace(/\{COMMENT1\}/g, comment1)
    .replace(/\{TOTAL_WALLETS\}/g, (data.totalHolders || 0).toLocaleString())
    .replace(/\{totalWallets\}/g, (data.totalHolders || 0).toLocaleString())
    .replace(/\{REAL_HOLDERS\}/g, (data.realHolders || 0).toLocaleString())
    .replace(/\{realHolders\}/g, (data.realHolders || 0).toLocaleString())
    .replace(/\{DUST_PERCENTAGE\}/g, String(data.dustPercentage || 0))
    .replace(/\{dustPct\}/g, String(data.dustPercentage || 0))
    .replace(/\{WHALES\}/g, (data.whaleCount || 0).toLocaleString())
    .replace(/\{whales\}/g, (data.whaleCount || 0).toLocaleString())
    .replace(/\{SERIOUS\}/g, (data.seriousCount || 0).toLocaleString())
    .replace(/\{serious\}/g, (data.seriousCount || 0).toLocaleString())
    .replace(/\{REAL_RETAIL\}/g, (data.activeCount || 0).toLocaleString())
    .replace(/\{retail\}/g, (data.activeCount || 0).toLocaleString())
    .replace(/\{DUST_COUNT\}/g, (data.dustCount || 0).toLocaleString())
    .replace(/\{dust\}/g, (data.dustCount || 0).toLocaleString())
    .replace(/\{HEALTH_GRADE\}/g, data.healthGrade || 'N/A')
    .replace(/\{healthGrade\}/g, data.healthGrade || 'N/A')
    .replace(/\{HEALTH_SCORE\}/g, String(data.healthScore || 0))
    .replace(/\{healthScore\}/g, String(data.healthScore || 0))
    .replace(/\{TOKEN_ADDRESS\}/g, data.tokenMint || '')
    .replace(/\{ca\}/g, data.tokenMint || '');
}

async function fetchActiveTemplate(supabase: any): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('holders_intel_templates')
      .select('template_text')
      .in('template_name', ['small', 'large'])
      .eq('is_active', true)
      .single();
    
    if (error || !data) {
      console.log('[poster] Failed to fetch active template, using fallback:', error?.message);
      return FALLBACK_TEMPLATE;
    }
    
    console.log('[poster] Using active template from database');
    return data.template_text;
  } catch (err) {
    console.error('[poster] Template fetch error:', err);
    return FALLBACK_TEMPLATE;
  }
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
    
    // Fetch the active template from database
    const tweetTemplate = await fetchActiveTemplate(supabase);
    
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
      
      // Get current times_posted from seen_tokens to determine comment
      const { data: seenToken } = await supabase
        .from('holders_intel_seen_tokens')
        .select('times_posted')
        .eq('token_mint', item.token_mint)
        .maybeSingle();
      
      const currentTimesPosted = (seenToken?.times_posted || 0) + 1; // +1 because this will be the next post
      
      // Extract + normalize stats from report (match manual ShareCardDemo mapping)
      const totalHolders = asCount(report?.totalHolders);
      const dustCount = asCount(report?.tierBreakdown?.dust ?? report?.dustWallets ?? report?.simpleTiers?.dust);
      const dustPercentage = totalHolders > 0 ? Math.round((dustCount / totalHolders) * 100) : 0;

      const stats = {
        symbol: (report?.tokenSymbol || report?.symbol || item.symbol || 'UNKNOWN').toString(),
        name: (report?.tokenName || report?.name || item.name || 'Unknown').toString(),
        tokenMint: item.token_mint,
        totalHolders,
        timesPosted: currentTimesPosted,
        // Pass trigger_comment from queue item (used by DEX scanner triggers)
        triggerComment: item.trigger_comment || null,
        // bagless-holders-report sets realHolders = realWalletCount ($50-$199)
        realHolders: asCount(report?.realHolders ?? report?.realWalletCount),
        dustCount,
        dustPercentage,
        // NOTE: simpleTiers.* are objects; always use .count
        whaleCount: asCount(report?.tierBreakdown?.whale ?? report?.simpleTiers?.whales),
        seriousCount: asCount(report?.tierBreakdown?.serious ?? report?.simpleTiers?.serious),
        activeCount: asCount(report?.tierBreakdown?.retail ?? report?.simpleTiers?.retail),
        healthGrade: (report?.stabilityGrade ?? report?.healthScore?.grade ?? 'N/A').toString(),
        healthScore: asCount(report?.stabilityScore ?? report?.healthScore?.score),
      };
      
      console.log(`[poster] Stats: ${stats.totalHolders} holders, grade ${stats.healthGrade}, post #${currentTimesPosted}`);
      
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
      
      // Build tweet using the active template from database
      const tweetText = processTemplate(tweetTemplate, stats);

      // Safety: if an operator emergency-stopped this queue item while we were processing,
      // do NOT post.
      const { data: latestItem, error: latestItemError } = await supabase
        .from('holders_intel_post_queue')
        .select('status')
        .eq('id', item.id)
        .maybeSingle();

      if (latestItemError) {
        console.warn(`[poster] Could not re-check queue status before posting: ${latestItemError.message}`);
      } else if (!latestItem || latestItem.status !== 'processing') {
        console.log(`[poster] Aborting post: queue item status is '${latestItem?.status ?? 'missing'}'`);

        return new Response(
          JSON.stringify({
            success: true,
            aborted: true,
            reason: 'Queue item was stopped before posting',
            symbol: item.symbol,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
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
      
      // Update seen tokens with incremented post count
      await supabase
        .from('holders_intel_seen_tokens')
        .update({
          was_posted: true,
          health_grade: stats.healthGrade,
          times_posted: stats.timesPosted,
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
