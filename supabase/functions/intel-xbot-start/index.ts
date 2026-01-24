import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = "https://apxauapuusmgwbbzjgfl.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU";

// Cron job definitions (Toronto time: UTC-5, so 8am=13:00, 2pm=19:00, 6pm=23:00 UTC)
const CRON_JOBS = [
  {
    name: 'holdersintel-scheduler-8am',
    schedule: '0 13 * * *',
    function: 'holders-intel-scheduler'
  },
  {
    name: 'holdersintel-scheduler-2pm',
    schedule: '0 19 * * *',
    function: 'holders-intel-scheduler'
  },
  {
    name: 'holdersintel-scheduler-6pm',
    schedule: '0 23 * * *',
    function: 'holders-intel-scheduler'
  },
  {
    name: 'holdersintel-poster-3min',
    schedule: '*/3 * * * *',
    function: 'holders-intel-poster'
  }
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceKey);
    
    const results: { job: string; status: string; error?: string }[] = [];
    
    for (const job of CRON_JOBS) {
      try {
        // First try to unschedule if exists (to avoid duplicates)
        try {
          await supabase.rpc('unschedule_cron_job', { job_name: job.name });
        } catch {
          // Ignore if doesn't exist
        }
        
        // Schedule the cron job using the schedule_cron_job RPC
        const { error } = await supabase.rpc('schedule_cron_job', {
          job_name: job.name,
          job_schedule: job.schedule,
          job_command: `
            SELECT net.http_post(
              url:='${SUPABASE_URL}/functions/v1/${job.function}',
              headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${ANON_KEY}"}'::jsonb,
              body:='{}'::jsonb
            ) as request_id;
          `
        });
        
        if (error) {
          results.push({ job: job.name, status: 'failed', error: error.message });
        } else {
          results.push({ job: job.name, status: 'scheduled' });
        }
      } catch (e: any) {
        results.push({ job: job.name, status: 'error', error: e.message });
      }
    }
    
    const successCount = results.filter(r => r.status === 'scheduled').length;
    
    return new Response(
      JSON.stringify({ 
        success: successCount > 0, 
        message: `Intel XBot STARTED - ${successCount}/${CRON_JOBS.length} cron jobs scheduled`,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
