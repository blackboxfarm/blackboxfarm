import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Resolves an X/Twitter handle to its immutable numeric user ID
 * using the X API v2. Caches results in `x_account_registry`.
 * 
 * Tracks handle history: if the same numeric ID appears under a different
 * handle, the old handle is recorded with timestamps — enabling
 * detection of handle rotation (name changes to evade reputation).
 */

export interface XHandleResolution {
  userId: string;        // Immutable numeric ID (e.g., "1234567890")
  displayName: string;   // Current display name
  handle: string;        // Current @handle
  isVerified: boolean;   // Blue check
  isRotated: boolean;    // True if handle_history has entries
  handleCount: number;   // Total handles seen for this user ID
  linkedTokenCount: number;
}

export async function resolveXHandle(
  handle: string,
  supabase: ReturnType<typeof createClient>,
): Promise<XHandleResolution | null> {
  if (!handle) return null;
  const cleanHandle = handle.replace(/^@/, '').toLowerCase();

  // 1. Check cache — look up by current_handle
  const { data: cached } = await supabase
    .from('x_account_registry')
    .select('x_user_id, current_handle, display_name, is_verified, handle_history, linked_token_count')
    .eq('current_handle', cleanHandle)
    .maybeSingle();

  if (cached) {
    const history = cached.handle_history || [];
    return {
      userId: cached.x_user_id,
      displayName: cached.display_name || cleanHandle,
      handle: cleanHandle,
      isVerified: cached.is_verified || false,
      isRotated: history.length > 0,
      handleCount: history.length + 1,
      linkedTokenCount: cached.linked_token_count || 0,
    };
  }

  // 2. Call X API v2
  const bearerToken = Deno.env.get('TWITTER_BEARER_TOKEN');
  if (!bearerToken) {
    console.warn('[x-handle-resolver] No TWITTER_BEARER_TOKEN set, falling back to handle-only');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(
      `https://api.x.com/2/users/by/username/${cleanHandle}?user.fields=id,name,username,verified,verified_type`,
      {
        headers: { 'Authorization': `Bearer ${bearerToken}` },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[x-handle-resolver] API failed for @${cleanHandle}: ${res.status} ${errBody}`);
      return null;
    }

    const data = await res.json();
    if (!data.data?.id) {
      console.warn(`[x-handle-resolver] No user found for @${cleanHandle}`);
      return null;
    }

    const user = data.data;
    const userId = user.id;
    const displayName = user.name || cleanHandle;
    const resolvedHandle = (user.username || cleanHandle).toLowerCase();
    const isVerified = user.verified === true || !!user.verified_type;
    const now = new Date().toISOString();

    // 3. Check if this user_id already exists (handle rotation detection!)
    const { data: existing } = await supabase
      .from('x_account_registry')
      .select('x_user_id, current_handle, display_name, handle_history, name_history, linked_token_count')
      .eq('x_user_id', userId)
      .maybeSingle();

    if (existing) {
      // User ID exists — update handle/name if changed
      const updates: any = { last_seen_at: now, is_verified: isVerified };
      const handleHistory = existing.handle_history || [];
      const nameHistory = existing.name_history || [];

      if (existing.current_handle !== resolvedHandle) {
        // Handle changed — record history
        if (existing.current_handle) {
          handleHistory.push({
            handle: existing.current_handle,
            first_seen: existing.last_seen_at || now,
            last_seen: now,
          });
        }
        updates.current_handle = resolvedHandle;
        updates.handle_history = handleHistory;
        console.log(`   🔄 X handle rotation detected: @${existing.current_handle} → @${resolvedHandle} (ID: ${userId})`);
      }

      if (existing.display_name !== displayName) {
        if (existing.display_name) {
          nameHistory.push({
            name: existing.display_name,
            first_seen: existing.last_seen_at || now,
            last_seen: now,
          });
        }
        updates.display_name = displayName;
        updates.name_history = nameHistory;
      }

      await supabase.from('x_account_registry').update(updates).eq('x_user_id', userId);

      return {
        userId,
        displayName,
        handle: resolvedHandle,
        isVerified,
        isRotated: handleHistory.length > 0,
        handleCount: handleHistory.length + 1,
        linkedTokenCount: existing.linked_token_count || 0,
      };
    }

    // 4. New user — insert
    await supabase.from('x_account_registry').insert({
      x_user_id: userId,
      current_handle: resolvedHandle,
      display_name: displayName,
      is_verified: isVerified,
      handle_history: [],
      name_history: [],
      linked_token_count: 0,
      first_seen_at: now,
      last_seen_at: now,
    });

    return {
      userId,
      displayName,
      handle: resolvedHandle,
      isVerified,
      isRotated: false,
      handleCount: 1,
      linkedTokenCount: 0,
    };

  } catch (err) {
    console.warn(`[x-handle-resolver] Error resolving @${cleanHandle}:`, err);
    return null;
  }
}

/**
 * Increment the linked_token_count for an X user. Call after linking a new token.
 */
export async function incrementXUserTokenCount(
  xUserId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const { data } = await supabase
    .from('x_account_registry')
    .select('linked_token_count')
    .eq('x_user_id', xUserId)
    .maybeSingle();

  if (data) {
    await supabase
      .from('x_account_registry')
      .update({ linked_token_count: (data.linked_token_count || 0) + 1 })
      .eq('x_user_id', xUserId);
  }
}
