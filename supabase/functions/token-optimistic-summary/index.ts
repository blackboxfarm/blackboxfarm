import { createClient } from 'npm:@supabase/supabase-js@2';
import { meteredAiFetch } from '../_shared/ai-meter.ts';
import { assertDbWrite } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const SYSTEM_PROMPT = `You are an opportunity-leaning but HONEST crypto token analyst for HoldersIntel.

TONE RULES (mandatory):
- Energetic, plain-English, opportunity-leaning WHEN the real metrics support it.
- Sober and quiet when they don't — never invent positive signal.
- Highlight genuine strengths first: holder dispersion, dev renouncement, CTO signals, healthy liquidity, narrative tailwinds.
- You may weave an attached "narrative context" story in as CULTURAL/THEMATIC backdrop — clearly framed as narrative, not fundamentals.

HARD BANS (never violate):
- Never say: "buy now", "get in early", "FOMO", "moon", "guaranteed", "100x", "1000x", price targets, "ape in".
- Never fabricate holder counts, percentages, or distribution claims. Only state numbers present in the provided data.
- Never claim the team/dev is doxxed or audited unless the provided data says so.
- Always end with one short risk caveat + the literal phrase "Not financial advice."

OUTPUT: return ONLY a single JSON object with keys:
{
  "headline": "<one punchy sentence — 80 chars max>",
  "body": "<2-4 short paragraphs of plain-English analysis>",
  "highlights": ["<3-5 genuine positive bullets pulled from the data>"],
  "narrative_tie_in": "<optional: 1-2 sentences linking the cultural backdrop, or empty string>",
  "risk_note": "<one short risk sentence>",
  "disclaimer": "Not financial advice."
}
No code fences. No prose outside the JSON.`;

async function callGemini(userPayload: string) {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY missing');
  const res = await meteredAiFetch('token-optimistic-summary', AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPayload },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '';
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```\s*$/g, '').trim();
  try { return JSON.parse(cleaned); } catch { return { headline: 'Summary unavailable', body: raw, highlights: [], narrative_tie_in: '', risk_note: 'AI parse error.', disclaimer: 'Not financial advice.' }; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { tokenMint, forceRefresh } = await req.json();
    if (!tokenMint) {
      return new Response(JSON.stringify({ error: 'tokenMint required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Cache check
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('token_optimistic_summary_cache')
        .select('summary, generated_at, expires_at')
        .eq('token_mint', tokenMint)
        .maybeSingle();
      if (cached && new Date(cached.expires_at) > new Date()) {
        return new Response(JSON.stringify({ summary: cached.summary, cached: true, generated_at: cached.generated_at }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Gather real context
    const [ctoRes, linkRes, dexRes] = await Promise.all([
      supabase.from('token_cto_status').select('*').eq('token_mint', tokenMint).maybeSingle(),
      supabase.from('token_narrative_links').select('*').eq('token_mint', tokenMint).eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('dexscreener_token_cache').select('*').eq('token_mint', tokenMint).maybeSingle().then(r => r).catch(() => ({ data: null })),
    ]);

    const cto = ctoRes.data;
    const narrative = linkRes.data;
    const dex: any = (dexRes as any).data;

    const context = {
      token_mint: tokenMint,
      cto_status: cto ? { is_cto: cto.is_cto, signals: cto.signals, admin_curated: cto.admin_override } : null,
      market: dex ? {
        symbol: dex.symbol ?? dex.name ?? null,
        price_usd: dex.price_usd ?? null,
        market_cap_usd: dex.market_cap_usd ?? null,
        liquidity_usd: dex.liquidity_usd ?? null,
        volume_24h: dex.volume_24h_usd ?? null,
        price_change_24h_pct: dex.price_change_24h ?? null,
        holders: dex.holder_count ?? null,
      } : null,
      narrative_context: narrative ? {
        title: narrative.title,
        source_domain: narrative.source_domain,
        url: narrative.url,
        editor_note: narrative.editor_note,
      } : null,
    };

    const userPayload = `Generate an opportunity-leaning honest summary for this token. Real data:\n\n${JSON.stringify(context, null, 2)}\n\nRemember: positive ONLY where data supports it. Numbers must come from the data above. Include the narrative_context as cultural backdrop in narrative_tie_in if present.`;

    const summary = await callGemini(userPayload);

    // Cache write
    await assertDbWrite(
      supabase.from('token_optimistic_summary_cache').upsert({
        token_mint: tokenMint,
        summary,
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }, { onConflict: 'token_mint' }).select('id').single(),
      'token_optimistic_summary_cache',
      'UPSERT',
    );

    return new Response(JSON.stringify({ summary, cached: false, generated_at: new Date().toISOString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[token-optimistic-summary] error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});