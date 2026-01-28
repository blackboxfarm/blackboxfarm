import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = "https://apxauapuusmgwbbzjgfl.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU";

const TWITTER_SCANNER_JOB = {
  name: 'twitter-scanner-16min',
  schedule: '*/16 * * * *',
  function: 'twitter-token-mention-scanner'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceKey);
    
    const { action } = await req.json();
    
    if (action === 'start') {
      // First try to unschedule if exists (to avoid duplicates)
      try {
        await supabase.rpc('unschedule_cron_job', { job_name: TWITTER_SCANNER_JOB.name });
      } catch {
        // Ignore if doesn't exist
      }
      
      // Also unschedule the old 10-min job if it exists
      try {
        await supabase.rpc('unschedule_cron_job', { job_name: 'holdersintel-twitter-scanner-10min' });
      } catch {
        // Ignore if doesn't exist
      }
      
      // Schedule the 16-minute cron job
      const { error } = await supabase.rpc('schedule_cron_job', {
        job_name: TWITTER_SCANNER_JOB.name,
        job_schedule: TWITTER_SCANNER_JOB.schedule,
        job_command: `
          SELECT net.http_post(
            url:='${SUPABASE_URL}/functions/v1/${TWITTER_SCANNER_JOB.function}',
            headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${ANON_KEY}"}'::jsonb,
            body:='{}'::jsonb
          ) as request_id;
        `
      });
      
      if (error) {
        throw error;
      }
      
      console.log('✅ Twitter scanner cron job scheduled (every 16 min)');
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Twitter Scanner STARTED',
          schedule: TWITTER_SCANNER_JOB.schedule
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
      
    } else if (action === 'stop') {
      // Unschedule the Twitter scanner cron job
      try {
        await supabase.rpc('unschedule_cron_job', { job_name: TWITTER_SCANNER_JOB.name });
      } catch {
        // Ignore if doesn't exist
      }
      
      // Also stop the old 10-min job if running
      try {
        await supabase.rpc('unschedule_cron_job', { job_name: 'holdersintel-twitter-scanner-10min' });
      } catch {
        // Ignore if doesn't exist
      }
      
      console.log('⏹️ Twitter scanner cron job stopped');
      
      return new Response(
        JSON.stringify({ success: true, message: 'Twitter Scanner STOPPED' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
      
    } else if (action === 'status') {
      // Get current cron job status
      const { data, error } = await supabase.rpc('get_cron_job_status');
      
      if (error) {
        throw error;
      }
      
      const twitterJob = (data as Array<{ jobname: string; schedule: string; active: boolean }>)?.find(
        job => job.jobname === TWITTER_SCANNER_JOB.name || job.jobname === 'holdersintel-twitter-scanner-10min'
      );
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          active: twitterJob?.active ?? false,
          schedule: twitterJob?.schedule ?? null,
          jobname: twitterJob?.jobname ?? null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
      
    } else {
      throw new Error('Invalid action. Use "start", "stop", or "status".');
    }
    
  } catch (error: any) {
    console.error('Twitter scanner control error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
