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

    const body = await req.json();
    const { message, testOnly } = body;
    // Support both single `audience` (string) and multi `audiences` (string[])
    const audiences: string[] = body.audiences
      ? body.audiences
      : body.audience
        ? [body.audience]
        : [];

    if (!message || (!testOnly && audiences.length === 0)) {
      return new Response(JSON.stringify({ error: "message and audiences required" }), {
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
      // Log test send
      await supabase.from("telegram_announcement_log").insert({
        message_text: message,
        audiences,
        sent_count: result ? 1 : 0,
        failed_count: result ? 0 : 1,
      });
      return new Response(JSON.stringify({ sent: result ? 1 : 0, failed: result ? 0 : 1, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all hosted admin telegram IDs
    const { data: installations } = await supabase
      .from("channel_installations")
      .select("user_id")
      .eq("is_active", true);
    const hostedUserIds = new Set((installations || []).map((i: any) => i.user_id).filter(Boolean));

    // Get all unique DM users (chat_type = 'private')
    const { data: interactions } = await supabase
      .from("telegram_bot_interactions")
      .select("telegram_user_id, linked_user_id, chat_type")
      .eq("chat_type", "private")
      .not("telegram_user_id", "is", null);

    // Deduplicate by telegram_user_id
    const userMap = new Map<string, { tgId: string; linkedUserId: string | null }>();
    for (const row of interactions || []) {
      const existing = userMap.get(row.telegram_user_id);
      if (!existing) {
        userMap.set(row.telegram_user_id, {
          tgId: row.telegram_user_id,
          linkedUserId: row.linked_user_id,
        });
      } else if (row.linked_user_id && !existing.linkedUserId) {
        existing.linkedUserId = row.linked_user_id;
      }
    }

    // Get subscriber info if needed
    let subscriberUserIds = new Set<string>();
    if (audiences.some(a => ["subscribers_only", "free_only", "all_registered"].includes(a))) {
      const { data: subs } = await supabase
        .from("stripe_customers")
        .select("user_id, subscription_status")
        .in("subscription_status", ["active", "trialing"]);
      subscriberUserIds = new Set((subs || []).map((s: any) => s.user_id).filter(Boolean));
    }

    // Collect all targets across all audiences (deduplicated)
    const targetSet = new Set<string>();
    for (const [tgId, info] of userMap) {
      const isHostedAdmin = info.linkedUserId && hostedUserIds.has(info.linkedUserId);
      const isRegistered = !!info.linkedUserId;
      const isSubscriber = info.linkedUserId ? subscriberUserIds.has(info.linkedUserId) : false;

      for (const audience of audiences) {
        let match = false;
        switch (audience) {
          case "hosted":
            if (isHostedAdmin) match = true;
            break;
          case "accounts":
          case "all_registered":
            if (isRegistered && !isHostedAdmin) match = true;
            break;
          case "subscribers_only":
            if (isRegistered && isSubscriber && !isHostedAdmin) match = true;
            break;
          case "free_only":
            if (isRegistered && !isSubscriber && !isHostedAdmin) match = true;
            break;
          case "unregistered":
            if (!isRegistered && !isHostedAdmin) match = true;
            break;
        }
        if (match) {
          targetSet.add(tgId);
          break; // no need to check other audiences for same user
        }
      }
    }

    const targets = Array.from(targetSet);
    console.log(`[announcement] Audiences: ${audiences.join(', ')}, targets: ${targets.length}`);

    let sent = 0;
    let failed = 0;

    // Rate limit: 1 message per 50ms (20/sec)
    for (const tgId of targets) {
      try {
        const ok = await sendTgMessage(botToken, tgId, message);
        if (ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    // Log to announcement history
    try {
      await supabase.from("telegram_announcement_log").insert({
        message_text: message,
        audiences,
        sent_count: sent,
        failed_count: failed,
      });
    } catch (logErr) {
      console.warn("[announcement] Failed to log broadcast:", logErr);
    }

    return new Response(
      JSON.stringify({ sent, failed, skipped: 0, totalTargets: targets.length }),
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
