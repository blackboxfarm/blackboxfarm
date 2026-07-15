import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const API = 'https://api.migadu.com/v1';

function auth() {
  const email = Deno.env.get('MIGADU_ADMIN_EMAIL');
  const key = Deno.env.get('MIGADU_API_KEY');
  if (!email || !key) throw new Error('MIGADU_ADMIN_EMAIL / MIGADU_API_KEY not configured');
  return 'Basic ' + btoa(`${email}:${key}`);
}

async function migadu(path: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: auth(), Accept: 'application/json' },
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep as text */ }
  return { status: res.status, ok: res.ok, body };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const token = req.headers.get('x-explore-token');
    if (!token || token !== Deno.env.get('MIGADU_EXPLORE_TOKEN')) {
      return json({ error: 'Unauthorized — missing/invalid x-explore-token' }, 401);
    }

    const url = new URL(req.url);
    let action = url.searchParams.get('action') ?? '';
    let domain = url.searchParams.get('domain') ?? '';
    let localpart = url.searchParams.get('localpart') ?? '';

    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      action = b.action ?? action;
      domain = b.domain ?? domain;
      localpart = b.localpart ?? localpart;
    }

    switch (action) {
      case 'whoami': {
        // Migadu doesn't have a `/domains` list endpoint; probe the configured domain instead.
        const probeDomain = domain || (Deno.env.get('MIGADU_ADMIN_EMAIL') ?? '').split('@')[1];
        const r = await migadu(`/domains/${probeDomain}/mailboxes`);
        return json({
          admin_email: Deno.env.get('MIGADU_ADMIN_EMAIL'),
          probed_domain: probeDomain,
          auth_status: r.status,
          auth_ok: r.ok,
          note: 'Migadu API is scoped to any domain you administer. Query per-domain endpoints below.',
          sample: r.body,
        });
      }
      case 'list_mailboxes':
        if (!domain) return json({ error: 'domain required' }, 400);
        return json(await migadu(`/domains/${domain}/mailboxes`));
      case 'get_mailbox':
        if (!domain || !localpart) return json({ error: 'domain and localpart required' }, 400);
        return json(await migadu(`/domains/${domain}/mailboxes/${localpart}`));
      case 'list_identities':
        if (!domain || !localpart) return json({ error: 'domain and localpart required' }, 400);
        return json(await migadu(`/domains/${domain}/mailboxes/${localpart}/identities`));
      case 'list_aliases':
        if (!domain) return json({ error: 'domain required' }, 400);
        return json(await migadu(`/domains/${domain}/aliases`));
      case 'list_rewrites':
        if (!domain) return json({ error: 'domain required' }, 400);
        return json(await migadu(`/domains/${domain}/rewrites`));
      default:
        return json({
          error: 'unknown action',
          available_actions: [
            'whoami',
            'list_mailboxes (domain)',
            'get_mailbox (domain, localpart)',
            'list_identities (domain, localpart)',
            'list_aliases (domain)',
            'list_rewrites (domain)',
          ],
        }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});