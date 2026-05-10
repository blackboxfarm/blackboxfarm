// Fire-and-forget invocation of community-recycled-scorer.
// Used by event-driven hooks (mint, scraper writes, rug flips, dex_paid).
// Never throws, never awaits the response — must not block the caller.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Args =
  | { mode: 'evaluate_for_token'; token_mint: string; reason?: string }
  | { mode: 'evaluate'; community_id: string; reason?: string };

export function fireRecycledScorer(args: Args): void {
  try {
    fetch(`${SUPABASE_URL}/functions/v1/community-recycled-scorer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(args),
    }).catch((e) => console.warn('[recycled-scorer-trigger] fetch failed', (e as Error).message));
  } catch (e) {
    console.warn('[recycled-scorer-trigger] threw', (e as Error).message);
  }
}
