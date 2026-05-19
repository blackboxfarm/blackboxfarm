/**
 * autopsy-evidence-interpret
 *
 * Reads raw evidence blobs (TG deep-pulls, X scrapes, etc.) for a candidate,
 * sends the text content to Gemini Flash via Lovable AI Gateway, and writes a
 * structured interpretation back as a new blob with kind='ai_interpretation'.
 *
 * Extracted fields:
 *   - boost_mentions:        any reference to dexscreener boosts / 100x / 500x boost
 *   - dex_paid_mentions:     dex paid / banner / trending mentions
 *   - marketing_mentions:    paid marketing / influencers / KOL / call channels
 *   - dev_statements:        direct quotes attributed to the dev/team
 *   - sell_the_news_signals: hype/dump correlation signals
 *   - notable_quotes:        verbatim short snippets worth citing in the autopsy
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { withRunLog } from '../_shared/run-logger.ts';
import { assertDbWrite } from '../_shared/db-assert.ts';
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

function extractText(payload: any): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  // common shapes: { messages: [...] }, { result: {...} }, raw scrape text
  const chunks: string[] = [];
  const visit = (v: any, depth = 0) => {
    if (depth > 6 || v == null) return;
    if (typeof v === 'string') { if (v.length > 4) chunks.push(v); return; }
    if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1)); return; }
    if (typeof v === 'object') Object.values(v).forEach((x) => visit(x, depth + 1));
  };
  visit(payload);
  return chunks.join('\n').slice(0, 60000); // cap input size
}

async function callGemini(prompt: string): Promise<any> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY missing');
  const res = await meteredAiFetch("autopsy-evidence-interpret", LOVABLE_AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content:
            'You are a forensic evidence interpreter for crypto token autopsies. Read scraped Telegram/X/website text and return ONLY a single JSON object with these keys: boost_mentions (string[]), dex_paid_mentions (string[]), marketing_mentions (string[]), dev_statements (string[]), sell_the_news_signals (string[]), notable_quotes (string[]), summary (string). Each string must be a short, verbatim or near-verbatim snippet from the source — never invent. If nothing found for a key, return an empty array. Output JSON only, no prose, no code fences.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '';
  // Strip code fences if model added them
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```\s*$/g, '').trim();
  try { return JSON.parse(cleaned); } catch { return { summary: raw, parse_error: true }; }
}

Deno.serve(withRunLog('autopsy-evidence-interpret', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const candidateId: string | undefined = body.candidate_id;
  const tokenMint: string | undefined = body.token_mint;
  if (!candidateId && !tokenMint) {
    return new Response(JSON.stringify({ error: 'candidate_id or token_mint required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Pull raw blobs (skip prior interpretations)
  const q = supabase
    .from('autopsy_evidence_blobs')
    .select('id, kind, payload, captured_at')
    .neq('kind', 'ai_interpretation')
    .order('captured_at', { ascending: false })
    .limit(20);
  const { data: blobs, error } = candidateId
    ? await q.eq('candidate_id', candidateId)
    : await q.eq('token_mint', tokenMint!);
  if (error) throw error;
  if (!blobs || blobs.length === 0) {
    return new Response(JSON.stringify({ ok: true, interpreted: 0, reason: 'no blobs' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const text = blobs.map((b: any) => `── kind=${b.kind} captured=${b.captured_at} ──\n${extractText(b.payload)}`).join('\n\n');
  if (text.trim().length < 30) {
    return new Response(JSON.stringify({ ok: true, interpreted: 0, reason: 'no text content' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const interpretation = await callGemini(`Token mint: ${tokenMint ?? '(unknown)'}\n\nSCRAPED EVIDENCE:\n${text}`);

  const insertRow: Record<string, unknown> = {
    kind: 'ai_interpretation',
    payload: interpretation,
    captured_at: new Date().toISOString(),
  };
  if (candidateId) insertRow.candidate_id = candidateId;
  if (tokenMint) insertRow.token_mint = tokenMint;

  await assertDbWrite(
    supabase.from('autopsy_evidence_blobs').insert(insertRow).select('id').single(),
    'autopsy_evidence_blobs',
    'INSERT',
  );

  return new Response(JSON.stringify({ ok: true, interpreted: blobs.length, interpretation }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));