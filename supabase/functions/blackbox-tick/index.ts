// BlackBox Aggregator Tick — single cron entry point.
// Runs every ~30s. Two responsibilities:
//   1) Pick up NEW telegram_channel_calls rows from the insiders_source
//      chat_id that don't yet have a blackbox_aggregator_runs row. For each,
//      create a run and post the CA into the blackbox_group via HoldersIntel.
//   2) Pick up RUNS with status='harvesting' and harvest_until <= now().
//      Fetch recent messages from blackbox_group via MTProto, filter for bot
//      replies that arrived after the CA post, parse each, then compose &
//      publish a digest into the output_channel.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseReply } from "../_shared/blackbox-parsers/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HARVEST_WINDOW_SEC = 90;
const SOLANA_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

async function sendViaHoldersIntel(chatId: number, text: string): Promise<number | null> {
  const token = Deno.env.get("TELEGRAM_HOLDERSINTEL_BOT_TOKEN");
  if (!token) { console.error("[blackbox-tick] no HoldersIntel token"); return null; }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  const j = await r.json();
  if (!r.ok || !j.ok) { console.error("[blackbox-tick] sendMessage failed", j); return null; }
  return j.result?.message_id ?? null;
}

// Post via MTProto (user account) — looks human to other bots so Phanes/Trojan/
// Rick/GMGN actually reply. Bot-sourced messages get ignored by most trader
// bots as anti-spam. Used ONLY for bait CA posts into blackbox_group.
async function sendViaMTProto(
  supabase: ReturnType<typeof createClient>,
  chatId: number,
  text: string,
): Promise<number | null> {
  try {
    const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
      body: { action: 'send_message', chatId, message: text },
    });
    if (error) { console.error('[blackbox-tick] MTProto invoke error', error); return null; }
    if (!data?.success) { console.error('[blackbox-tick] MTProto send failed', data); return null; }
    return data.messageId ?? null;
  } catch (e) {
    console.error('[blackbox-tick] MTProto exception', e);
    return null;
  }
}

function generateAsciiBar(pct: number): string {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * 10);
  return '▌'.repeat(filled).padEnd(10, ' ');
}

// Post the FULL Holders Report (same format as BaglessHoldersReport.tsx ->
// admin-notify). The bare-CA variant did NOT trigger trader bots; the full
// report format DOES (confirmed in production). We fetch the live report,
// build the message, and broadcast via admin-notify so it goes out from the
// HoldersIntel bot exactly like the working flow.
async function postFullHoldersReport(
  supabase: ReturnType<typeof createClient>,
  tokenMint: string,
): Promise<boolean> {
  try {
    const { data: report, error: reportErr } = await supabase.functions.invoke(
      'bagless-holders-report',
      { body: { tokenMint } },
    );
    if (reportErr || !report) {
      console.error('[blackbox-tick] bagless-holders-report failed', reportErr);
      return false;
    }

    const symbol = (report.symbol || report.tokenSymbol || '???').toString().toUpperCase();
    const totalHolders = Number(report.totalHolders || 0);
    const realHolders = Number(report.realHolders ?? totalHolders);
    const healthGrade = report.stabilityGrade || report.healthScore?.grade || 'N/A';

    const whaleCount = report.simpleTiers?.whales?.count || 0;
    const seriousCount = report.simpleTiers?.serious?.count || 0;
    const retailCount = report.simpleTiers?.retail?.count || 0;
    const dustCount = report.simpleTiers?.dust?.count ?? report.dustWallets ?? 0;

    const pct = (n: number) => totalHolders > 0 ? Math.round((n / totalHolders) * 100) : 0;
    const whalePct = pct(whaleCount);
    const seriousPct = pct(seriousCount);
    const retailPct = pct(retailCount);
    const dustPct = pct(dustCount);

    const message = `📊 *Holders Report Generated*\n\n` +
      `🪙 *${symbol}*\n` +
      `├ Total: ${totalHolders.toLocaleString()}\n` +
      `├ Real: ${realHolders.toLocaleString()}\n` +
      `└ Grade: ${healthGrade}\n\n` +
      `📈 Distribution\n` +
      `\`Whales  ${generateAsciiBar(whalePct)} ${whalePct.toString().padStart(2)}%\`\n` +
      `\`Serious ${generateAsciiBar(seriousPct)} ${seriousPct.toString().padStart(2)}%\`\n` +
      `\`Retail  ${generateAsciiBar(retailPct)} ${retailPct.toString().padStart(2)}%\`\n` +
      `\`Dust    ${generateAsciiBar(dustPct)} ${dustPct.toString().padStart(2)}%\`\n\n` +
      `🔗 blackbox.farm/holders?token=${tokenMint}`;

    const { error: notifyErr } = await supabase.functions.invoke('admin-notify', {
      body: {
        type: 'holder_report',
        title: `Holders Report: ${symbol}`,
        message,
        metadata: {
          tokenMint,
          totalHolders,
          realHolders,
          healthGrade,
        },
        channels: ['telegram'],
      },
    });
    if (notifyErr) {
      console.error('[blackbox-tick] admin-notify failed', notifyErr);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[blackbox-tick] postFullHoldersReport exception', e);
    return false;
  }
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number | null | undefined): string {
  return n == null ? '—' : `${n.toFixed(1)}%`;
}

function composeDigest(args: {
  mint: string;
  replies: Array<{ bot_username: string | null; parsed_jsonb: any; raw_text: string }>;
  native: any;
}): string {
  const { mint, replies, native } = args;
  const symbol = replies.map(r => r.parsed_jsonb?.symbol).find(Boolean) || native?.symbol || '???';
  // Consensus picks: median of available numeric values from all bots
  const pick = (k: string): number | null => {
    const vals = replies.map(r => r.parsed_jsonb?.[k]).filter((v: any) => typeof v === 'number' && isFinite(v));
    if (!vals.length) return null;
    vals.sort((a: number, b: number) => a - b);
    return vals[Math.floor(vals.length / 2)];
  };

  const mc = pick('market_cap_usd');
  const liq = pick('liquidity_usd');
  const vol = pick('volume_24h_usd');
  const top10 = pick('top10_holders_pct');
  const holders = pick('holders');
  const buyTax = pick('buy_tax_pct');
  const sellTax = pick('sell_tax_pct');

  const lines: string[] = [];
  lines.push(`🧬 $${symbol}`);
  lines.push(`CA: \`${mint}\``);
  lines.push('');
  lines.push('━━━ HOLDERSINTEL NATIVE ━━━');
  if (native?.creator_wallet) lines.push(`Dev: \`${native.creator_wallet}\``);
  if (native?.genealogy_kyc_root) lines.push(`KYC root: ${native.genealogy_kyc_root}`);
  if (native?.dev_reputation_score != null) lines.push(`Dev rep: ${native.dev_reputation_score}`);
  if (native?.prior_tickers?.length) lines.push(`Prior: ${native.prior_tickers.slice(0, 5).join(', ')}`);
  lines.push('');
  lines.push('━━━ MARKET (consensus) ━━━');
  lines.push(`MC: ${fmtMoney(mc)} · Liq: ${fmtMoney(liq)} · Vol: ${fmtMoney(vol)}`);
  lines.push(`Top10: ${fmtPct(top10)} · Holders: ${holders ?? '—'}`);
  lines.push(`Tax B/S: ${buyTax ?? '—'}/${sellTax ?? '—'}%`);
  lines.push('');
  lines.push('━━━ PER-BOT RAW ━━━');
  for (const r of replies) {
    const f = r.parsed_jsonb || {};
    const bits: string[] = [];
    if (f.market_cap_usd) bits.push(`MC ${fmtMoney(f.market_cap_usd)}`);
    if (f.liquidity_usd) bits.push(`Liq ${fmtMoney(f.liquidity_usd)}`);
    if (f.buy_tax_pct != null) bits.push(`B/S ${f.buy_tax_pct}/${f.sell_tax_pct}%`);
    if (f.top10_holders_pct != null) bits.push(`T10 ${fmtPct(f.top10_holders_pct)}`);
    if (f.holders != null) bits.push(`${f.holders} hodl`);
    lines.push(`🤖 @${r.bot_username || '?'}: ${bits.join(' · ') || '(no fields parsed)'}`);
  }
  return lines.join('\n').slice(0, 4000);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const summary = { created: 0, harvested: 0, published: 0, errors: [] as string[] };

  // Load channel config
  const { data: cfg } = await supabase
    .from('blackbox_channel_config')
    .select('role, chat_id')
    .eq('enabled', true);
  const insidersChat = cfg?.find(c => c.role === 'insiders_source')?.chat_id;
  const blackboxChat = cfg?.find(c => c.role === 'blackbox_group')?.chat_id;
  const outputChat   = cfg?.find(c => c.role === 'output_channel')?.chat_id;

  if (!insidersChat || !blackboxChat || !outputChat) {
    return new Response(JSON.stringify({ ok: false, error: 'channel config incomplete', cfg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // STEP 1: Pick up new CAs from insiders source
  try {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // last 10min
    const { data: calls } = await supabase
      .from('telegram_channel_calls')
      .select('id, message_id, token_mint, raw_message, message_timestamp')
      .gte('message_timestamp', cutoff)
      .not('token_mint', 'is', null)
      .order('message_timestamp', { ascending: false })
      .limit(50);

    for (const call of (calls || [])) {
      // Skip if we already have a run for this (mint, source_message_id)
      const { data: existing } = await supabase
        .from('blackbox_aggregator_runs')
        .select('id')
        .eq('token_mint', call.token_mint)
        .eq('source_message_id', call.message_id)
        .maybeSingle();
      if (existing) continue;

      const harvestUntil = new Date(Date.now() + HARVEST_WINDOW_SEC * 1000).toISOString();
      const { data: run, error: insErr } = await supabase
        .from('blackbox_aggregator_runs')
        .insert({
          token_mint: call.token_mint,
          source_chat_id: insidersChat,
          source_message_id: call.message_id,
          source_raw_text: call.raw_message,
          harvest_until: harvestUntil,
          status: 'pending',
        })
        .select('id')
        .single();
      if (insErr || !run) { summary.errors.push(`run insert: ${insErr?.message}`); continue; }

      // Post via MTProto using the same Holders Report formula that already
      // triggers trader bots in the working flow: report headline + holders URL.
      // Do NOT send raw insider text here.
      const postText = composeBlackboxTriggerPost(call.token_mint);
      let postedId = await sendViaMTProto(supabase, Number(blackboxChat), postText);
      if (!postedId) {
        // Fallback to HoldersIntel bot if MTProto unavailable; bots likely
        // won't reply but at least the CA hits the group.
        console.warn('[blackbox-tick] MTProto post failed, falling back to bot send');
        postedId = await sendViaHoldersIntel(Number(blackboxChat), postText);
      }
      await supabase.from('blackbox_aggregator_runs').update({
        ca_posted_at: new Date().toISOString(),
        ca_post_message_id: postedId,
        status: postedId ? 'harvesting' : 'failed',
        error_message: postedId ? null : 'CA post to BlackBox group failed',
      }).eq('id', run.id);
      summary.created++;
    }
  } catch (e: any) {
    summary.errors.push(`step1: ${e.message}`);
  }

  // STEP 2: Harvest + compose for runs whose window has elapsed
  try {
    const { data: ready } = await supabase
      .from('blackbox_aggregator_runs')
      .select('*')
      .eq('status', 'harvesting')
      .lte('harvest_until', new Date().toISOString())
      .limit(10);

    for (const run of (ready || [])) {
      // Fetch recent messages from BlackBox group via existing MTProto helper.
      // Note: MTProto fetch by numeric chat_id requires the channel to be in
      // telegram_channel_config with an entity_access_hash — fallback: try
      // username if stored in label. We pass chat_id as channelUsername; the
      // helper resolves both shapes.
      const channelIdent = String(blackboxChat);
      const { data: mt } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { action: 'fetch_recent_messages', channelUsername: channelIdent, limit: 100 },
      });
      const msgs: any[] = mt?.messages || [];
      const sinceMs = new Date(run.ca_posted_at || run.posted_at).getTime();
      const ownPostId = Number(run.ca_post_message_id || 0);
      const repliesRaw = msgs.filter(m => {
        const d = typeof m.date === 'number' ? (m.date < 1e12 ? m.date * 1000 : m.date) : new Date(m.date).getTime();
        const mid = Number(m.messageId || m.id || 0);
        const uname = (m.callerUsername || m.fromUsername || '').toLowerCase();
        // Skip our own bait post (by message_id) and any echo from HoldersIntel itself.
        if (ownPostId && mid === ownPostId) return false;
        if (uname === 'holdersintel_bot') return false;
        return d >= sinceMs && (m.text || '').includes(run.token_mint);
      });

      let saved = 0;
      for (const m of repliesRaw) {
        const username = m.callerUsername || null;
        const { parser, fields } = parseReply(username, m.text || '');
        const { error } = await supabase.from('blackbox_bot_replies').upsert({
          run_id: run.id,
          message_id: Number(m.messageId || m.id || 0),
          bot_username: username,
          raw_text: m.text || '',
          parsed_jsonb: fields,
          parser_used: parser,
        }, { onConflict: 'run_id,message_id' });
        if (!error) saved++;
      }

      // Passive parser-sample capture — dump verbatim copies of every reply
      // into blackbox_parser_samples so the parser-discovery harness has a
      // growing corpus from real Insiders runs (not just manual probes).
      try {
        await supabase.functions.invoke('blackbox-parser-probe', {
          body: {
            action: 'ingest',
            token_mint: run.token_mint,
            posted_at: run.ca_posted_at || run.posted_at,
            probe_run_id: run.id,
            messages: repliesRaw,
          },
        });
      } catch (e: any) {
        console.error('[blackbox-tick] passive sample dump failed', e?.message);
      }

      // Pull HoldersIntel native intel
      const { data: native } = await supabase
        .from('telegram_insider_token_lifecycle')
        .select('token_symbol, creator_wallet, genealogy_kyc_root, genealogy_chain')
        .eq('token_mint', run.token_mint)
        .maybeSingle();

      const { data: replies } = await supabase
        .from('blackbox_bot_replies')
        .select('bot_username, parsed_jsonb, raw_text')
        .eq('run_id', run.id);

      const digest = composeDigest({
        mint: run.token_mint,
        replies: replies || [],
        native: { ...(native || {}), symbol: native?.token_symbol },
      });

      const digestMsgId = await sendViaHoldersIntel(Number(outputChat), digest);
      await supabase.from('blackbox_aggregator_runs').update({
        status: digestMsgId ? 'published' : 'failed',
        digest_message_id: digestMsgId,
        digest_text: digest,
        replies_collected: saved,
        error_message: digestMsgId ? null : 'digest post failed',
      }).eq('id', run.id);
      summary.harvested++;
      if (digestMsgId) summary.published++;
    }
  } catch (e: any) {
    summary.errors.push(`step2: ${e.message}`);
  }

  return new Response(JSON.stringify({ ok: true, ...summary }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});