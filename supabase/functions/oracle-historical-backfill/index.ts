import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BackfillResult {
  targetDate: string;
  status: string;
  tokensFound: number;
  tokensScanned: number;
  newDevsDiscovered: number;
  error?: string;
}

function formatDateForWayback(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

async function fetchWaybackSnapshot(targetDate: Date): Promise<string | null> {
  const dateStr = formatDateForWayback(targetDate);
  const waybackApiUrl = `https://archive.org/wayback/available?url=dexscreener.com/solana&timestamp=${dateStr}`;
  
  try {
    const response = await fetch(waybackApiUrl, {
      headers: { 'User-Agent': 'OracleBackfill/1.0' }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.archived_snapshots?.closest?.url) {
      // Fetch the actual snapshot
      const snapshotUrl = data.archived_snapshots.closest.url;
      const snapshotResponse = await fetch(snapshotUrl);
      
      if (snapshotResponse.ok) {
        return await snapshotResponse.text();
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[Backfill] Wayback fetch error:`, error);
    return null;
  }
}

function extractTokensFromHtml(html: string): string[] {
  const tokens: string[] = [];
  
  // Look for Solana token addresses (32-44 char base58 strings)
  // Common patterns in DexScreener HTML
  const patterns = [
    /\/solana\/([1-9A-HJ-NP-Za-km-z]{32,44})/g,
    /token['":\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/gi,
    /mint['":\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/gi
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      if (match[1] && !tokens.includes(match[1])) {
        tokens.push(match[1]);
      }
    }
  }
  
  return tokens.slice(0, 100); // Limit to 100 tokens per day
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { maxDaysPerRun = 1, startFromDate } = await req.json();
    
    const results: BackfillResult[] = [];

    // Get next pending backfill job, or create one
    let { data: pendingJob } = await supabase
      .from('oracle_backfill_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('target_date', { ascending: false })
      .limit(1)
      .single();

    if (!pendingJob) {
      // Find the most recent completed job to determine next date
      const { data: lastCompleted } = await supabase
        .from('oracle_backfill_jobs')
        .select('target_date')
        .in('status', ['complete', 'no_archive', 'failed'])
        .order('target_date', { ascending: false })
        .limit(1)
        .single();

      // Calculate next date to process
      let nextDate: Date;
      if (startFromDate) {
        nextDate = new Date(startFromDate);
      } else if (lastCompleted) {
        nextDate = new Date(lastCompleted.target_date);
        nextDate.setDate(nextDate.getDate() - 1); // Go back one day
      } else {
        // Start from yesterday
        nextDate = new Date();
        nextDate.setDate(nextDate.getDate() - 1);
      }

      // Don't go back more than 365 days
      const minDate = new Date();
      minDate.setDate(minDate.getDate() - 365);
      
      if (nextDate < minDate) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Backfill complete - reached 365 day limit',
            results: []
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Create new job
      const { data: newJob, error: insertError } = await supabase
        .from('oracle_backfill_jobs')
        .insert({
          target_date: nextDate.toISOString().split('T')[0],
          status: 'pending'
        })
        .select()
        .single();

      if (insertError) {
        console.error('[Backfill] Error creating job:', insertError);
        throw insertError;
      }

      pendingJob = newJob;
    }

    // Process the pending job
    const targetDate = new Date(pendingJob.target_date);
    console.log(`[Backfill] Processing date: ${pendingJob.target_date}`);

    // Mark as processing
    await supabase
      .from('oracle_backfill_jobs')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', pendingJob.id);

    let result: BackfillResult = {
      targetDate: pendingJob.target_date,
      status: 'processing',
      tokensFound: 0,
      tokensScanned: 0,
      newDevsDiscovered: 0
    };

    try {
      // Try Wayback Machine
      const snapshot = await fetchWaybackSnapshot(targetDate);
      
      if (!snapshot) {
        // No archive available for this date
        result.status = 'no_archive';
        await supabase
          .from('oracle_backfill_jobs')
          .update({
            status: 'no_archive',
            completed_at: new Date().toISOString()
          })
          .eq('id', pendingJob.id);
        
        results.push(result);
        console.log(`[Backfill] No archive for ${pendingJob.target_date}`);
      } else {
        // Extract tokens from snapshot
        const tokens = extractTokensFromHtml(snapshot);
        result.tokensFound = tokens.length;
        console.log(`[Backfill] Found ${tokens.length} tokens for ${pendingJob.target_date}`);

        // Process each token
        for (const tokenMint of tokens) {
          try {
            // Check if already in token_lifecycle
            const { data: existing } = await supabase
              .from('token_lifecycle')
              .select('id, oracle_analyzed')
              .eq('token_mint', tokenMint)
              .single();

            if (!existing) {
              // New token - add to lifecycle
              await supabase
                .from('token_lifecycle')
                .insert({
                  token_mint: tokenMint,
                  first_seen: targetDate.toISOString(),
                  discovery_source: 'backfill'
                });

              // Try to link creator
              try {
                await supabase.functions.invoke('token-creator-linker', {
                  body: { tokenMints: [tokenMint] }
                });
                result.newDevsDiscovered++;
              } catch (e) {
                console.log(`[Backfill] Creator linker failed for ${tokenMint}`);
              }
            }

            // Run auto-classifier if not analyzed
            if (!existing?.oracle_analyzed) {
              try {
                await supabase.functions.invoke('oracle-auto-classifier', {
                  body: { tokenMint }
                });
              } catch (e) {
                console.log(`[Backfill] Classifier failed for ${tokenMint}`);
              }
            }

            result.tokensScanned++;

            // Rate limiting - 200ms delay
            await new Promise(resolve => setTimeout(resolve, 200));

          } catch (tokenError) {
            console.error(`[Backfill] Error processing token ${tokenMint}:`, tokenError);
          }
        }

        // Mark job complete
        result.status = 'complete';
        await supabase
          .from('oracle_backfill_jobs')
          .update({
            status: 'complete',
            tokens_found: result.tokensFound,
            tokens_scanned: result.tokensScanned,
            new_devs_discovered: result.newDevsDiscovered,
            completed_at: new Date().toISOString()
          })
          .eq('id', pendingJob.id);

        results.push(result);
      }

    } catch (processError: any) {
      result.status = 'failed';
      result.error = processError.message;
      
      await supabase
        .from('oracle_backfill_jobs')
        .update({
          status: 'failed',
          error_message: processError.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', pendingJob.id);

      results.push(result);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} backfill job(s)`,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[Backfill] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
