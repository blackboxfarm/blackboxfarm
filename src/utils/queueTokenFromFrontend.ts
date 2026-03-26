import { supabase } from "@/integrations/supabase/client";

/**
 * Silently submits a token to the holders_intel_post_queue
 * from frontend discovery points (bubblemap, /holders).
 * Deduplicates: skips if already queued within 7 days.
 */
export async function queueTokenFromFrontend(
  tokenMint: string,
  triggerSource: 'bubblemap_query' | 'public_query' | 'subscriber_query',
  extra?: { symbol?: string; name?: string; marketCap?: number; comment?: string }
) {
  if (!tokenMint || tokenMint.length < 30) return;

  try {
    // Check if already queued recently (7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from('holders_intel_post_queue')
      .select('id')
      .eq('token_mint', tokenMint)
      .gte('created_at', sevenDaysAgo)
      .limit(1);

    if (existing && existing.length > 0) return; // already queued

    await supabase.from('holders_intel_post_queue').insert({
      token_mint: tokenMint,
      symbol: extra?.symbol || null,
      name: extra?.name || null,
      market_cap: extra?.marketCap || null,
      scheduled_at: new Date().toISOString(),
      status: 'pending',
      trigger_source: triggerSource,
      trigger_comment: extra?.comment || null,
    });
  } catch {
    // Silent — never block the user flow
  }
}
