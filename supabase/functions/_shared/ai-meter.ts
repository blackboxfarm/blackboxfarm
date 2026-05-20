/**
 * ai-meter.ts — Universal AI Gateway wrapper.
 *
 * Drop-in replacement for `fetch('https://ai.gateway.lovable.dev/...', init)`.
 * Captures latency, token usage, estimated cost, and writes a row to
 * public.ai_compute_log keyed by function_name. Fire-and-forget logging
 * never blocks the caller; clones the Response so the caller can still
 * read .json() / .text() normally.
 *
 * Usage:
 *   import { meteredAiFetch } from '../_shared/ai-meter.ts';
 *   const res = await meteredAiFetch('autopsy-writer', AI_URL, { method, headers, body });
 *   if (!res.ok) { ... }
 *   const data = await res.json();
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { assertDbWrite } from './db-assert.ts';

const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// Per-1M-token USD pricing. Image models priced per call.
// Conservative estimates — refine when Lovable publishes exact rates.
const PRICING: Record<string, { in: number; out: number; perImage?: number }> = {
  'google/gemini-2.5-flash':            { in: 0.075, out: 0.30 },
  'google/gemini-2.5-flash-lite':       { in: 0.04,  out: 0.15 },
  'google/gemini-2.5-pro':              { in: 1.25,  out: 5.00 },
  'google/gemini-3-flash-preview':      { in: 0.075, out: 0.30 },
  'google/gemini-3.1-flash-lite-preview': { in: 0.04, out: 0.15 },
  'google/gemini-3.1-pro-preview':      { in: 1.25,  out: 5.00 },
  'google/gemini-2.5-flash-image':      { in: 0,     out: 0, perImage: 0.04 },
  'google/gemini-2.5-flash-image-preview': { in: 0,  out: 0, perImage: 0.04 },
  'google/gemini-3-flash-preview-image':{ in: 0,     out: 0, perImage: 0.04 },
  'google/gemini-3-pro-image-preview':  { in: 0,     out: 0, perImage: 0.10 },
  'google/gemini-3.1-flash-image-preview': { in: 0,  out: 0, perImage: 0.04 },
  'openai/gpt-5':                       { in: 1.25,  out: 10.0 },
  'openai/gpt-5-mini':                  { in: 0.25,  out: 2.00 },
  'openai/gpt-5-nano':                  { in: 0.05,  out: 0.40 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number, imageCount: number): number {
  const p = PRICING[model] ?? PRICING['google/gemini-2.5-flash'];
  const tokenCost = (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
  const imageCost = imageCount * (p.perImage ?? 0);
  return Number((tokenCost + imageCost).toFixed(6));
}

let _client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

async function logToDb(row: Record<string, unknown>) {
  try {
    const sb = getClient();
    if (!sb) return;
    await assertDbWrite(
      sb.from('ai_compute_log').insert(row),
      'ai_compute_log',
      'insert'
    );
  } catch (e) {
    console.error('[ai-meter] log failed', (e as Error).message);
  }
}

export interface MeterOptions {
  platform?: 'web' | 'telegram' | 'cron' | 'admin' | 'background';
  userId?: string | null;
  sessionId?: string | null;
  extra?: Record<string, unknown>;
}

/**
 * Wrap a single AI Gateway call. Returns the original Response (cloned-safe).
 */
export async function meteredAiFetch(
  functionName: string,
  url: string | URL,
  init: RequestInit,
  opts: MeterOptions = {},
): Promise<Response> {
  const started = Date.now();
  let model = 'unknown';
  try {
    if (init.body && typeof init.body === 'string') {
      const parsed = JSON.parse(init.body);
      if (parsed?.model) model = parsed.model;
    }
  } catch { /* ignore */ }

  const res = await fetch(url, init);
  const elapsed = Date.now() - started;

  // Clone so caller can still read body.
  const clone = res.clone();

  // Fire-and-forget: parse usage + log.
  const logTask = (async () => {
    let promptTokens = 0, completionTokens = 0, totalTokens = 0, imageCount = 0;
    let ok = res.ok;
    let errorMsg: string | null = null;
    try {
      if (res.ok) {
        const data = await clone.json();
        const u = data?.usage ?? {};
        promptTokens = u.prompt_tokens ?? u.input_tokens ?? 0;
        completionTokens = u.completion_tokens ?? u.output_tokens ?? 0;
        totalTokens = u.total_tokens ?? (promptTokens + completionTokens);
        const imgs = data?.choices?.[0]?.message?.images;
        if (Array.isArray(imgs)) imageCount = imgs.length;
      } else {
        errorMsg = `HTTP ${res.status}`;
        try { errorMsg = (await clone.text()).slice(0, 500); } catch { /* ignore */ }
      }
    } catch (e) {
      errorMsg = (e as Error).message;
    }
    const cost = estimateCost(model, promptTokens, completionTokens, imageCount);
    await logToDb({
      function_name: functionName,
      platform: opts.platform ?? 'background',
      user_id: opts.userId ?? null,
      session_id: opts.sessionId ?? null,
      model,
      prompt_tokens: promptTokens || null,
      completion_tokens: completionTokens || null,
      total_tokens: totalTokens || null,
      response_time_ms: elapsed,
      cost_estimate_usd: cost,
      metadata: {
        ok,
        status: res.status,
        image_count: imageCount || undefined,
        error: errorMsg ?? undefined,
        ...(opts.extra ?? {}),
      },
    });
  })();

  // Ensure the insert survives the edge function returning its Response.
  // Without waitUntil, the Deno Deploy isolate kills pending tasks → 0 rows logged.
  try {
    // @ts-ignore EdgeRuntime is provided by Supabase Edge Runtime
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(logTask);
    }
  } catch { /* ignore */ }

  return res;
}

export { AI_URL as LOVABLE_AI_URL };