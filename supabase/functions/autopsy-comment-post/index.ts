import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { sanitizeCommentBody, verifyTurnstile } from '../_shared/comment-sanitize.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.replace('Bearer ', '');
    if (!jwt) return json({ error: 'unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'bad_request' }, 400);

    const slug = String(body.autopsy_slug || '').trim().toLowerCase();
    const rawBody = String(body.body || '');
    const parentId = body.parent_id ? String(body.parent_id) : null;
    const turnstileToken = body.cf_turnstile_token as string | undefined;

    if (!slug || !/^[a-z0-9-]{2,128}$/.test(slug)) return json({ error: 'bad_slug' }, 400);
    if (!rawBody.trim()) return json({ error: 'empty_body' }, 400);

    const ts = await verifyTurnstile(turnstileToken);
    if (!ts.ok) return json({ error: 'captcha_failed', reason: ts.reason }, 403);

    const { clean, flags } = sanitizeCommentBody(rawBody, 1000);
    if (!clean) return json({ error: 'empty_after_sanitize' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SRK);

    // Rate-limit: max 5 comments / 60s per user
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from('autopsy_comments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since);
    if ((count ?? 0) >= 5) return json({ error: 'rate_limited' }, 429);

    // Verify the autopsy exists
    const { data: autopsy } = await admin
      .from('autopsy_reports')
      .select('slug')
      .eq('slug', slug)
      .limit(1)
      .maybeSingle();
    if (!autopsy) return json({ error: 'autopsy_not_found' }, 404);

    const { data: inserted, error: insErr } = await admin
      .from('autopsy_comments')
      .insert({
        autopsy_slug: slug,
        user_id: userId,
        parent_id: parentId,
        body: rawBody.slice(0, 1000),
        body_clean: clean,
      })
      .select('id, created_at')
      .single();

    if (insErr) {
      console.error('[autopsy-comment-post] insert failed:', insErr);
      return json({ error: 'insert_failed', detail: insErr.message }, 500);
    }

    return json({ ok: true, id: inserted.id, created_at: inserted.created_at, flags });
  } catch (e) {
    console.error('[autopsy-comment-post] fatal:', e);
    return json({ error: 'internal', detail: (e as Error).message }, 500);
  }
});