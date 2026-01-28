import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This function is called by a database webhook on new user signup
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { record, type } = await req.json();
    
    // Only process INSERT events (new signups)
    if (type !== 'INSERT' || !record) {
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { id: userId, email, created_at } = record;

    console.log(`[signup-notify] New user signup: ${email}`);

    // Call admin-notify to send email + telegram + database notification
    const { data, error } = await supabase.functions.invoke('admin-notify', {
      body: {
        type: 'new_signup',
        title: 'New User Signup',
        message: `A new user has registered!\n\n📧 Email: ${email}\n🆔 User ID: ${userId?.slice(0, 8)}...`,
        metadata: {
          user_id: userId,
          email,
          created_at,
        },
        channels: ['email', 'telegram', 'database'],
      },
    });

    if (error) {
      console.error('[signup-notify] Error calling admin-notify:', error);
    } else {
      console.log('[signup-notify] Notification sent successfully');
    }

    return new Response(
      JSON.stringify({ success: true, notified: !error }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[signup-notify] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
