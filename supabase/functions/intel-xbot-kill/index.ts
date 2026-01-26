import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceKey);
    
    // Kill all cron jobs
    const jobs = [
      'holdersintel-poster-3min',
      'holdersintel-scheduler-2am',
      'holdersintel-scheduler-8am',
      'holdersintel-scheduler-2pm',
      'holdersintel-scheduler-6pm'
    ];
    
    const results: string[] = [];
    
    for (const job of jobs) {
      try {
        await supabase.rpc('unschedule_cron_job', { job_name: job });
        results.push(`${job}: stopped`);
      } catch (e: any) {
        // Try direct SQL via postgres function
        results.push(`${job}: ${e.message}`);
      }
    }
    
    // Also mark all pending items as cancelled
    const { data, error } = await supabase
      .from('holders_intel_post_queue')
      .update({ status: 'cancelled', error_message: 'Emergency stop' })
      .eq('status', 'pending');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Intel XBot KILLED - all pending posts cancelled',
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
