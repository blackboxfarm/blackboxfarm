import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if cron job already exists
    const { data: existing } = await supabaseAdmin.rpc('cron.job_cache_invalidate');
    
    // Create or update the cron job to run every minute
    const cronSQL = `
      SELECT cron.schedule(
        'arb-scanner-every-minute',
        '* * * * *',
        $$
        SELECT net.http_post(
          url:='${Deno.env.get('SUPABASE_URL')}/functions/v1/arb-opportunity-scanner',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}"}'::jsonb,
          body:='{}'::jsonb
        ) as request_id;
        $$
      );
    `;

    const { error: cronError } = await supabaseAdmin.rpc('exec_sql', { 
      sql: cronSQL 
    });

    if (cronError) {
      // If job already exists, unschedule and reschedule
      await supabaseAdmin.rpc('exec_sql', {
        sql: "SELECT cron.unschedule('arb-scanner-every-minute');"
      });
      
      const { error: retryError } = await supabaseAdmin.rpc('exec_sql', { 
        sql: cronSQL 
      });
      
      if (retryError) throw retryError;
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Cron job set up successfully. Scanner will run every minute.',
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error setting up cron:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Failed to set up automated scanning. You may need to set this up manually in SQL Editor.'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
