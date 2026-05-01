import { createClient } from "npm:@supabase/supabase-js@2";
import { assertInsert, assertUpdate } from "../_shared/db-assert.ts";

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
    let imageUrl: string | null = body.image_url || body.imageUrl || null;
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
        .select("message_text, audiences, image_url")
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
      // If the resend doesn't override the image, reuse the original announcement's image
      if (!imageUrl && (original as any).image_url) imageUrl = (original as any).image_url;

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
      const result = await sendTgMessage(botToken, SYSTEM_RESET_TG_ID, message, imageUrl);

      // Log the announcement
      const logEntry = await assertInsert(supabase
        .from("telegram_announcement_log")
        .insert({
          message_text: message,
          audiences: ["test_system_reset"],
          sent_count: result ? 1 : 0,
          failed_count: result ? 0 : 1,
          image_url: imageUrl,
        })
        .select("id")
        .single(), "telegram_announcement_log");

      // Log recipient
      if (logEntry?.id) {
        await assertInsert(supabase.from("telegram_announcement_recipients").insert({
          announcement_id: logEntry.id,
          telegram_user_id: SYSTEM_RESET_TG_ID,
          linked_user_id: null,
          delivery_status: result ? "sent" : "failed",
        }), "telegram_announcement_recipients");
      }

      return new Response(JSON.stringify({ sent: result ? 1 : 0, failed: result ? 0 : 1, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Build target list from the DB helper so counts/sends use the same source ───
    const { data: recipientRows, error: recipientErr } = await supabase.rpc(
      "get_telegram_announcement_recipients",
      { p_audiences: audiences }
    );
    if (recipientErr) throw recipientErr;

    let targets = ((recipientRows || []) as { telegram_user_id: string; linked_user_id: string | null }[])
      .map((r) => [r.telegram_user_id, r.linked_user_id] as [string, string | null]);
    if (resendOfAnnouncementId && alreadySentTgIds.size > 0) {
      const before = targets.length;
      targets = targets.filter(([tgId]) => !alreadySentTgIds.has(tgId));
      console.log(`[announcement] Resend filter: ${before} eligible -> ${targets.length} new (${alreadySentTgIds.size} already received)`);
    }
    console.log(`[announcement] Audiences: ${audiences.join(', ')}, targets: ${targets.length}`);

    // ─── Dry run: return count without sending ───
    if (dryRun) {
      return new Response(
        JSON.stringify({ newRecipients: targets.length, alreadyReceived: alreadySentTgIds.size }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Create announcement log entry first ───
    const { data: logEntry, error: logCreateErr } = await supabase
      .from("telegram_announcement_log")
      .insert({
        message_text: message,
        audiences,
        sent_count: 0,
        failed_count: 0,
        resend_of_id: resendOfAnnouncementId || null,
        image_url: imageUrl,
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
        const ok = await sendTgMessage(botToken, tgId, message, imageUrl);
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

async function sendTgMessage(botToken: string, chatId: string, text: string, imageUrl?: string | null): Promise<boolean> {
  try {
    // If an image is attached, use sendPhoto with caption (caption max 1024 chars).
    // If text is too long for a caption, send the photo with no caption then send the text as a follow-up message.
    if (imageUrl) {
      const CAPTION_MAX = 1024;
      const useCaption = text.length <= CAPTION_MAX;
      const photoBody: Record<string, unknown> = {
        chat_id: chatId,
        photo: imageUrl,
      };
      if (useCaption) {
        photoBody.caption = text;
        photoBody.parse_mode = "Markdown";
      }
      const photoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(photoBody),
      });
      if (!photoRes.ok) {
        // Markdown failure or photo fetch failure → retry without parse_mode
        const retry = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            photo: imageUrl,
            caption: useCaption ? text : undefined,
          }),
        });
        if (!retry.ok) return false;
      }
      // Caption couldn't fit — send the body as a follow-up message
      if (!useCaption) {
        const followUp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
        });
        if (!followUp.ok) {
          // retry without markdown
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text }),
          });
        }
      }
      return true;
    }

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
