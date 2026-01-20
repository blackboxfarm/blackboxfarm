import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSolPriceWithLogging } from "../_shared/sol-price-fetcher.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const result = await getSolPriceWithLogging();
    
    // Round up to nearest penny
    const solPrice = Math.ceil(result.price * 100) / 100;
    
    console.log(`[sol-price] ✓ $${solPrice} from ${result.source}`);
    
    // Log any failed attempts for visibility
    const failures = result.attempts.filter(a => !a.success);
    if (failures.length > 0) {
      console.log(`[sol-price] Had ${failures.length} failed attempts before success:`);
      failures.forEach(f => console.log(`  - ${f.source}: ${f.errorType} (${f.responseTimeMs}ms)`));
    }
    
    return new Response(
      JSON.stringify({ 
        price: solPrice,
        timestamp: new Date().toISOString(),
        source: result.source,
        attempts: result.attempts.length,
        failedAttempts: failures.length,
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
    
  } catch (error) {
    console.error('[sol-price] CRITICAL: All sources failed!', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Could not fetch SOL price from any source',
        message: error instanceof Error ? error.message : String(error),
        price: null,
        timestamp: new Date().toISOString(),
        source: 'error'
      }),
      { 
        status: 503, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
