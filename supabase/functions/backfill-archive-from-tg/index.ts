import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TelegramClient, MemoryStorage } from "@mtcute/deno";
import { convertFromTelethonSession } from "@mtcute/convert";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Backfill holders_intel_post_queue archive rows from the actual
 * @HoldersIntel Telegram channel history.
 *
 * Strategy:
 *  - Pull a page of recent history via MTProto (mtcute).
 *  - Parse each message: mint (base58), tier counts, health grade/score,
 *    dust %, AI snippet, and the TG send timestamp.
 *  - Match each parsed msg to the nearest archive row by token_mint
 *    (closest by created_at, within ±7d).
 *  - In dryRun, just report. In apply, update only the requested fields:
 *    real_holders, total_wallets, whales_count, serious_count,
 *    retail_count, dust_count, dust_pct, health_grade, health_score,
 *    ai_snippet, manual_posted_at.
 *  - Banner/symbol/name/mint/hashtags are LEFT ALONE.
 */

type ParsedMsg = {
  messageId: number;
  date: string;
  mint: string | null;
  realHolders: number | null;
  totalWallets: number | null;
  whales: number | null;
  serious: number | null;
  retail: number | null;
  dust: number | null;
  dustPct: number | null;
  healthGrade: string | null;
  healthScore: number | null;
  aiSnippet: string | null;
  raw: string;
};

const BASE58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

function findMint(text: string): string | null {
  const matches = text.match(BASE58);
  if (!matches) return null;
  // Prefer the longest candidate (mints are 43-44)
  return matches.sort((a, b) => b.length - a.length)[0];
}

function num(m: RegExpMatchArray | null): number | null {
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseMessage(text: string, messageId: number, date: string): ParsedMsg {
  const mint = findMint(text);
  const realHolders = num(text.match(/✅\s*([\d,]+)\s*Real/i));
  const totalWallets =
    num(text.match(/📊\s*([\d,]+)\s*(?:Total|Wallets)/i)) ??
    num(text.match(/📊\s*([\d,]+)/));
  const whales = num(text.match(/🐋\s*([\d,]+)\s*Whales?/i));
  const serious = num(text.match(/😎\s*([\d,]+)\s*Serious/i));
  const retail = num(text.match(/(?:🔢|🧠|🌱|💼)\s*([\d,]+)\s*Retail/i));
  const dust =
    num(text.match(/(?:💨|🌫|🧹)\s*([\d,]+)\s*Dust/i)) ??
    num(text.match(/([\d,]+)\s*Dust\s*\(/i));
  const dustPct = num(text.match(/([\d.]+)\s*%\s*Dust/i));
  const grade = text.match(/Health:\s*([A-F][+-]?)/i);
  const score = text.match(/Health:\s*[A-F][+-]?\s*\((\d+)(?:\s*\/\s*100)?\)/i);

  // AI snippet: try a paragraph that talks about distribution/structure.
  // Take the longest non-list paragraph after the stats block, excluding
  // links, hashtags, and footer lines.
  let aiSnippet: string | null = null;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const paragraphs: string[] = [];
  let buf: string[] = [];
  for (const l of lines) {
    if (!l) {
      if (buf.length) {
        paragraphs.push(buf.join(" "));
        buf = [];
      }
    } else {
      buf.push(l);
    }
  }
  if (buf.length) paragraphs.push(buf.join(" "));

  const candidates = paragraphs
    .map((p) => p.trim())
    .filter((p) => {
      if (p.length < 80) return false;
      if (/^(\d|📊|✅|🐋|😎|🔢|🧠|🌱|💨|🌫|🧹|⚠|🚨|📣|👉|🔗|#|http|blackbox\.farm|t\.me|PADRE)/i.test(p))
        return false;
      if (/Wallets?\s*\|/i.test(p)) return false; // stats row
      if (/Health:/i.test(p)) return false;
      return true;
    });
  if (candidates.length) {
    aiSnippet = candidates.sort((a, b) => b.length - a.length)[0].slice(0, 600);
  }

  return {
    messageId,
    date,
    mint,
    realHolders,
    totalWallets,
    whales,
    serious,
    retail,
    dust,
    dustPct: dustPct != null ? Math.round(dustPct) : null,
    healthGrade: grade ? grade[1].toUpperCase() : null,
    healthScore: score ? Number(score[1]) : null,
    aiSnippet,
    raw: text,
  };
}

async function fetchChannelPage(opts: {
  sessionString: string;
  apiId: number;
  apiHash: string;
  channel: string;
  limit: number;
  offsetId?: number;
}): Promise<{ messages: ParsedMsg[]; oldestId: number | null }> {
  const mtcuteSession = convertFromTelethonSession(opts.sessionString);
  const client = new TelegramClient({
    apiId: opts.apiId,
    apiHash: opts.apiHash,
    storage: new MemoryStorage(),
  });

  try {
    await client.importSession(mtcuteSession);
    await client.connect();

    const params: any = { limit: opts.limit };
    if (opts.offsetId) params.offsetId = opts.offsetId;
    const raw: any[] = await client.getHistory(opts.channel, params);

    let oldestId: number | null = null;
    const parsed: ParsedMsg[] = [];
    for (const m of raw) {
      const id = Number(m.id);
      if (oldestId == null || id < oldestId) oldestId = id;
      const text: string = m.text || "";
      if (!text) continue;
      const date = m.date ? new Date(m.date * 1000).toISOString() : new Date().toISOString();
      parsed.push(parseMessage(text, id, date));
    }
    return { messages: parsed, oldestId };
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    // mode: 'sample' returns raw TG text only; 'dryrun' writes proposals to
    // holders_intel_backfill_proposals (no archive mutation); 'apply' is
    // handled client-side via direct supabase updates by super_admins.
    const mode: string = (body.mode || (body.dryRun === false ? "dryrun" : "dryrun")).toLowerCase();
    const dryRun: boolean = mode !== "apply"; // legacy: always treat as proposal-write
    const pages: number = Math.max(1, Math.min(30, Number(body.pages) || 5));
    const pageSize: number = Math.max(20, Math.min(100, Number(body.pageSize) || 100));
    const channel: string = body.channel || "HoldersIntel";
    let offsetId: number | undefined = body.offsetId ? Number(body.offsetId) : undefined;
    const matchWindowDays: number = Math.max(1, Math.min(60, Number(body.matchWindowDays) || 7));
    const sampleN: number = Math.max(1, Math.min(20, Number(body.sampleN) || 5));

    const apiIdRaw = Deno.env.get("TELEGRAM_API_ID");
    const apiHash = Deno.env.get("TELEGRAM_API_HASH");
    const sessionString = Deno.env.get("TELEGRAM_SESSION_STRING");
    if (!apiIdRaw || !apiHash || !sessionString) {
      throw new Error("Missing Telegram MTProto secrets");
    }
    const apiId = Number(apiIdRaw);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // SAMPLE MODE — just dump raw TG text so we can fix the parser
    if (mode === "sample") {
      const page = await fetchChannelPage({
        sessionString, apiId, apiHash, channel,
        limit: Math.max(sampleN, 20),
        offsetId,
      });
      const samples = page.messages.slice(0, sampleN).map((m) => ({
        messageId: m.messageId,
        date: m.date,
        mintFound: m.mint,
        rawText: m.raw,
      }));
      return new Response(JSON.stringify({
        ok: true, mode, samples, nextOffsetId: page.oldestId,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load all archive rows once (id, mint, created_at)
    const archive: { id: string; token_mint: string; created_at: string }[] = [];
    {
      const pageSizeDb = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("holders_intel_post_queue")
          .select("id, token_mint, created_at")
          .not("tweet_text", "is", null)
          .order("created_at", { ascending: false })
          .range(from, from + pageSizeDb - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        archive.push(...(data as any));
        if (data.length < pageSizeDb) break;
        from += pageSizeDb;
      }
    }
    const byMint = new Map<string, { id: string; created_at: string }[]>();
    for (const r of archive) {
      const arr = byMint.get(r.token_mint) || [];
      arr.push({ id: r.id, created_at: r.created_at });
      byMint.set(r.token_mint, arr);
    }

    const allParsed: ParsedMsg[] = [];
    let lastOldest: number | null = null;
    for (let p = 0; p < pages; p++) {
      const page = await fetchChannelPage({
        sessionString,
        apiId,
        apiHash,
        channel,
        limit: pageSize,
        offsetId,
      });
      if (page.messages.length === 0) break;
      allParsed.push(...page.messages);
      lastOldest = page.oldestId;
      if (!page.oldestId) break;
      offsetId = page.oldestId;
      console.log(
        `[backfill-archive-from-tg] page ${p + 1}/${pages}: got ${page.messages.length} msgs, oldestId=${page.oldestId}`
      );
    }

    const proposals: any[] = [];
    let proposalsWritten = 0;
    let skippedNoMint = 0;
    let skippedNoMatch = 0;
    let skippedNoStats = 0;
    let skippedDuplicate = 0;

    for (const m of allParsed) {
      if (!m.mint) {
        skippedNoMint++;
        continue;
      }
      const candidates = byMint.get(m.mint);
      if (!candidates || candidates.length === 0) {
        skippedNoMatch++;
        continue;
      }
      // Pick the archive row whose created_at is closest to the TG msg date
      const tgT = new Date(m.date).getTime();
      let best = candidates[0];
      let bestDiff = Math.abs(new Date(best.created_at).getTime() - tgT);
      for (const c of candidates.slice(1)) {
        const d = Math.abs(new Date(c.created_at).getTime() - tgT);
        if (d < bestDiff) {
          bestDiff = d;
          best = c;
        }
      }
      if (bestDiff > matchWindowDays * 24 * 60 * 60 * 1000) {
        skippedNoMatch++;
        continue;
      }

      const patch: Record<string, any> = {};
      if (m.realHolders != null) patch.real_holders = m.realHolders;
      if (m.totalWallets != null) patch.total_wallets = m.totalWallets;
      if (m.whales != null) patch.whales_count = m.whales;
      if (m.serious != null) patch.serious_count = m.serious;
      if (m.retail != null) patch.retail_count = m.retail;
      if (m.dust != null) patch.dust_count = m.dust;
      if (m.dustPct != null) patch.dust_pct = m.dustPct;
      if (m.healthGrade) patch.health_grade = m.healthGrade;
      if (m.healthScore != null) patch.health_score = m.healthScore;
      if (m.aiSnippet) patch.ai_snippet = m.aiSnippet;
      patch.manual_posted_at = m.date;

      // Require at least one stats field to consider it a real holder-intel post
      const hasStats =
        patch.total_wallets != null ||
        patch.real_holders != null ||
        patch.whales_count != null;
      if (!hasStats) {
        skippedNoStats++;
        continue;
      }

      proposals.push({
        archiveId: best.id,
        mint: m.mint,
        messageId: m.messageId,
        tgDate: m.date,
        diffHours: +(bestDiff / 3600000).toFixed(1),
        patch,
      });

      // Always write proposals to the review queue (idempotent via UNIQUE).
      // Capture before snapshot of the current archive row.
      const { data: beforeRow, error: beforeErr } = await supabase
        .from("holders_intel_post_queue")
        .select("real_holders,total_wallets,whales_count,serious_count,retail_count,dust_count,dust_pct,health_grade,health_score,ai_snippet,manual_posted_at")
        .eq("id", best.id)
        .maybeSingle();
      if (beforeErr) {
        console.warn(`[backfill] before-snapshot failed for ${best.id}: ${beforeErr.message}`);
        continue;
      }
      const afterRow = { ...(beforeRow || {}), ...patch };
      const { error: upErr } = await supabase
        .from("holders_intel_backfill_proposals")
        .upsert({
          archive_id: best.id,
          token_mint: m.mint,
          tg_message_id: m.messageId,
          tg_message_date: m.date,
          tg_raw_text: m.raw,
          match_diff_hours: +(bestDiff / 3600000).toFixed(2),
          before_json: beforeRow || {},
          after_json: afterRow,
          patch_json: patch,
          status: "pending",
        }, { onConflict: "archive_id,tg_message_id" });
      if (upErr) {
        if (/duplicate/i.test(upErr.message)) skippedDuplicate++;
        else console.warn(`[backfill] proposal insert failed: ${upErr.message}`);
      } else {
        proposalsWritten++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        mode,
        dryRun,
        channel,
        pagesRequested: pages,
        pageSize,
        msgsScanned: allParsed.length,
        proposals: proposals.length,
        proposalsWritten,
        skippedNoMint,
        skippedNoMatch,
        skippedNoStats,
        skippedDuplicate,
        nextOffsetId: lastOldest,
        sample: proposals.slice(0, 5),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[backfill-archive-from-tg] error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});