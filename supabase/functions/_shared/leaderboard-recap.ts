// Shared helpers for leaderboard recap captions + Telegram pin/unpin.

export type RecapCadence = 'daily' | 'weekly' | 'monthly';

export type RecapEntry = {
  ticker?: string;
  token_symbol?: string;
  multiplier?: number;
  called_at_mcap?: number;
  ath_mcap?: number;
};

function fmtMcap(n: number | null | undefined): string {
  if (!n || !isFinite(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function fmtMult(m: number | null | undefined): string {
  if (!m || !isFinite(m)) return '—';
  if (m >= 10) return `${Math.round(m)}x`;
  return `${m.toFixed(1)}x`;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[*_`\[\]()~>#+=|{}.!-]/g, (c) => `\\${c}`);
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Builds an information-heavy caption whose FIRST line is self-explanatory
 * so Telegram's pin-preview shows the point of the post.
 * Uses plain text + light Markdown (the no-lube-push fallback strips Markdown
 * if it fails to parse, so we keep it minimal).
 */
export function buildRecapCaption(opts: {
  cadence: RecapCadence;
  brand: string;            // e.g. "NO LUBE"  or  "PREMIUM INSIDERS"
  size: number;             // 10 / 20 / 25
  dateLabel: string;        // "2026-06-01" or "May 26 → Jun 1" or "May 2026"
  windowLabel: string;      // "6am→6am Toronto" / "7-day window" / "Full month"
  entries: RecapEntry[];
  entryCount: number;
  variantTag?: 'PUBLIC' | 'PRIVATE';
}): string {
  const { cadence, brand, size, dateLabel, windowLabel, entries, entryCount, variantTag } = opts;
  const upper = brand.toUpperCase();
  const headerEmoji = cadence === 'weekly' ? '📅' : cadence === 'monthly' ? '🗓️' : '🏆';
  const labelName = cadence === 'weekly'
    ? `WEEKLY TOP ${size}`
    : cadence === 'monthly'
      ? `MONTHLY TOP ${size}`
      : `DAILY TOP ${size}`;

  // Pin-preview line (the only line many users will see in the pin banner)
  const headLine = `${headerEmoji} ${upper} ${labelName} — ${dateLabel}`;

  // Podium
  const podium = entries.slice(0, 3).map((e, i) => {
    const t = (e.ticker || e.token_symbol || 'TOKEN').toUpperCase();
    const mult = fmtMult(Number(e.multiplier));
    const entry = fmtMcap(Number(e.called_at_mcap));
    const peak = fmtMcap(Number(e.ath_mcap));
    return `${MEDALS[i]} #${i + 1} $${esc(t)}  *${esc(mult)}*  · ${esc(entry)} → ${esc(peak)}`;
  }).join('\n');

  const n4x = entries.filter((e) => Number(e.multiplier) >= 4).length;
  const n10x = entries.filter((e) => Number(e.multiplier) >= 10).length;
  const biggest = entries[0];
  const biggestLine = biggest
    ? `🔥 ${n4x} call${n4x === 1 ? '' : 's'} at 4x+ · ${n10x} at 10x+ · biggest: $${esc((biggest.ticker || biggest.token_symbol || 'TOKEN').toUpperCase())} *${esc(fmtMult(Number(biggest.multiplier)))}*`
    : '';

  const statsLine = `📊 ${esc(windowLabel)} · ${entryCount} qualifying call${entryCount === 1 ? '' : 's'}${variantTag ? ` · ${variantTag}` : ''}`;
  const tailLine = `👀 Full table in the image below.`;

  return [headLine, '', podium, '', biggestLine, statsLine, tailLine]
    .filter((l) => l !== '')
    .join('\n');
}

/** Pin a message and (optionally) unpin a previously pinned one. */
export async function pinAndRotate(opts: {
  botToken: string;
  chatId: string | number;
  newMessageId: number;
  previousMessageId?: number | null;
  unpinPrevious?: boolean;
}): Promise<{ pinned: boolean; unpinned: boolean; error?: string }> {
  const { botToken, chatId, newMessageId, previousMessageId, unpinPrevious } = opts;
  let unpinned = false;
  if (unpinPrevious && previousMessageId) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${botToken}/unpinChatMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: previousMessageId }),
      });
      const j = await r.json().catch(() => ({}));
      unpinned = !!(r.ok && j?.ok);
    } catch { /* best-effort */ }
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/pinChatMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: newMessageId, disable_notification: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (!(r.ok && j?.ok)) {
      return { pinned: false, unpinned, error: JSON.stringify(j).slice(0, 300) };
    }
    return { pinned: true, unpinned };
  } catch (e: any) {
    return { pinned: false, unpinned, error: String(e?.message || e) };
  }
}

export function tableForCadence(c: RecapCadence): string {
  return c === 'weekly'
    ? 'leaderboard_weekly_runs'
    : c === 'monthly'
      ? 'leaderboard_monthly_runs'
      : 'leaderboard_daily_runs';
}