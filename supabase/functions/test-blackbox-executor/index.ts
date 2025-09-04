import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🧪 TESTING BLACKBOX EXECUTOR");
    
    // Test with a real command code ID
    const testCommandId = "1f37c635-a4c0-4ef4-90d4-b838a87161d2";
    
    console.log(`📞 Calling blackbox-executor with command ID: ${testCommandId}`);
    
    const response = await fetch(
      'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/blackbox-executor',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU'
        },
        body: JSON.stringify({
          command_code_id: testCommandId,
          action: 'buy'
        })
      }
    );
    
    const responseText = await response.text();
    console.log(`🔥 Response status: ${response.status}`);
    console.log(`🔥 Response body: ${responseText}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        status: response.status,
        response: responseText,
        message: "Test completed - check function logs for details"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("❌ Test error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});