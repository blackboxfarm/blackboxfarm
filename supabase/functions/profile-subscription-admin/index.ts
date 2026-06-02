// Per-profile subscription bot self-serve admin.
// Actions: secret_status, set_secret, cron_status, cron_install, cron_toggle,
//          webhook_status, webhook_register, test_bot, run_setup
// Super-admin only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { Keypair, Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from 'npm:@solana/web3.js@1.87.6';
import bs58 from 'https://esm.sh/bs58@5.0.0';
import { SecureStorage } from '../_shared/encryption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROJECT_REF = Deno.env.get('SUPABASE_PROJECT_ID') ?? 'apxauapuusmgwbbzjgfl';
const MGMT_BASE = `https://api.supabase.com/v1/projects/${PROJECT_REF}`;
const FUNCTIONS_BASE = `https://${PROJECT_REF}.supabase.co/functions/v1`;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function mgmtToken(): string {
  const t = Deno.env.get('SB_ACCESS_TOKEN');
  if (!t) throw new Error('SB_ACCESS_TOKEN not configured');
  return t;
}

async function mgmt(path: string, init: RequestInit = {}) {
  const r = await fetch(`${MGMT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${mgmtToken()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const txt = await r.text();
  let parsed: unknown = txt;
  try { parsed = JSON.parse(txt); } catch { /* keep text */ }
  if (!r.ok) throw new Error(`Management API ${path} failed [${r.status}]: ${txt}`);
  return parsed;
}

async function runSql(query: string): Promise<unknown> {
  return mgmt('/database/query', { method: 'POST', body: JSON.stringify({ query }) });
}

async function handleAffiliateStats(profileKey: string, supabase: any) {
  if (!profileKey) throw new Error('profile_key required');
  const { data: codes } = await supabase
    .from('referral_codes')
    .select('telegram_user_id, code, status, created_at')
    .eq('profile_key', profileKey);
  const { data: credits } = await supabase
    .from('referral_credits')
    .select('referrer_telegram_user_id, months_granted, new_expires_at, created_at')
    .eq('profile_key', profileKey);
  const { data: attrs } = await supabase
    .from('referral_attributions')
    .select('referrer_telegram_user_id, status')
    .eq('profile_key', profileKey);

  const byUser = new Map<number, any>();
  for (const c of codes ?? []) {
    byUser.set(Number(c.telegram_user_id), {
      telegram_user_id: Number(c.telegram_user_id),
      code: c.code, status: c.status, created_at: c.created_at,
      attributions: 0, converted: 0, pending: 0, rejected: 0, expired: 0,
      months_earned: 0, latest_credit_at: null as string | null,
    });
  }
  for (const a of attrs ?? []) {
    const u = byUser.get(Number(a.referrer_telegram_user_id));
    if (!u) continue;
    u.attributions++;
    if (a.status === 'converted') u.converted++;
    else if (a.status === 'pending') u.pending++;
    else if (a.status === 'rejected') u.rejected++;
    else if (a.status === 'expired') u.expired++;
  }
  for (const c of credits ?? []) {
    const u = byUser.get(Number(c.referrer_telegram_user_id));
    if (!u) continue;
    u.months_earned += Number(c.months_granted || 0);
    if (!u.latest_credit_at || c.created_at > u.latest_credit_at) u.latest_credit_at = c.created_at;
  }
  const rows = Array.from(byUser.values()).sort((a, b) => b.months_earned - a.months_earned || b.converted - a.converted);
  const totals = {
    total_codes: rows.length,
    active_codes: rows.filter(r => r.status === 'active').length,
    total_attributions: (attrs ?? []).length,
    total_converted: rows.reduce((s, r) => s + r.converted, 0),
    total_pending: rows.reduce((s, r) => s + r.pending, 0),
    total_months_granted: rows.reduce((s, r) => s + r.months_earned, 0),
  };
  return { ok: true, totals, rows };
}

async function listSecrets(): Promise<Array<{ name: string; value?: string }>> {
  return (await mgmt('/secrets')) as Array<{ name: string }>;
}

async function upsertSecret(name: string, value: string) {
  return mgmt('/secrets', { method: 'POST', body: JSON.stringify([{ name, value }]) });
}

// ---------- Telegram ----------
async function tg(token: string, method: string, body: Record<string, unknown> = {}) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(`Telegram ${method} [${r.status}]: ${JSON.stringify(j)}`);
  return j.result;
}

async function webhookSecret(botToken: string): Promise<string> {
  const data = new TextEncoder().encode(`profile-sub-webhook:${botToken}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Cron job names ----------
const POLL_JOB = (profileKey: string) => `profile-sub-poll-${profileKey}`;
const RENEW_JOB = (profileKey: string) => `profile-sub-renew-${profileKey}`;
const POLL_URL = `${FUNCTIONS_BASE}/profile-subscription-poll`;
const RENEW_URL = `${FUNCTIONS_BASE}/profile-subscription-renewal-tick`;

function cronScheduleSql(jobname: string, schedule: string, url: string): string {
  // unschedule if exists, then schedule fresh (idempotent)
  const safeJob = jobname.replace(/'/g, "''");
  const safeSched = schedule.replace(/'/g, "''");
  const safeUrl = url.replace(/'/g, "''");
  const safeAnon = ANON_KEY.replace(/'/g, "''");
  return `
    DO $cron$
    DECLARE
      jid bigint;
    BEGIN
      SELECT jobid INTO jid FROM cron.job WHERE jobname = '${safeJob}';
      IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
      PERFORM cron.schedule(
        '${safeJob}',
        '${safeSched}',
        $sql$ SELECT net.http_post(
          url := '${safeUrl}',
          headers := '{"Content-Type":"application/json","apikey":"${safeAnon}","Authorization":"Bearer ${safeAnon}"}'::jsonb,
          body := '{}'::jsonb
        ); $sql$
      );
    END $cron$;
  `;
}

// ---------- Handlers ----------

async function handleSecretStatus(secretName: string, _supabase: any) {
  if (!secretName) return { exists: false };
  const secrets = await listSecrets();
  const hit = secrets.find(s => s.name === secretName);
  return { exists: !!hit };
}

async function handleSetSecret(secretName: string, value: string) {
  if (!secretName || !value) throw new Error('secret name and value required');
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,255}$/.test(secretName)) throw new Error('Invalid secret name');
  await upsertSecret(secretName, value);
  return { ok: true };
}

async function handleTestBot(botToken: string) {
  const me = await tg(botToken, 'getMe');
  return { ok: true, bot: { id: me.id, username: me.username, first_name: me.first_name } };
}

async function handleCronStatus(profileKey: string) {
  const sql = `SELECT jobname, schedule, active FROM cron.job WHERE jobname IN ('${POLL_JOB(profileKey)}','${RENEW_JOB(profileKey)}');`;
  const rows = await runSql(sql) as Array<{ jobname: string; schedule: string; active: boolean }>;
  const find = (n: string) => rows.find(r => r.jobname === n);
  return {
    poll: find(POLL_JOB(profileKey)) ?? null,
    renew: find(RENEW_JOB(profileKey)) ?? null,
  };
}

async function handleCronInstall(profileKey: string) {
  await runSql(cronScheduleSql(POLL_JOB(profileKey), '* * * * *', POLL_URL));
  await runSql(cronScheduleSql(RENEW_JOB(profileKey), '*/10 * * * *', RENEW_URL));
  return handleCronStatus(profileKey);
}

async function handleCronToggle(profileKey: string, which: 'poll' | 'renew', active: boolean) {
  const jobname = which === 'poll' ? POLL_JOB(profileKey) : RENEW_JOB(profileKey);
  await runSql(`UPDATE cron.job SET active = ${active ? 'true' : 'false'} WHERE jobname = '${jobname.replace(/'/g, "''")}';`);
  return handleCronStatus(profileKey);
}

async function handleWebhookStatus(botToken: string) {
  const info = await tg(botToken, 'getWebhookInfo');
  return { info };
}

async function handleWebhookRegister(botToken: string, profileKey: string) {
  const url = `${FUNCTIONS_BASE}/profile-subscription-bot-webhook?profile=${encodeURIComponent(profileKey)}`;
  const secret_token = await webhookSecret(botToken);
  const res = await tg(botToken, 'setWebhook', {
    url,
    secret_token,
    allowed_updates: ['message', 'edited_message', 'callback_query', 'chat_member', 'my_chat_member'],
  });
  const info = await tg(botToken, 'getWebhookInfo');
  return { ok: true, set: res, info };
}

// ---------- Contacts CRM ----------

interface ContactFilter {
  paid?: 'any' | 'paid_now' | 'ever_paid' | 'never_paid';
  source?: 'any' | 'organic' | 'referral' | 'unknown';
  referrer_only?: boolean;
  search?: string;
  include_opted_out?: boolean;
  limit?: number;
  offset?: number;
}

function applyContactFilter(q: any, profileKey: string, f: ContactFilter) {
  q = q.eq('profile_key', profileKey);
  if (!f.include_opted_out) q = q.eq('opted_out_broadcasts', false);
  switch (f.paid) {
    case 'paid_now': q = q.eq('is_currently_paid', true); break;
    case 'ever_paid': q = q.eq('ever_paid', true); break;
    case 'never_paid': q = q.eq('ever_paid', false); break;
  }
  switch (f.source) {
    case 'organic':
    case 'referral':
    case 'unknown':
      q = q.eq('acquisition_source', f.source); break;
  }
  if (f.referrer_only) q = q.eq('has_referral_code', true);
  if (f.search) {
    const s = f.search.replace(/[%_]/g, '\\$&');
    q = q.or(`telegram_username.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`);
  }
  return q;
}

async function handleContactsList(profileKey: string, body: any, supabase: any) {
  if (!profileKey) throw new Error('profile_key required');
  const filter: ContactFilter = body.filter ?? {};
  const limit = Math.min(Math.max(Number(filter.limit ?? 100), 1), 1000);
  const offset = Math.max(Number(filter.offset ?? 0), 0);

  let countQ = supabase.from('profile_bot_contacts').select('id', { count: 'exact', head: true });
  countQ = applyContactFilter(countQ, profileKey, filter);
  const { count } = await countQ;

  let q = supabase.from('profile_bot_contacts').select('*');
  q = applyContactFilter(q, profileKey, filter);
  const { data, error } = await q
    .order('last_seen_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  // High-level segments
  const { data: segs } = await supabase.from('profile_bot_contacts')
    .select('acquisition_source, ever_paid, is_currently_paid, opted_out_broadcasts, has_referral_code')
    .eq('profile_key', profileKey);
  const totals = {
    all: segs?.length ?? 0,
    organic: (segs ?? []).filter((x: any) => x.acquisition_source === 'organic').length,
    referral: (segs ?? []).filter((x: any) => x.acquisition_source === 'referral').length,
    unknown: (segs ?? []).filter((x: any) => x.acquisition_source === 'unknown').length,
    ever_paid: (segs ?? []).filter((x: any) => x.ever_paid).length,
    paid_now: (segs ?? []).filter((x: any) => x.is_currently_paid).length,
    referrers: (segs ?? []).filter((x: any) => x.has_referral_code).length,
    opted_out: (segs ?? []).filter((x: any) => x.opted_out_broadcasts).length,
  };

  return { ok: true, totals, matched: count ?? 0, rows: data ?? [], limit, offset };
}

async function handleContactsBroadcast(profileKey: string, body: any, supabase: any) {
  if (!profileKey) throw new Error('profile_key required');
  const text = String(body.text ?? '').trim();
  if (!text) throw new Error('text required');
  if (text.length > 4000) throw new Error('text too long (max 4000 chars)');
  const filter: ContactFilter = body.filter ?? {};
  const dryRun = body.confirm !== true;
  const parseMode = body.parse_mode ?? 'HTML';

  // Resolve audience
  let q = supabase.from('profile_bot_contacts').select('telegram_user_id, telegram_username');
  q = applyContactFilter(q, profileKey, { ...filter, limit: 10000, offset: 0 });
  const { data: recipients, error } = await q.limit(10000);
  if (error) throw error;

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      recipient_count: recipients?.length ?? 0,
      sample: (recipients ?? []).slice(0, 5).map((r: any) => r.telegram_username ?? r.telegram_user_id),
      preview: text,
      note: 'Re-send with confirm: true to actually send.',
    };
  }

  // Resolve bot token
  const { data: cfg } = await supabase
    .from('profile_subscription_configs')
    .select('bot_secret_name')
    .eq('profile_key', profileKey)
    .maybeSingle();
  if (!cfg?.bot_secret_name) throw new Error('bot_secret_name not configured');
  const token = Deno.env.get(cfg.bot_secret_name);
  if (!token) throw new Error(`Secret ${cfg.bot_secret_name} not loaded in runtime`);

  const broadcastId = crypto.randomUUID();
  let sent = 0, failed = 0;
  const errors: Array<{ tg: number; err: string }> = [];
  const nowIso = new Date().toISOString();

  // Telegram global cap ~30 msgs/sec across different chats. We pace to ~25/sec.
  for (const r of recipients ?? []) {
    try {
      await tg(token, 'sendMessage', {
        chat_id: r.telegram_user_id,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      });
      sent++;
      await supabase.from('profile_bot_contacts')
        .update({ last_broadcast_at: nowIso })
        .eq('profile_key', profileKey)
        .eq('telegram_user_id', r.telegram_user_id);
      await supabase.from('profile_bot_contact_events').insert({
        profile_key: profileKey,
        telegram_user_id: r.telegram_user_id,
        event_type: 'broadcast_sent',
        payload: { broadcast_id: broadcastId, chars: text.length },
      });
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ tg: r.telegram_user_id, err: msg.slice(0, 200) });
    }
    await new Promise((res) => setTimeout(res, 40));
  }

  return {
    ok: true,
    dry_run: false,
    broadcast_id: broadcastId,
    recipient_count: recipients?.length ?? 0,
    sent,
    failed,
    errors: errors.slice(0, 20),
  };
}

// ---------- Treasury (Central Wallet) ----------

const FEE_BUFFER_LAMPORTS = 15_000;

function getTreasuryRpc(): Connection {
  const apiKey = Deno.env.get('HELIUS_API_KEY');
  const url = apiKey
    ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
    : 'https://api.mainnet-beta.solana.com';
  return new Connection(url, 'confirmed');
}

function isValidPubkey(s: string): boolean {
  try { new PublicKey(s); return true; } catch { return false; }
}

async function handleTreasuryStatus(profileKey: string, cfg: any) {
  if (!profileKey) throw new Error('profile_key required');
  if (!cfg) throw new Error('Profile config not found');
  const pubkey = cfg.central_wallet_pubkey as string | null;
  const managed = !!cfg.central_wallet_secret_encrypted;
  let balance_lamports = 0;
  if (pubkey) {
    try {
      balance_lamports = await getTreasuryRpc().getBalance(new PublicKey(pubkey));
    } catch (e) {
      return {
        ok: true, pubkey, managed, balance_lamports: 0,
        label: cfg.central_wallet_label ?? null,
        generated_at: cfg.central_wallet_generated_at ?? null,
        balance_error: e instanceof Error ? e.message : String(e),
      };
    }
  }
  return {
    ok: true,
    pubkey,
    managed,
    label: cfg.central_wallet_label ?? null,
    generated_at: cfg.central_wallet_generated_at ?? null,
    balance_lamports,
    balance_sol: balance_lamports / LAMPORTS_PER_SOL,
    fee_buffer_lamports: FEE_BUFFER_LAMPORTS,
  };
}

async function handleTreasuryGenerate(profileKey: string, cfg: any, supabase: any) {
  if (!profileKey) throw new Error('profile_key required');
  if (!cfg) throw new Error('Profile config not found');
  if (cfg.central_wallet_pubkey) {
    throw new Error('Central wallet already set for this profile. Refusing to overwrite.');
  }
  const kp = Keypair.generate();
  const secretB58 = bs58.encode(kp.secretKey);
  const encrypted = await SecureStorage.encrypt(secretB58);
  const pubkey = kp.publicKey.toBase58();
  const label = `${profileKey} Treasury`;
  const generated_at = new Date().toISOString();
  const { error } = await supabase
    .from('profile_subscription_configs')
    .update({
      central_wallet_pubkey: pubkey,
      central_wallet_secret_encrypted: encrypted,
      central_wallet_generated_at: generated_at,
      central_wallet_label: label,
    })
    .eq('profile_key', profileKey);
  if (error) throw error;
  return { ok: true, pubkey, label, generated_at, managed: true };
}

async function handleTreasuryTransactions(cfg: any, limit: number) {
  if (!cfg?.central_wallet_pubkey) throw new Error('No central wallet configured');
  const n = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const conn = getTreasuryRpc();
  const pk = new PublicKey(cfg.central_wallet_pubkey);
  const sigs = await conn.getSignaturesForAddress(pk, { limit: n });
  // Parse transfers cheaply – just expose what we have from sig listings.
  // Resolve net SOL delta per tx via getParsedTransactions in one batch.
  const txList = await conn.getParsedTransactions(
    sigs.map(s => s.signature),
    { maxSupportedTransactionVersion: 0 },
  );
  const owner = cfg.central_wallet_pubkey as string;
  const rows = sigs.map((s, i) => {
    const tx = txList[i];
    let net_lamports = 0;
    let counterparty: string | null = null;
    if (tx?.meta && tx.transaction.message.accountKeys) {
      const keys = tx.transaction.message.accountKeys.map((k: any) => k.pubkey?.toBase58?.() ?? String(k.pubkey ?? k));
      const idx = keys.indexOf(owner);
      if (idx >= 0 && tx.meta.preBalances && tx.meta.postBalances) {
        net_lamports = tx.meta.postBalances[idx] - tx.meta.preBalances[idx];
      }
      // Pick first non-self key as counterparty hint
      counterparty = keys.find((k: string) => k !== owner) ?? null;
    }
    return {
      signature: s.signature,
      slot: s.slot,
      block_time: s.blockTime,
      err: s.err ? 'failed' : null,
      net_lamports,
      net_sol: net_lamports / LAMPORTS_PER_SOL,
      direction: net_lamports >= 0 ? 'in' : 'out',
      counterparty,
    };
  });
  return { ok: true, transactions: rows };
}

async function handleTreasuryWithdraw(
  profileKey: string, cfg: any, body: any, supabase: any, requestedBy: string,
) {
  if (!profileKey) throw new Error('profile_key required');
  if (!cfg?.central_wallet_pubkey) throw new Error('No central wallet configured');
  if (!cfg?.central_wallet_secret_encrypted) {
    throw new Error('This central wallet is externally owned; withdraw must happen from the source wallet.');
  }
  const destination: string = String(body.destination_pubkey ?? '').trim();
  if (!isValidPubkey(destination)) throw new Error('Invalid destination pubkey');
  if (body.confirm !== true) throw new Error('confirm:true required to send');

  const conn = getTreasuryRpc();
  const fromKp = Keypair.fromSecretKey(bs58.decode(await SecureStorage.decrypt(cfg.central_wallet_secret_encrypted)));
  const fromPubkey = fromKp.publicKey.toBase58();
  if (fromPubkey !== cfg.central_wallet_pubkey) {
    throw new Error('Encrypted key does not match stored pubkey — refusing to send');
  }

  const balance = await conn.getBalance(fromKp.publicKey);
  let lamports: number;
  if (body.amount === 'all' || body.amount_sol === 'all') {
    lamports = balance - FEE_BUFFER_LAMPORTS;
  } else {
    const sol = Number(body.amount_sol);
    if (!Number.isFinite(sol) || sol <= 0) throw new Error('amount_sol must be > 0 or "all"');
    lamports = Math.floor(sol * LAMPORTS_PER_SOL);
  }
  if (lamports <= 0) throw new Error('Amount after fee buffer is <= 0');
  if (lamports > balance - FEE_BUFFER_LAMPORTS) {
    throw new Error(`Amount exceeds spendable balance (have ${balance} lamports, need ${lamports + FEE_BUFFER_LAMPORTS} incl. buffer)`);
  }

  // Pre-insert audit row
  const { data: auditRow, error: auditErr } = await supabase
    .from('profile_central_wallet_withdrawals')
    .insert({
      profile_key: profileKey,
      from_pubkey: fromPubkey,
      to_pubkey: destination,
      lamports,
      requested_by: requestedBy,
      status: 'pending',
    })
    .select('id')
    .single();
  if (auditErr) throw auditErr;
  const auditId = auditRow.id as string;

  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKp.publicKey,
        toPubkey: new PublicKey(destination),
        lamports,
      }),
    );
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromKp.publicKey;
    tx.sign(fromKp);
    const signature = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(signature, 'confirmed');
    await supabase
      .from('profile_central_wallet_withdrawals')
      .update({ signature, status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', auditId);
    return { ok: true, signature, lamports, sol: lamports / LAMPORTS_PER_SOL, audit_id: auditId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from('profile_central_wallet_withdrawals')
      .update({ status: 'failed', error: msg.slice(0, 1000) })
      .eq('id', auditId);
    throw new Error(`Withdraw failed: ${msg}`);
  }
}

async function handleTreasuryWithdrawals(profileKey: string, supabase: any) {
  if (!profileKey) throw new Error('profile_key required');
  const { data, error } = await supabase
    .from('profile_central_wallet_withdrawals')
    .select('*')
    .eq('profile_key', profileKey)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return { ok: true, rows: data ?? [] };
}

// ---------- Entry ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing bearer token' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401);
  const { data: isSuperAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'super_admin' });
  if (!isSuperAdmin) return json({ error: 'Super admin only' }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const action: string = body.action;
  const profileKey: string = body.profile_key;

  try {
    // Load config (most actions need it)
    let cfg: any = null;
    if (profileKey) {
      const { data } = await supabase
        .from('profile_subscription_configs')
        .select('*')
        .eq('profile_key', profileKey)
        .maybeSingle();
      cfg = data;
    }
    const getBotToken = (): string => {
      if (!cfg?.bot_secret_name) throw new Error('Configure bot_secret_name first');
      const t = Deno.env.get(cfg.bot_secret_name);
      if (!t) throw new Error(`Secret ${cfg.bot_secret_name} not set on this edge function (deploy will pick it up automatically after Set Token)`);
      return t;
    };

    switch (action) {
      case 'secret_status':
        return json(await handleSecretStatus(body.secret_name ?? cfg?.bot_secret_name, supabase));

      case 'set_secret':
        return json(await handleSetSecret(body.secret_name ?? cfg?.bot_secret_name, body.value));

      case 'test_bot':
        return json(await handleTestBot(body.token ?? getBotToken()));

      case 'cron_status':
        return json(await handleCronStatus(profileKey));

      case 'cron_install':
        return json(await handleCronInstall(profileKey));

      case 'cron_toggle':
        return json(await handleCronToggle(profileKey, body.which, !!body.active));

      case 'webhook_status':
        return json(await handleWebhookStatus(body.token ?? getBotToken()));

      case 'webhook_register':
        return json(await handleWebhookRegister(body.token ?? getBotToken(), profileKey));

      case 'affiliate_stats':
        return json(await handleAffiliateStats(profileKey, supabase));

      case 'contacts_list':
        return json(await handleContactsList(profileKey, body, supabase));

      case 'contacts_broadcast':
        return json(await handleContactsBroadcast(profileKey, body, supabase));

      case 'treasury_status':
        return json(await handleTreasuryStatus(profileKey, cfg));

      case 'treasury_generate':
        return json(await handleTreasuryGenerate(profileKey, cfg, supabase));

      case 'treasury_transactions':
        return json(await handleTreasuryTransactions(cfg, Number(body.limit ?? 25)));

      case 'treasury_withdraw':
        return json(await handleTreasuryWithdraw(profileKey, cfg, body, supabase, user.id));

      case 'treasury_withdrawals':
        return json(await handleTreasuryWithdrawals(profileKey, supabase));

      case 'run_setup': {
        const steps: Array<{ name: string; ok: boolean; detail?: string }> = [];
        // 1) config sanity
        const missing: string[] = [];
        if (!cfg) missing.push('config row');
        if (!cfg?.bot_secret_name) missing.push('bot_secret_name');
        if (!cfg?.private_chat_id) missing.push('private_chat_id');
        steps.push({ name: 'Config saved', ok: missing.length === 0, detail: missing.length ? `Missing: ${missing.join(', ')}` : undefined });
        if (missing.length) return json({ ok: false, steps });

        // 2) secret exists
        const sec = await handleSecretStatus(cfg.bot_secret_name, supabase);
        steps.push({ name: 'Bot token stored', ok: sec.exists });
        if (!sec.exists) return json({ ok: false, steps });

        // 3) token live (only if it's in *this* runtime; if not, instruct redeploy)
        const runtimeToken = Deno.env.get(cfg.bot_secret_name);
        if (!runtimeToken) {
          steps.push({ name: 'Bot token loaded in runtime', ok: false, detail: 'Secret stored but not yet injected; re-run setup in ~10s.' });
          return json({ ok: false, steps });
        }
        try {
          const me = await tg(runtimeToken, 'getMe');
          steps.push({ name: 'Telegram getMe', ok: true, detail: `@${me.username}` });
        } catch (e) {
          steps.push({ name: 'Telegram getMe', ok: false, detail: e instanceof Error ? e.message : String(e) });
          return json({ ok: false, steps });
        }

        // 4) crons
        try {
          await handleCronInstall(profileKey);
          steps.push({ name: 'Crons installed (poll 1m + renew 10m)', ok: true });
        } catch (e) {
          steps.push({ name: 'Crons installed', ok: false, detail: e instanceof Error ? e.message : String(e) });
        }

        // 5) webhook
        try {
          const wr = await handleWebhookRegister(runtimeToken, profileKey);
          steps.push({ name: 'Webhook registered', ok: true, detail: wr.info?.url });
        } catch (e) {
          steps.push({ name: 'Webhook registered', ok: false, detail: e instanceof Error ? e.message : String(e) });
        }

        // 6) self-test DM
        if (cfg.admin_telegram_id) {
          try {
            await tg(runtimeToken, 'sendMessage', {
              chat_id: cfg.admin_telegram_id,
              text: `✅ <b>${cfg.display_name ?? profileKey}</b> bot is live.\nSetup completed ${new Date().toUTCString()}.`,
              parse_mode: 'HTML',
            });
            steps.push({ name: 'Self-test DM sent', ok: true });
          } catch (e) {
            steps.push({ name: 'Self-test DM sent', ok: false, detail: e instanceof Error ? e.message : String(e) });
          }
        } else {
          steps.push({ name: 'Self-test DM sent', ok: true, detail: 'Skipped (no admin_telegram_id)' });
        }

        return json({ ok: steps.every(s => s.ok), steps });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error('[profile-subscription-admin]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});