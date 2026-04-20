import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { telegram_user_id, display_name, custom_message, dry_run, promo_code } = await req.json();

    if (!telegram_user_id || typeof telegram_user_id !== 'string') {
      return new Response(JSON.stringify({ error: 'telegram_user_id (string) required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    // Auth: require super-admin caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');
    const { data: userRes, error: userErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userErr || !userRes.user) throw new Error('Auth invalid');

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userRes.user.id);
    const isAdmin = (roles || []).some((r: any) => r.role === 'super_admin' || r.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (dry_run) {
      return new Response(JSON.stringify({ ok: true, dry_run: true, telegram_user_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optional: tester program promo code (e.g. DM10) — track redemption + bump counter
    let promoInfo: { code: string; trial_days: number; tier: string; expires_at: string } | null = null;
    if (promo_code && typeof promo_code === 'string') {
      const code = promo_code.trim().toUpperCase();
      const { data: promo, error: promoErr } = await supabase
        .from('promo_codes')
        .select('id, code, max_uses, current_uses, trial_duration_days, tier_granted, source_label, is_active')
        .eq('code', code)
        .maybeSingle();
      if (promoErr) throw new Error(`Promo lookup failed: ${promoErr.message}`);
      if (!promo) throw new Error(`Promo code "${code}" not found`);
      if (!promo.is_active) throw new Error(`Promo code "${code}" is inactive`);
      if (promo.current_uses >= promo.max_uses) throw new Error(`Promo code "${code}" is fully redeemed (${promo.current_uses}/${promo.max_uses})`);

      // Skip if this TG user already redeemed an active promo
      const { data: existingRedemption } = await supabase
        .from('promo_redemptions')
        .select('id, expires_at')
        .eq('telegram_user_id', telegram_user_id)
        .eq('is_active', true)
        .gte('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!existingRedemption) {
        const promoExpires = new Date(Date.now() + promo.trial_duration_days * 24 * 60 * 60 * 1000);
        const { error: redErr } = await supabase.from('promo_redemptions').insert({
          promo_code_id: promo.id,
          telegram_user_id,
          expires_at: promoExpires.toISOString(),
          is_active: true,
          source_label: promo.source_label || `Manual grant — ${code}`,
        });
        if (redErr) throw new Error(`Failed inserting promo_redemption: ${redErr.message}`);

        const { error: bumpErr } = await supabase
          .from('promo_codes')
          .update({ current_uses: promo.current_uses + 1, updated_at: new Date().toISOString() })
          .eq('id', promo.id);
        if (bumpErr) throw new Error(`Failed bumping promo counter: ${bumpErr.message}`);

        promoInfo = {
          code,
          trial_days: promo.trial_duration_days,
          tier: promo.tier_granted,
          expires_at: promoExpires.toISOString(),
        };
      } else {
        promoInfo = {
          code,
          trial_days: promo.trial_duration_days,
          tier: promo.tier_granted,
          expires_at: existingRedemption.expires_at,
        };
      }
    }

    // Check for existing active comp/paid sub
    const { data: existingSub } = await supabase
      .from('tg_sol_subscriptions')
      .select('id, expires_at, status')
      .eq('telegram_user_id', telegram_user_id)
      .eq('status', 'paid')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    let subscriptionId = existingSub?.id;
    let alreadyActive = false;

    if (existingSub) {
      alreadyActive = true;
      // Extend by another year from existing expiry
      const newExpiry = new Date(
        Math.max(new Date(existingSub.expires_at).getTime(), now.getTime()) +
          365 * 24 * 60 * 60 * 1000
      );
      const { error: updErr } = await supabase
        .from('tg_sol_subscriptions')
        .update({ expires_at: newExpiry.toISOString(), updated_at: now.toISOString() })
        .eq('id', existingSub.id);
      if (updErr) throw new Error(`Failed extending sub: ${updErr.message}`);
    } else {
      // Create comp record (no real wallet/payment)
      const { data: newSub, error: insErr } = await supabase
        .from('tg_sol_subscriptions')
        .insert({
          telegram_user_id,
          payment_wallet_pubkey: 'COMP_GRANT',
          payment_wallet_secret_encrypted: 'COMP_GRANT',
          amount_sol: 0,
          status: 'paid',
          tier_granted: 'pro',
          paid_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .select('id')
        .single();
      if (insErr) throw new Error(`Failed creating comp sub: ${insErr.message}`);
      subscriptionId = newSub.id;
    }

    // If user has a linked website account, bump cached_tier_key
    const { data: link } = await supabase
      .from('telegram_bot_interactions')
      .select('linked_user_id')
      .eq('telegram_user_id', telegram_user_id)
      .not('linked_user_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (link?.linked_user_id) {
      await supabase
        .from('profiles')
        .update({ cached_tier_key: 'pro' })
        .eq('id', link.linked_user_id);
    }

    // Update / seed AI memory note so future interactions know this person
    if (display_name) {
      await supabase.from('ai_user_memory').upsert(
        {
          telegram_user_id,
          preferred_name: display_name,
          last_platform: 'telegram',
          notes: { comp_grant: true, granted_at: now.toISOString() },
        },
        { onConflict: 'telegram_user_id' }
      );
    }

    // Send DM via @holdersintel_bot
    const botToken = Deno.env.get('TELEGRAM_HOLDERSINTEL_BOT_TOKEN');
    let dmStatus: 'sent' | 'failed' | 'no_token' = 'no_token';
    let dmError: string | null = null;

    if (botToken) {
      const greeting = display_name ? `Hey ${display_name}!` : 'Hey!';
      const text =
        custom_message ||
        `${greeting} 👋\n\n` +
        `Good news — I just hooked you up with a full *Pro* account on HoldersIntel, on the house. ` +
        `It's good for a year (until *${expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*), no payment needed.\n\n` +
        `You can already start using everything right here in this chat:\n` +
        `• \`/holders <CA>\` — full holder + dev forensics\n` +
        `• \`/dev <CA>\` — wallet genealogy + KYC root\n` +
        `• Just paste a contract address and I'll auto-run the report\n\n` +
        `If you also want the web dashboard + Bubble Map premium, head to *blackbox.farm*, sign up with any email, then come back here and send \`/link\` — I'll walk you through tying the two accounts together (takes ~15 seconds).\n\n` +
        `Either way you're all set. Type \`/help\` anytime to see the full command list. Welcome in 🚀`;

      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegram_user_id,
            text,
            parse_mode: 'Markdown',
          }),
        });
        const tgData = await tgRes.json();
        if (tgRes.ok && tgData.ok) {
          dmStatus = 'sent';
        } else {
          // Retry without markdown
          const retry = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: telegram_user_id, text }),
          });
          const retryData = await retry.json();
          if (retry.ok && retryData.ok) {
            dmStatus = 'sent';
          } else {
            dmStatus = 'failed';
            dmError = retryData.description || `HTTP ${retry.status}`;
          }
        }
      } catch (e: any) {
        dmStatus = 'failed';
        dmError = e?.message || String(e);
      }
    }

    // Admin notification log
    await supabase.from('admin_notifications').insert({
      notification_type: 'comp_grant',
      title: promoInfo ? `🎟️ Tester Grant (${promoInfo.code})` : '🎁 Comp Pro Granted',
      message: `Granted yearly Pro to TG ${telegram_user_id}${display_name ? ` (${display_name})` : ''}${promoInfo ? ` via ${promoInfo.code}` : ''}. DM: ${dmStatus}${dmError ? ` (${dmError})` : ''}.`,
      metadata: {
        telegram_user_id,
        display_name,
        subscription_id: subscriptionId,
        already_active: alreadyActive,
        expires_at: expiresAt.toISOString(),
        dm_status: dmStatus,
        dm_error: dmError,
        granted_by: userRes.user.id,
        promo: promoInfo,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        subscription_id: subscriptionId,
        already_active: alreadyActive,
        expires_at: expiresAt.toISOString(),
        linked_user_id: link?.linked_user_id || null,
        dm_status: dmStatus,
        dm_error: dmError,
        promo: promoInfo,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('[tg-comp-grant] Error:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
