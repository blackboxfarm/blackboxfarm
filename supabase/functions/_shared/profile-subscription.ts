// Shared helpers for the per-profile subscription bot.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Keypair, Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from 'npm:@solana/web3.js@1.87.6';
import bs58 from 'https://esm.sh/bs58@5.0.0';
import { SecureStorage } from './encryption.ts';
import { getSolPriceFromCache } from './sol-price-cache.ts';

export const FEE_BUFFER_LAMPORTS = 15_000;

export function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

export function getRpc(): Connection {
  const apiKey = Deno.env.get('HELIUS_API_KEY');
  const url = apiKey
    ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
    : 'https://api.mainnet-beta.solana.com';
  return new Connection(url, 'confirmed');
}

export async function newDepositWallet() {
  const kp = Keypair.generate();
  const secretB58 = bs58.encode(kp.secretKey);
  const encrypted = await SecureStorage.encrypt(secretB58);
  return { pubkey: kp.publicKey.toBase58(), encrypted };
}

export async function loadKeypair(encryptedSecret: string): Promise<Keypair> {
  const b58 = await SecureStorage.decrypt(encryptedSecret);
  return Keypair.fromSecretKey(bs58.decode(b58));
}

export async function getBalanceLamports(pubkey: string): Promise<number> {
  return getRpc().getBalance(new PublicKey(pubkey));
}

/** Sweep entire balance (minus fee buffer) into the destination wallet. */
export async function sweepAll(fromKp: Keypair, toPubkey: string): Promise<{ signature: string; lamports: number } | null> {
  const c = getRpc();
  const balance = await c.getBalance(fromKp.publicKey);
  if (balance <= FEE_BUFFER_LAMPORTS + 3) return null;
  const lamports = balance - FEE_BUFFER_LAMPORTS;
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKp.publicKey,
      toPubkey: new PublicKey(toPubkey),
      lamports,
    }),
  );
  const { blockhash } = await c.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromKp.publicKey;
  tx.sign(fromKp);
  const sig = await c.sendRawTransaction(tx.serialize());
  await c.confirmTransaction(sig, 'confirmed');
  return { signature: sig, lamports };
}

export { LAMPORTS_PER_SOL };

// ---------- Telegram per-profile ----------

export async function getProfileBotToken(profileKey: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('profile_subscription_configs')
    .select('bot_secret_name')
    .eq('profile_key', profileKey)
    .maybeSingle();
  if (!data?.bot_secret_name) return null;
  return Deno.env.get(data.bot_secret_name) ?? null;
}

export async function tgCall(botToken: string, method: string, body: Record<string, unknown>) {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) {
    throw new Error(`Telegram ${method} failed [${r.status}]: ${JSON.stringify(j)}`);
  }
  return j.result;
}

export async function tgSendDM(profileKey: string, chatId: number | string, text: string, opts: Record<string, unknown> = {}) {
  const token = await getProfileBotToken(profileKey);
  if (!token) throw new Error(`No bot token for profile ${profileKey}`);
  return tgCall(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...opts,
  });
}

export async function tgCreateInviteLink(profileKey: string, channelChatId: string): Promise<string> {
  const token = await getProfileBotToken(profileKey);
  if (!token) throw new Error(`No bot token for profile ${profileKey}`);
  const res = await tgCall(token, 'createChatInviteLink', {
    chat_id: channelChatId,
    member_limit: 1,
    expire_date: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    name: `sub-${Date.now()}`,
  });
  return res.invite_link as string;
}

export async function tgKickFromChannel(profileKey: string, channelChatId: string, telegramUserId: number) {
  const token = await getProfileBotToken(profileKey);
  if (!token) return;
  try {
    await tgCall(token, 'banChatMember', { chat_id: channelChatId, user_id: telegramUserId });
    // Immediately unban so they can rejoin later via fresh invite
    await tgCall(token, 'unbanChatMember', { chat_id: channelChatId, user_id: telegramUserId, only_if_banned: true });
  } catch (e) {
    console.warn(`[tgKick] ${e instanceof Error ? e.message : e}`);
  }
}

// ---------- FX rates ----------

export async function getFxRates(base: string, quotes: string[]): Promise<Record<string, number>> {
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data: cached } = await supabase
    .from('fx_rates_daily')
    .select('quote,rate')
    .eq('date', today)
    .eq('base', base);
  const out: Record<string, number> = { [base]: 1 };
  const missing: string[] = [];
  const map = new Map((cached ?? []).map((r: any) => [r.quote, Number(r.rate)]));
  for (const q of quotes) {
    if (q === base) continue;
    if (map.has(q)) out[q] = map.get(q)!;
    else missing.push(q);
  }
  if (missing.length > 0) {
    try {
      const url = `https://api.frankfurter.app/latest?from=${base}&to=${missing.join(',')}`;
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        const rates = j?.rates ?? {};
        const rows = Object.entries(rates).map(([quote, rate]) => ({
          date: today, base, quote, rate: Number(rate),
        }));
        if (rows.length > 0) {
          await supabase.from('fx_rates_daily').upsert(rows, { onConflict: 'date,base,quote' });
        }
        for (const [q, v] of Object.entries(rates)) out[q] = Number(v);
      }
    } catch (e) {
      console.warn('[getFxRates] frankfurter failed', e);
    }
    for (const q of missing) if (!(q in out)) out[q] = 0;
  }
  return out;
}

export async function priceFiatToSol(priceFiat: number, baseCurrency: string): Promise<{ sol: number; solPriceUsd: number; fiatToUsdRate: number }> {
  const supabase = getSupabaseAdmin();
  const solPriceUsd = await getSolPriceFromCache(supabase);
  let fiatToUsdRate = 1;
  if (baseCurrency.toUpperCase() !== 'USD') {
    const rates = await getFxRates(baseCurrency.toUpperCase(), ['USD']);
    fiatToUsdRate = rates['USD'] || 0;
    if (!fiatToUsdRate) throw new Error(`Cannot convert ${baseCurrency} -> USD`);
  }
  const usd = priceFiat * fiatToUsdRate;
  const sol = Math.round((usd / solPriceUsd) * 1e6) / 1e6; // round to 6 decimals
  return { sol, solPriceUsd, fiatToUsdRate };
}

export { getSolPriceFromCache };