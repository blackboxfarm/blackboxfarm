import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_RESET_TG_ID = "7045582884";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { message, audience, testOnly } = await req.json();

    if (!message || !audience) {
      return new Response(JSON.stringify({ error: "message and audience required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botToken = Deno.env.get("TELEGRAM_HOLDERSINTEL_BOT_TOKEN");
    if (!botToken) {
      return new Response(JSON.stringify({ error: "Bot token not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If testOnly, just send to @system_reset
    if (testOnly) {
      const result = await sendTgMessage(botToken, SYSTEM_RESET_TG_ID, message);
      return new Response(JSON.stringify({ sent: result ? 1 : 0, failed: result ? 0 : 1, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all hosted admin telegram IDs (users who installed bot in groups/channels)
    const { data: installations } = await supabase
      .from("channel_installations")
      .select("user_id")
      .eq("is_active", true);

    const hostedUserIds = new Set((installations || []).map((i: any) => i.user_id).filter(Boolean));

    // Get all unique registered DM users (chat_type = 'private')
    const { data: interactions } = await supabase
      .from("telegram_bot_interactions")
      .select("telegram_user_id, linked_user_id, chat_type")
      .eq("chat_type", "private")
      .not("telegram_user_id", "is", null);

    // Deduplicate by telegram_user_id
    const userMap = new Map<string, { tgId: string; linkedUserId: string | null }>();
    for (const row of interactions || []) {
      if (!userMap.has(row.telegram_user_id)) {
        userMap.set(row.telegram_user_id, {
          tgId: row.telegram_user_id,
          linkedUserId: row.linked_user_id,
        });
      }
    }

    // Filter based on audience
    const targets: string[] = [];
    for (const [tgId, info] of userMap) {
      const isHostedAdmin = info.linkedUserId && hostedUserIds.has(info.linkedUserId);

      if (audience === "accounts" && !isHostedAdmin) {
        targets.push(tgId);
      } else if (audience === "hosted" && isHostedAdmin) {
        targets.push(tgId);
      }
    }

    console.log(`[announcement] Audience: ${audience}, targets: ${targets.length}`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    // Rate limit: 1 message per 50ms (20/sec, well under TG's 30/sec limit)
    for (const tgId of targets) {
      // Skip sending to ourselves in bulk
      if (tgId === SYSTEM_RESET_TG_ID && targets.length > 1) {
        // Still send to system_reset, just at the end
      }

      try {
        const ok = await sendTgMessage(botToken, tgId, message);
        if (ok) sent++;
        else failed++;
      } catch {
        failed++;
      }

      // Rate limit delay
      await new Promise((r) => setTimeout(r, 50));
    }

    return new Response(
      JSON.stringify({ sent, failed, skipped, totalTargets: targets.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[announcement] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function sendTgMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      // Fallback to plain text if Markdown fails
      const retry = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      return retry.ok;
    }

    return true;
  } catch {
    return false;
  }
}
