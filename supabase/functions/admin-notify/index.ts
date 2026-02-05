// Admin notification service - broadcasts to Telegram groups from database (inlined v2)
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.54.0";
import { Resend } from "npm:resend@2.0.0";

// Inlined broadcast function to avoid import issues
async function broadcastToBlackBox(supabase: SupabaseClient, message: string) {
  const { data: targets, error } = await supabase
    .from("telegram_message_targets")
    .select("id, chat_id, label, resolved_name")
    .eq("label", "BLACKBOX");

  if (error || !targets?.length) {
    console.log("[admin-notify] No BLACKBOX targets found:", error);
    return [];
  }

  const results = [];
  for (const target of targets) {
    try {
      const { data, error: sendError } = await supabase.functions.invoke("telegram-mtproto-auth", {
        body: { action: "send_message", chatId: Number(target.chat_id), message },
      });
      
      if (sendError || !data?.success) {
        results.push({ target, success: false, error: sendError?.message || data?.error });
      } else {
        await supabase.from("telegram_message_targets").update({ last_used_at: new Date().toISOString() }).eq("id", target.id);
        results.push({ target, success: true });
      }
    } catch (e) {
      results.push({ target, success: false, error: e instanceof Error ? e.message : "Unknown" });
    }
  }
  return results;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "admin@blackbox.farm";

interface NotifyRequest {
  type: "banner_purchase" | "new_signup" | "payment_confirmed";
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  channels?: ("email" | "telegram" | "database")[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: NotifyRequest = await req.json();
    const { type, title, message, metadata = {}, channels = ["email", "telegram", "database"] } = body;

    console.log(`[admin-notify] Processing ${type} notification: ${title}`);

    const results: { channel: string; success: boolean; error?: string }[] = [];

    // 1. Store in database for badge system
    if (channels.includes("database")) {
      try {
        const { error } = await supabase.from("admin_notifications").insert({
          notification_type: type,
          title,
          message,
          metadata,
        });
        
        if (error) throw error;
        results.push({ channel: "database", success: true });
        console.log("[admin-notify] ✓ Database notification created");
      } catch (e) {
        console.error("[admin-notify] Database error:", e);
        results.push({ channel: "database", success: false, error: e instanceof Error ? e.message : "Unknown error" });
      }
    }

    // 2. Send email via Resend
    if (channels.includes("email") && resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 20px; border-radius: 10px;">
              <h1 style="color: #00ff88; margin: 0 0 10px 0;">🔔 ${title}</h1>
              <p style="color: #ffffff; font-size: 16px; line-height: 1.6;">${message}</p>
              ${metadata && Object.keys(metadata).length > 0 ? `
                <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-top: 15px;">
                  <h3 style="color: #00ff88; margin: 0 0 10px 0;">Details:</h3>
                  <pre style="color: #ffffff; font-size: 12px; white-space: pre-wrap;">${JSON.stringify(metadata, null, 2)}</pre>
                </div>
              ` : ''}
              <p style="color: #888; font-size: 12px; margin-top: 20px;">
                BlackBox Farm Admin Notification • ${new Date().toISOString()}
              </p>
            </div>
          </div>
        `;

        const { error } = await resend.emails.send({
          from: "BlackBox Admin <noreply@blackbox.farm>",
          to: [ADMIN_EMAIL],
          subject: `🔔 ${title}`,
          html: emailHtml,
        });

        if (error) throw error;
        results.push({ channel: "email", success: true });
        console.log("[admin-notify] ✓ Email sent to", ADMIN_EMAIL);
      } catch (e) {
        console.error("[admin-notify] Email error:", e);
        results.push({ channel: "email", success: false, error: e instanceof Error ? e.message : "Unknown error" });
      }
    }

    // 3. Send Telegram notification to BlackBox group (from database)
    if (channels.includes("telegram")) {
      // Check if broadcasts are suspended
      let isSuspended = false;
      try {
        const { data: settingData } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "telegram_broadcast_suspended")
          .maybeSingle();
        isSuspended = settingData?.value === true;
      } catch (checkErr) {
        console.warn("[admin-notify] Could not check suspension status, proceeding");
      }

      if (isSuspended) {
        console.log("[admin-notify] Telegram broadcasts are suspended, skipping");
        results.push({ channel: "telegram", success: false, error: "Broadcasts suspended" });
      } else {
        try {
        // Format Telegram message
        let tgMessage = `🔔 *${title}*\n\n`;
        tgMessage += `${message}\n`;
        
        if (metadata && Object.keys(metadata).length > 0) {
          tgMessage += `\n📋 *Details:*\n`;
          for (const [key, value] of Object.entries(metadata)) {
            const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            tgMessage += `├ ${formattedKey}: \`${value}\`\n`;
          }
        }
        
        tgMessage += `\n⏰ ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC`;

        // Broadcast to BLACKBOX group(s) from database
        const broadcastResults = await broadcastToBlackBox(supabase, tgMessage);
        const successCount = broadcastResults.filter(r => r.success).length;
        
        if (successCount > 0) {
          results.push({ channel: "telegram", success: true });
          console.log(`[admin-notify] ✓ Telegram sent to ${successCount} BLACKBOX target(s)`);
        } else {
          throw new Error("No targets received the message");
        }
        } catch (e) {
          console.error("[admin-notify] Telegram error:", e);
          results.push({ channel: "telegram", success: false, error: e instanceof Error ? e.message : "Unknown error" });
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`[admin-notify] Completed: ${successCount}/${results.length} channels succeeded`);

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        sent: successCount,
        total: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[admin-notify] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
