import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const botToken = Deno.env.get("TELEGRAM_HOLDERSINTEL_BOT_TOKEN");

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
  // Installer info
  installer_user_id: string | null;
  installer_email: string | null;
  installer_display_name: string | null;
  installer_telegram_username: string | null;
  installer_telegram_id: string | null;
  installer_oauth_provider: string | null;
  installer_oauth_username: string | null;
  // X profile from scraping
  installer_x_username: string | null;
  installer_x_url: string | null;
  installer_x_followers: number | null;
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
      .select("chat_id, chat_title, chat_type, is_active, is_paid, kicked, installed_at, user_id")
      .order("installed_at", { ascending: false });

    if (instErr) throw instErr;
    if (!installations || installations.length === 0) {
      return new Response(JSON.stringify({ groups: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get installer profiles in bulk
    const userIds = [...new Set(installations.map(i => i.user_id).filter(Boolean))];
    
    const profileMap = new Map<string, { display_name: string | null; oauth_provider: string | null; oauth_username: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, oauth_provider, oauth_username")
        .in("id", userIds);
      if (profiles) {
        for (const p of profiles) {
          profileMap.set(p.id, { display_name: p.display_name, oauth_provider: p.oauth_provider, oauth_username: p.oauth_username });
        }
      }
    }

    // 3. Get installer emails from auth.users via admin API
    const emailMap = new Map<string, string>();
    if (userIds.length > 0) {
      // Fetch in batches of 50
      for (let i = 0; i < userIds.length; i += 50) {
        const batch = userIds.slice(i, i + 50);
        const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        if (users) {
          for (const u of users) {
            if (batch.includes(u.id)) {
              emailMap.set(u.id, u.email || '');
            }
          }
        }
        break; // listUsers returns all, so only need one call
      }
    }

    // 4. Get TG usernames for installers from interactions
    const tgMap = new Map<string, { username: string | null; telegram_id: string | null }>();
    if (userIds.length > 0) {
      const { data: tgLinks } = await supabase
        .from("telegram_bot_interactions")
        .select("linked_user_id, telegram_username, telegram_user_id")
        .in("linked_user_id", userIds)
        .not("telegram_username", "is", null)
        .order("created_at", { ascending: false });
      if (tgLinks) {
        for (const t of tgLinks) {
          if (t.linked_user_id && !tgMap.has(t.linked_user_id)) {
            tgMap.set(t.linked_user_id, { username: t.telegram_username, telegram_id: t.telegram_user_id });
          }
        }
      }
    }

    // 5. Get X profiles for installers
    const xProfileMap = new Map<string, { x_username: string | null; x_url: string | null; x_followers: number | null }>();
    if (userIds.length > 0) {
      const { data: xProfiles } = await supabase
        .from("installer_x_profiles")
        .select("user_id, x_username, x_url, x_followers")
        .in("user_id", userIds);
      if (xProfiles) {
        for (const xp of xProfiles) {
          xProfileMap.set(xp.user_id, { x_username: xp.x_username, x_url: xp.x_url, x_followers: xp.x_followers });
        }
      }
    }

    // 6. Fetch interaction stats in bulk
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

    // 7. Query Telegram API for live info on each group
    const groups: GroupInfo[] = [];

    const fetchGroupInfo = async (inst: typeof installations[0]): Promise<GroupInfo> => {
      const chatId = String(inst.chat_id);
      const stats = interactionMap.get(chatId);
      const userId = inst.user_id;
      const profile = userId ? profileMap.get(userId) : null;
      const tgInfo = userId ? tgMap.get(userId) : null;
      const xProfile = userId ? xProfileMap.get(userId) : null;

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
        // Installer info
        installer_user_id: userId || null,
        installer_email: userId ? (emailMap.get(userId) || null) : null,
        installer_display_name: profile?.display_name || null,
        installer_telegram_username: tgInfo?.username || null,
        installer_telegram_id: tgInfo?.telegram_id || null,
        installer_oauth_provider: profile?.oauth_provider || null,
        installer_oauth_username: profile?.oauth_username || null,
        // Stats
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

        const chatData = await chatRes.json();
        if (chatData.ok && chatData.result) {
          const r = chatData.result;
          base.chat_title = r.title || base.chat_title;
          base.chat_type = r.type || base.chat_type;
          base.username = r.username || null;
          base.description = r.description || null;
          base.invite_link = r.invite_link || null;
        }

        const countData = await countRes.json();
        if (countData.ok) {
          base.member_count = countData.result;
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
