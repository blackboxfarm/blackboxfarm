import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { table, column, days } = await req.json();

    if (!table || !column || !days) {
      return new Response(JSON.stringify({ error: 'table, column, days required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - days * 24 * 3600_000).toISOString();

    const { data: deletedCount, error } = await supabase.rpc('bulk_prune_table', {
      p_table: table,
      p_column: column,
      p_cutoff: cutoff,
    });

    if (error) throw error;

    return new Response(JSON.stringify({
      table,
      column,
      retentionDays: days,
      cutoff,
      rowsDeleted: deletedCount,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
