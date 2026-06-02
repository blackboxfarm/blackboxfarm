// Shared helpers for the per-profile referral / affiliate system.
import { getSupabaseAdmin } from './profile-subscription.ts';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

export function generateCode(len = 6): string {
  let out = '';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function parseRefFromStart(text: string | undefined | null): string | null {
  if (!text) return null;
  // matches "/start ref_AB12CD" or "/start ref-AB12CD" or "/start refAB12CD"
  const m = text.match(/^\/start(?:@\S+)?\s+ref[_-]?([A-Z0-9]{6})\b/i);
  return m ? m[1].toUpperCase() : null;
}

export async function ensureReferralCode(profileKey: string, telegramUserId: number): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from('referral_codes')
    .select('code,status')
    .eq('profile_key', profileKey)
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();
  if (existing?.code) {
    if (existing.status !== 'active') {
      await supabase.from('referral_codes').update({
        status: 'active',
        last_activated_at: new Date().toISOString(),
      }).eq('profile_key', profileKey).eq('telegram_user_id', telegramUserId);
    }
    return existing.code;
  }
  for (let i = 0; i < 8; i++) {
    const code = generateCode(6);
    const { error } = await supabase.from('referral_codes').insert({
      profile_key: profileKey, telegram_user_id: telegramUserId, code, status: 'active',
    });
    if (!error) return code;
    // unique-violation -> retry
  }
  throw new Error('Failed to generate unique referral code');
}

export interface AttributionResult {
  outcome: 'attributed' | 'rejected' | 'inactive' | 'unknown';
  reason?: string;
  referrerTelegramId?: number;
}

export async function captureAttribution(
  profileKey: string,
  referredTelegramUserId: number,
  rawCode: string,
): Promise<AttributionResult> {
  const supabase = getSupabaseAdmin();
  const code = rawCode.toUpperCase();
  const { data: codeRow } = await supabase
    .from('referral_codes')
    .select('telegram_user_id,status')
    .eq('profile_key', profileKey)
    .eq('code', code)
    .maybeSingle();
  if (!codeRow) return { outcome: 'unknown' };
  if (codeRow.telegram_user_id === referredTelegramUserId) {
    return { outcome: 'rejected', reason: 'self_referral' };
  }
  if (codeRow.status !== 'active') {
    return { outcome: 'inactive', referrerTelegramId: codeRow.telegram_user_id };
  }
  // Has this user ever subscribed to this profile? If so, no attribution.
  const { data: prior } = await supabase
    .from('profile_subscriptions')
    .select('id')
    .eq('profile_key', profileKey)
    .eq('telegram_user_id', referredTelegramUserId)
    .eq('status', 'paid')
    .limit(1);
  if (prior && prior.length > 0) {
    return { outcome: 'rejected', reason: 'existing_customer' };
  }
  // Already-attributed-elsewhere guard via UNIQUE constraint
  const { error } = await supabase.from('referral_attributions').upsert({
    profile_key: profileKey,
    referrer_code: code,
    referrer_telegram_user_id: codeRow.telegram_user_id,
    referred_telegram_user_id: referredTelegramUserId,
    status: 'pending',
  }, { onConflict: 'profile_key,referred_telegram_user_id', ignoreDuplicates: true });
  if (error) console.warn('[captureAttribution] upsert error', error);
  return { outcome: 'attributed', referrerTelegramId: codeRow.telegram_user_id };
}

export async function buildFooter(profileKey: string, telegramUserId: number, botUsername: string | null): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data: cfg } = await supabase
    .from('profile_subscription_configs')
    .select('affiliate_enabled,affiliate_footer_copy,bot_username')
    .eq('profile_key', profileKey)
    .maybeSingle();
  if (!cfg?.affiliate_enabled) return '';
  // Only paid users get an actionable footer.
  const { data: sub } = await supabase
    .from('profile_subscriptions')
    .select('id')
    .eq('profile_key', profileKey)
    .eq('telegram_user_id', telegramUserId)
    .eq('status', 'paid')
    .gt('expires_at', new Date().toISOString())
    .limit(1).maybeSingle();
  if (!sub) return '';
  const code = await ensureReferralCode(profileKey, telegramUserId).catch(() => null);
  if (!code) return '';
  const uname = botUsername || cfg.bot_username || '';
  const link = uname ? `https://t.me/${uname}?start=ref_${code}` : `(code: ${code})`;
  const tmpl = cfg.affiliate_footer_copy || '🎁 Refer friends — every paid signup adds +1 free month.\n🔗 {ref_link}';
  return '\n\n— — —\n' + tmpl.replace(/\{ref_link\}/g, link).replace(/\{ref_code\}/g, code);
}

/** Find the live subscription (latest expires_at) for a referrer. */
export async function findLiveSubscription(profileKey: string, telegramUserId: number) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('profile_subscriptions')
    .select('*')
    .eq('profile_key', profileKey)
    .eq('telegram_user_id', telegramUserId)
    .eq('status', 'paid')
    .order('expires_at', { ascending: false })
    .limit(1).maybeSingle();
  return data;
}