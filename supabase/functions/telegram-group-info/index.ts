import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

interface GroupInfo {
  chat_id: string;
  chat_title: string;
  chat_type: string;
  username: string | null;
  description: string | null;
  member_count: number | null;
  invite_link: string | null;
  is_active: boolean;
  is_paid: boolean;
  kicked: boolean;
  installed_at: string;
  // Stats from interactions
  total_interactions: number;
  unique_users: number;
  unique_tokens: number;
  top_commands: Record<string, number>;
  first_seen: string;
  last_seen: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get all installations
    const { data: installations, error: instErr } = await supabase
      .from("channel_installations")
      .select("chat_id, chat_title, chat_type, is_active, is_paid, kicked, installed_at")
      .order("installed_at", { ascending: false });

    if (instErr) throw instErr;
    if (!installations || installations.length === 0) {
      return new Response(JSON.stringify({ groups: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch interaction stats in bulk
    const chatIds = installations.map((i) => String(i.chat_id));
    const { data: interactions } = await supabase
      .from("telegram_bot_interactions")
      .select("chat_id, chat_type, chat_title, telegram_username, token_mint, command, created_at")
      .in("chat_type", ["group", "supergroup"])
      .order("created_at", { ascending: false })
      .limit(5000);

    // Build interaction stats per group
    const interactionMap = new Map<string, {
      total: number;
      users: Set<string>;
      tokens: Set<string>;
      commands: Record<string, number>;
      first: string;
      last: string;
    }>();

    if (interactions) {
      for (const row of interactions) {
        const key = String(row.chat_id);
        if (!interactionMap.has(key)) {
          interactionMap.set(key, {
            total: 0,
            users: new Set(),
            tokens: new Set(),
            commands: {},
            first: row.created_at,
            last: row.created_at,
          });
        }
        const s = interactionMap.get(key)!;
        s.total++;
        if (row.telegram_username) s.users.add(row.telegram_username);
        if (row.token_mint) s.tokens.add(row.token_mint);
        if (row.command) s.commands[row.command] = (s.commands[row.command] || 0) + 1;
        if (row.created_at < s.first) s.first = row.created_at;
        if (row.created_at > s.last) s.last = row.created_at;
      }
    }

    // 3. Query Telegram API for live info on each group (parallel, with timeout)
    const groups: GroupInfo[] = [];

    const fetchGroupInfo = async (inst: typeof installations[0]): Promise<GroupInfo> => {
      const chatId = String(inst.chat_id);
      const stats = interactionMap.get(chatId);

      const base: GroupInfo = {
        chat_id: chatId,
        chat_title: inst.chat_title || `Group ${chatId}`,
        chat_type: inst.chat_type || "supergroup",
        username: null,
        description: null,
        member_count: null,
        invite_link: null,
        is_active: inst.is_active ?? true,
        is_paid: inst.is_paid ?? false,
        kicked: inst.kicked ?? false,
        installed_at: inst.installed_at || new Date().toISOString(),
        total_interactions: stats?.total || 0,
        unique_users: stats?.users.size || 0,
        unique_tokens: stats?.tokens.size || 0,
        top_commands: stats?.commands || {},
        first_seen: stats?.first || inst.installed_at || new Date().toISOString(),
        last_seen: stats?.last || inst.installed_at || new Date().toISOString(),
      };

      if (!botToken) return base;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const [chatRes, countRes] = await Promise.all([
          fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${chatId}`, {
            signal: controller.signal,
          }),
          fetch(`https://api.telegram.org/bot${botToken}/getChatMemberCount?chat_id=${chatId}`, {
            signal: controller.signal,
          }),
        ]);

        clearTimeout(timeout);

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          if (chatData.ok && chatData.result) {
            const r = chatData.result;
            base.chat_title = r.title || base.chat_title;
            base.chat_type = r.type || base.chat_type;
            base.username = r.username || null;
            base.description = r.description || null;
            base.invite_link = r.invite_link || null;
          }
        }

        if (countRes.ok) {
          const countData = await countRes.json();
          if (countData.ok) {
            base.member_count = countData.result;
          }
        }
      } catch (err) {
        console.warn(`[telegram-group-info] Failed to fetch info for ${chatId}:`, err);
      }

      return base;
    };

    // Process in batches of 5 to avoid rate limits
    for (let i = 0; i < installations.length; i += 5) {
      const batch = installations.slice(i, i + 5);
      const results = await Promise.all(batch.map(fetchGroupInfo));
      groups.push(...results);
    }

    // Sort by total interactions descending
    groups.sort((a, b) => b.total_interactions - a.total_interactions);

    return new Response(JSON.stringify({ groups }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[telegram-group-info] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
