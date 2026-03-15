import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Lightweight X handle registration for Phanes backfill.
 * 
 * Call this whenever you discover an X handle anywhere in the system.
 * It ensures the handle exists in x_account_registry so the
 * phanes-x-query backfill cron will eventually query it.
 * 
 * Unlike resolveXHandle(), this does NOT call the X API — it only
 * creates a stub record if the handle doesn't already exist.
 * The full resolution happens later via social-mesh-linker or
 * x-handle-resolver when the handle is actually needed.
 */

export function extractXHandle(input: string | null | undefined): string | null {
  if (!input) return null;
  
  // Handle URLs like https://x.com/handle or https://twitter.com/handle
  const urlMatch = input.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})(?:\?|\/|$)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  
  // Handle bare @handle or handle
  const clean = input.replace(/^@/, '').trim().toLowerCase();
  if (/^[a-zA-Z0-9_]{1,15}$/.test(clean)) return clean;
  
  return null;
}

/**
 * Register one or more X handles into x_account_registry for Phanes backfill.
 * Skips handles that already exist. Returns count of newly registered handles.
 */
export async function registerXHandlesForPhanes(
  handles: (string | null | undefined)[],
  supabase: ReturnType<typeof createClient>,
  source?: string,
): Promise<number> {
  const cleanHandles = handles
    .map(h => extractXHandle(h))
    .filter((h): h is string => !!h && h.length > 0);

  if (cleanHandles.length === 0) return 0;

  // Deduplicate
  const unique = [...new Set(cleanHandles)];
  
  // Check which ones already exist
  const { data: existing } = await supabase
    .from('x_account_registry')
    .select('current_handle')
    .in('current_handle', unique);

  const existingSet = new Set((existing || []).map(e => e.current_handle));
  const newHandles = unique.filter(h => !existingSet.has(h));

  if (newHandles.length === 0) return 0;

  const now = new Date().toISOString();
  const rows = newHandles.map(handle => ({
    x_user_id: `pending_${handle}`, // Placeholder until X API resolves
    current_handle: handle,
    display_name: null,
    is_verified: false,
    handle_history: [],
    name_history: [],
    linked_token_count: 0,
    first_seen_at: now,
    last_seen_at: now,
    // phanes_queried_at is NULL by default → will be picked up by backfill
  }));

  const { error } = await supabase
    .from('x_account_registry')
    .upsert(rows, { onConflict: 'current_handle', ignoreDuplicates: true });

  if (error) {
    console.warn(`[register-x-handle] Failed to register ${newHandles.length} handles:`, error.message);
    return 0;
  }

  if (source) {
    console.log(`[register-x-handle] Registered ${newHandles.length} new X handles from ${source} for Phanes backfill`);
  }

  return newHandles.length;
}
