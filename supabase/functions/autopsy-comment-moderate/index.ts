import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.replace('Bearer ', '');
    if (!jwt) return json({ error: 'unauthorized' }, 401);
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SRK);
    const { data: hasRole } = await admin.rpc('has_role', { _user_id: u.user.id, _role: 'super_admin' });
    if (!hasRole) return json({ error: 'forbidden' }, 403);

    const { comment_id, action } = await req.json();
    if (!comment_id || !['hide', 'unhide', 'pin', 'unpin', 'delete'].includes(action)) {
      return json({ error: 'bad_request' }, 400);
    }
    if (action === 'delete') {
      const { error } = await admin.from('autopsy_comments').delete().eq('id', comment_id);
      if (error) return json({ error: error.message }, 500);
    } else {
      const patch: Record<string, boolean> = {};
      if (action === 'hide') patch.is_hidden = true;
      if (action === 'unhide') patch.is_hidden = false;
      if (action === 'pin') patch.is_pinned = true;
      if (action === 'unpin') patch.is_pinned = false;
      const { error } = await admin.from('autopsy_comments').update(patch).eq('id', comment_id);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});