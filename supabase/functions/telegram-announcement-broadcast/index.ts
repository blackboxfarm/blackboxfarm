import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_RESET_TG_ID = "7045582884";
const RATE_LIMIT_MS = 75; // ~13 msgs/sec, well under Telegram's 30/sec limit

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
    const { testOnly, resendOfAnnouncementId, dryRun } = body;
    let { message } = body;
    let audiences: string[] = body.audiences
      ? body.audiences
      : body.audience
        ? [body.audience]
        : [];

    // ─── Resend mode: hydrate message + audiences from original log ───
    let alreadySentTgIds = new Set<string>();
    if (resendOfAnnouncementId) {
      const { data: original, error: origErr } = await supabase
        .from("telegram_announcement_log")
        .select("message_text, audiences")
        .eq("id", resendOfAnnouncementId)
        .single();

      if (origErr || !original) {
        return new Response(JSON.stringify({ error: "Original announcement not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      message = original.message_text;
      audiences = original.audiences || [];

      const { data: prevRecipients } = await supabase
        .from("telegram_announcement_recipients")
        .select("telegram_user_id")
        .eq("announcement_id", resendOfAnnouncementId)
        .eq("delivery_status", "sent");

      alreadySentTgIds = new Set((prevRecipients || []).map((r: any) => r.telegram_user_id));
    }

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

    // ─── Test-only: send to @system_reset ───
    if (testOnly) {
      const result = await sendTgMessage(botToken, SYSTEM_RESET_TG_ID, message);

      // Log the announcement
      const { data: logEntry, error: logErr } = await supabase
        .from("telegram_announcement_log")
        .insert({
          message_text: message,
          audiences: ["test_system_reset"],
          sent_count: result ? 1 : 0,
          failed_count: result ? 0 : 1,
        })
        .select("id")
        .single();

      if (logErr) {
        console.error("[announcement] Failed to log test send:", logErr);
      }

      // Log recipient
      if (logEntry?.id) {
        await supabase.from("telegram_announcement_recipients").insert({
          announcement_id: logEntry.id,
          telegram_user_id: SYSTEM_RESET_TG_ID,
          linked_user_id: null,
          delivery_status: result ? "sent" : "failed",
        });
      }

      return new Response(JSON.stringify({ sent: result ? 1 : 0, failed: result ? 0 : 1, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Build target list ───
    const { data: installations } = await supabase
      .from("channel_installations")
      .select("user_id")
      .eq("is_active", true);
    const hostedUserIds = new Set((installations || []).map((i: any) => i.user_id).filter(Boolean));

    const { data: interactions } = await supabase
      .from("telegram_bot_interactions")
      .select("telegram_user_id, linked_user_id, chat_type")
      .eq("chat_type", "private")
      .not("telegram_user_id", "is", null);

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

    let subscriberUserIds = new Set<string>();
    if (audiences.some(a => ["subscribers_only", "free_only", "all_registered"].includes(a))) {
      const { data: subs } = await supabase
        .from("stripe_customers")
        .select("user_id, subscription_status")
        .in("subscription_status", ["active", "trialing"]);
      subscriberUserIds = new Set((subs || []).map((s: any) => s.user_id).filter(Boolean));
    }

    // Collect targets with their linked user IDs
    const targetMap = new Map<string, string | null>(); // tgId -> linkedUserId
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
          targetMap.set(tgId, info.linkedUserId);
          break;
        }
      }
    }

    const targets = Array.from(targetMap.entries());
    console.log(`[announcement] Audiences: ${audiences.join(', ')}, targets: ${targets.length}`);

    // ─── Create announcement log entry first ───
    const { data: logEntry, error: logCreateErr } = await supabase
      .from("telegram_announcement_log")
      .insert({
        message_text: message,
        audiences,
        sent_count: 0,
        failed_count: 0,
      })
      .select("id")
      .single();

    if (logCreateErr) {
      console.error("[announcement] Failed to create log entry:", logCreateErr);
    }

    const announcementId = logEntry?.id;

    // ─── Send with rate limiting + per-recipient logging ───
    let sent = 0;
    let failed = 0;
    const recipientRows: any[] = [];

    for (const [tgId, linkedUserId] of targets) {
      try {
        const ok = await sendTgMessage(botToken, tgId, message);
        if (ok) {
          sent++;
          recipientRows.push({
            announcement_id: announcementId,
            telegram_user_id: tgId,
            linked_user_id: linkedUserId,
            delivery_status: "sent",
          });
        } else {
          failed++;
          recipientRows.push({
            announcement_id: announcementId,
            telegram_user_id: tgId,
            linked_user_id: linkedUserId,
            delivery_status: "failed",
          });
        }
      } catch {
        failed++;
        recipientRows.push({
          announcement_id: announcementId,
          telegram_user_id: tgId,
          linked_user_id: linkedUserId,
          delivery_status: "failed",
        });
      }
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }

    // Batch insert recipient logs
    if (announcementId && recipientRows.length > 0) {
      const { error: recipErr } = await supabase
        .from("telegram_announcement_recipients")
        .insert(recipientRows);
      if (recipErr) {
        console.warn("[announcement] Failed to log recipients:", recipErr);
      }
    }

    // Update announcement log with final counts
    if (announcementId) {
      await supabase
        .from("telegram_announcement_log")
        .update({ sent_count: sent, failed_count: failed })
        .eq("id", announcementId);
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
