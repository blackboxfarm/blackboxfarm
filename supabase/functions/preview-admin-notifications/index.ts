import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Preview-only fallback: returns admin_notifications + autopsy_comments using the
// service role. Gated by Origin/Referer matching the Lovable preview domains so
// production callers (blackboxfarm.lovable.app, custom domains) cannot use this.
function isPreviewOrigin(req: Request): boolean {
  const candidates = [req.headers.get('origin') || '', req.headers.get('referer') || ''];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const host = new URL(raw).hostname;
      if (/^id-preview--.*\.lovable\.app$/.test(host)) return true;
      if (/(^|\.)lovable\.dev$/.test(host)) return true;
      if (/(^|\.)lovableproject\.com$/.test(host)) return true;
    } catch { /* ignore */ }
  }
  return false;
}

Deno.serve(withRunLog('preview-admin-notifications', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!isPreviewOrigin(req)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const SIGNUP_TYPES = ['new_signup', 'user_registered', 'account_created'];
    const TRANSACTION_TYPES = ['banner_purchase', 'payment_confirmed', 'transaction', 'fantasy_buy', 'fantasy_sell', 'swap', 'allstar_mint'];
    const TICKET_TYPES = ['support_ticket', 'ticket_reply'];
    const NON_AUDIT_TYPES = [...SIGNUP_TYPES, ...TRANSACTION_TYPES, ...TICKET_TYPES];

    // Parse optional action body for write operations.
    let body: any = {};
    try { body = await req.json(); } catch { /* GET or empty */ }
    const action: string | undefined = body?.action;

    if (action === 'mark_read') {
      const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length) {
        await supabase.from('admin_notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .in('id', ids);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'mark_all_read') {
      const tab: string | undefined = body.tab;
      let q: any = supabase.from('admin_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('is_archived', false).eq('is_read', false);
      if (tab === 'signups') q = q.in('notification_type', SIGNUP_TYPES);
      else if (tab === 'transactions') q = q.in('notification_type', TRANSACTION_TYPES);
      else if (tab === 'tickets') q = q.in('notification_type', TICKET_TYPES);
      else if (tab === 'audit') q = q.not('notification_type', 'in', `(${NON_AUDIT_TYPES.map(t => `"${t}"`).join(',')})`);
      const { error } = await q;
      return new Response(JSON.stringify({ ok: !error, error: error?.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'archive') {
      const id: string | undefined = body.id;
      if (id) await supabase.from('admin_notifications').delete().eq('id', id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'clear_tab') {
      const tab: string | undefined = body.tab;
      let q: any = supabase.from('admin_notifications').delete().eq('is_archived', false);
      if (tab === 'signups') q = q.in('notification_type', SIGNUP_TYPES);
      else if (tab === 'transactions') q = q.in('notification_type', TRANSACTION_TYPES);
      else if (tab === 'tickets') q = q.in('notification_type', TICKET_TYPES);
      else if (tab === 'audit') q = q.not('notification_type', 'in', `(${NON_AUDIT_TYPES.map(t => `"${t}"`).join(',')})`);
      else return new Response(JSON.stringify({ ok: false, error: 'unknown tab' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { error } = await q;
      return new Response(JSON.stringify({ ok: !error, error: error?.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const [notifsRes, sCount, tCount, kCount, aCount, commentsRes] = await Promise.all([
      supabase
        .from('admin_notifications')
        .select('*')
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('admin_notifications').select('*', { count: 'exact', head: true })
        .eq('is_archived', false).in('notification_type', SIGNUP_TYPES),
      supabase.from('admin_notifications').select('*', { count: 'exact', head: true })
        .eq('is_archived', false).in('notification_type', TRANSACTION_TYPES),
      supabase.from('admin_notifications').select('*', { count: 'exact', head: true })
        .eq('is_archived', false).in('notification_type', TICKET_TYPES),
      supabase.from('admin_notifications').select('*', { count: 'exact', head: true })
        .eq('is_archived', false).not('notification_type', 'in', `(${NON_AUDIT_TYPES.map(t => `"${t}"`).join(',')})`),
      supabase
        .from('autopsy_comments')
        .select('id, autopsy_slug, user_id, body_clean, body, created_at, is_hidden')
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    const comments = commentsRes.data || [];
    const userIds = Array.from(new Set(comments.map((c: any) => c.user_id).filter(Boolean)));
    const nameMap: Record<string, string> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, username, email')
        .in('id', userIds);
      (profs || []).forEach((p: any) => {
        nameMap[p.id] = p.display_name || p.username || p.email || 'User';
      });
    }

    return new Response(
      JSON.stringify({
        notifications: notifsRes.data || [],
        tabTotals: {
          signups: sCount.count ?? 0,
          transactions: tCount.count ?? 0,
          tickets: kCount.count ?? 0,
          audit: aCount.count ?? 0,
        },
        comments,
        commentAuthors: nameMap,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));