import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Action = "status" | "repair_webhook";

interface TelegramApiResponse {
  ok: boolean;
  result?: any;
  description?: string;
  error_code?: number;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callTelegram(botToken: string, method: string, body?: Record<string, unknown>): Promise<TelegramApiResponse> {
  const endpoint = `https://api.telegram.org/bot${botToken}/${method}`;
  const response = await fetch(endpoint, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload: TelegramApiResponse;
  try {
    payload = await response.json();
  } catch {
    payload = { ok: false, description: `Invalid JSON response from Telegram (${response.status})` };
  }

  if (!response.ok && payload.ok !== false) {
    return {
      ok: false,
      description: `Telegram HTTP ${response.status}`,
      error_code: response.status,
    };
  }

  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: "Server misconfiguration: missing Supabase environment variables" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const { data: isSuperAdmin, error: superAdminError } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    if (superAdminError || !isSuperAdmin) {
      return json({ success: false, error: "Super admin access required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = (body.action as Action) || "status";

    const botToken = Deno.env.get("TELEGRAM_HOLDERSINTEL_BOT_TOKEN");
    const expectedWebhookUrl = `${supabaseUrl}/functions/v1/holdersintel-bot-webhook`;

    if (!botToken) {
      return json({
        success: true,
        action,
        status: "critical",
        tokenConfigured: false,
        expectedWebhookUrl,
        issues: ["Missing TELEGRAM_HOLDERSINTEL_BOT_TOKEN secret"],
      });
    }

    if (action === "repair_webhook") {
      const setWebhook = await callTelegram(botToken, "setWebhook", {
        url: expectedWebhookUrl,
        drop_pending_updates: true,
        allowed_updates: ["message", "my_chat_member"],
      });

      if (!setWebhook.ok) {
        return json({
          success: false,
          action,
          status: "critical",
          expectedWebhookUrl,
          telegramError: setWebhook.description || "setWebhook failed",
          telegramCode: setWebhook.error_code || null,
        }, 500);
      }
    }

    const [meInfo, webhookInfo] = await Promise.all([
      callTelegram(botToken, "getMe"),
      callTelegram(botToken, "getWebhookInfo"),
    ]);

    const issues: string[] = [];

    if (!meInfo.ok) {
      issues.push(`Bot token check failed: ${meInfo.description || "unknown error"}`);
    }

    if (!webhookInfo.ok) {
      issues.push(`Webhook check failed: ${webhookInfo.description || "unknown error"}`);
    }

    const webhook = webhookInfo.result || {};
    const actualWebhookUrl = typeof webhook.url === "string" ? webhook.url : null;
    const webhookMatchesExpected = actualWebhookUrl === expectedWebhookUrl;

    if (webhookInfo.ok && !webhookMatchesExpected) {
      issues.push("Webhook URL does not match holdersintel-bot-webhook endpoint");
    }

    const pendingUpdateCount = Number(webhook.pending_update_count || 0);
    if (pendingUpdateCount > 0) {
      issues.push(`Telegram has ${pendingUpdateCount} pending updates`);
    }

    if (webhook.last_error_message) {
      issues.push(`Telegram last error: ${webhook.last_error_message}`);
    }

    const status = issues.length === 0 ? "healthy" : (issues.some(issue => issue.toLowerCase().includes("failed") || issue.toLowerCase().includes("missing")) ? "critical" : "warning");

    return json({
      success: true,
      action,
      status,
      tokenConfigured: true,
      expectedWebhookUrl,
      webhook: {
        actualUrl: actualWebhookUrl,
        matchesExpected: webhookMatchesExpected,
        hasCustomCertificate: webhook.has_custom_certificate ?? false,
        pendingUpdateCount,
        lastErrorDate: webhook.last_error_date ? new Date(webhook.last_error_date * 1000).toISOString() : null,
        lastErrorMessage: webhook.last_error_message || null,
        maxConnections: webhook.max_connections ?? null,
        ipAddress: webhook.ip_address || null,
      },
      bot: {
        ok: meInfo.ok,
        id: meInfo.result?.id ?? null,
        username: meInfo.result?.username ?? null,
        firstName: meInfo.result?.first_name ?? null,
      },
      issues,
      recommendation:
        status === "healthy"
          ? "No action needed"
          : "Use repair_webhook action to reset webhook and clear stale pending updates",
    });
  } catch (error: any) {
    console.error("[telegram-bot-health] error:", error);
    return json({ success: false, error: error?.message || "Unexpected error" }, 500);
  }
});
