/**
 * Canonical recycle event recorder.
 *
 * RULES:
 *   - Community recycle: same community_id observed linked to a 2nd distinct token_mint.
 *   - Handle recycle:    same x_user_id observed (a) linked to a 2nd distinct token_mint
 *                        OR (b) appearing as Creator/Admin on a 2nd distinct community_id.
 *
 * Name/handle changes alone do NOT raise events — they are only appended to
 * x_communities.name_history / x_account_registry.handle_history elsewhere.
 *
 * Deduped by the partial unique index recycle_events_unique_link.
 */

type SB = any;

export type RecycleSeverity = 'info' | 'yellow' | 'red';

export interface CommunityRecycleInput {
  community_id: string;
  prev_token_mint: string;
  new_token_mint: string;
  prev_label_snapshot?: any;
  new_label_snapshot?: any;
  dev_wallet?: string | null;
  kyc_root?: string | null;
  triggered_by?: string;
  severity?: RecycleSeverity;
}

export interface HandleRecycleInput {
  x_user_id: string;
  prev_token_mint?: string | null;
  new_token_mint?: string | null;
  prev_community_id?: string | null;
  new_community_id?: string | null;
  prev_label_snapshot?: any;
  new_label_snapshot?: any;
  dev_wallet?: string | null;
  kyc_root?: string | null;
  triggered_by?: string;
  severity?: RecycleSeverity;
}

/**
 * Insert a community recycle event. Returns true if a new row was written
 * (i.e. this is a genuinely new recycle), false if it was already recorded
 * or the input is invalid.
 *
 * Idempotent via the unique index — safe to call from every hook.
 */
export async function recordCommunityRecycle(
  supabase: SB,
  input: CommunityRecycleInput,
): Promise<boolean> {
  if (!input.community_id || !input.new_token_mint) return false;
  if (input.prev_token_mint && input.prev_token_mint === input.new_token_mint) return false;

  const row = {
    entity_type: 'community',
    entity_id: input.community_id,
    prev_token_mint: input.prev_token_mint || null,
    new_token_mint: input.new_token_mint,
    prev_community_id: null,
    new_community_id: null,
    prev_label_snapshot: input.prev_label_snapshot ?? null,
    new_label_snapshot: input.new_label_snapshot ?? null,
    dev_wallet: input.dev_wallet ?? null,
    kyc_root: input.kyc_root ?? null,
    severity: input.severity ?? 'info',
    triggered_by: input.triggered_by || 'unknown',
  };

  const { error } = await supabase
    .from('recycle_events')
    .upsert(row, { onConflict: 'entity_type,entity_id,new_token_mint,new_community_id', ignoreDuplicates: true });

  if (error) {
    console.warn('[recycle-events] community insert failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Insert a handle recycle event. Either new_token_mint OR new_community_id
 * must be provided (or both). Idempotent via unique index.
 */
export async function recordHandleRecycle(
  supabase: SB,
  input: HandleRecycleInput,
): Promise<boolean> {
  if (!input.x_user_id) return false;
  if (!input.new_token_mint && !input.new_community_id) return false;

  const row = {
    entity_type: 'handle',
    entity_id: input.x_user_id,
    prev_token_mint: input.prev_token_mint ?? null,
    new_token_mint: input.new_token_mint ?? null,
    prev_community_id: input.prev_community_id ?? null,
    new_community_id: input.new_community_id ?? null,
    prev_label_snapshot: input.prev_label_snapshot ?? null,
    new_label_snapshot: input.new_label_snapshot ?? null,
    dev_wallet: input.dev_wallet ?? null,
    kyc_root: input.kyc_root ?? null,
    severity: input.severity ?? 'info',
    triggered_by: input.triggered_by || 'unknown',
  };

  const { error } = await supabase
    .from('recycle_events')
    .upsert(row, { onConflict: 'entity_type,entity_id,new_token_mint,new_community_id', ignoreDuplicates: true });

  if (error) {
    console.warn('[recycle-events] handle insert failed:', error.message);
    return false;
  }
  return true;
}

/**
 * True if this handle has any recycle event of severity >= yellow.
 * Used to gate Phanes re-poll.
 */
export async function handleHasYellowOrRedEvent(
  supabase: SB,
  x_user_id: string,
): Promise<boolean> {
  if (!x_user_id) return false;
  const { data, error } = await supabase
    .from('recycle_events')
    .select('id')
    .eq('entity_type', 'handle')
    .eq('entity_id', x_user_id)
    .in('severity', ['yellow', 'red'])
    .limit(1);
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}