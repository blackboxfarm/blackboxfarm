/**
 * Shared rich Telegram message builder for Allstar / Family mint alerts.
 *
 * Both `allstar-mint-auditor` and `family-mint-monitor` use this so every
 * alert posted to BlackBox + DrRick DM contains the SAME set of useful
 * fields the user actually needs to act on:
 *
 *   • FULL token mint address on its own line (one-tap copy on TG)
 *   • Direct links to pump.fun / dexscreener / solscan / padre
 *   • Token symbol, name, description, image link
 *   • Token socials (X / website / telegram / discord) if present
 *   • Mint time + "X minutes ago" detected age
 *   • Dev profile block: tier, best prior token + ATH, family size,
 *     KYC root, X handle + followers
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fetchLaunchpadCoin, type LaunchpadCoin } from './launchpad-fetch.ts';

export interface DevCtx {
  tier?: number | null;
  bestTokenSymbol?: string | null;
  bestTokenMint?: string | null;
  bestMcap?: number | null;
  twitterHandle?: string | null;
  familySize?: number | null;
  kycRoot?: string | null;
  familyName?: string | null;
}

export interface RichAlertParams {
  tokenMint: string;
  creatorWallet: string;
  launchpad?: string | null;
  eventLabel?: string | null;   // e.g. "direct dev mint"
  mintTimestampMs?: number | null;
  detectedAtMs?: number;        // defaults to now
  dev: DevCtx;
  alertLevel: 'critical' | 'high' | 'medium' | 'low' | string;
  callerName: string;
}

export interface RichAlertResult {
  blackboxMessage: string;
  drrickMessage: string;
  launchpadCoin: LaunchpadCoin | null;
  isMayhem: boolean;
}

const MAYHEM_PROGRAM_ID = 'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e';
const MAYHEM_SUPPLY = 2_000_000_000_000_000;

function mcapLabel(n?: number | null): string {
  if (!n || n <= 0) return '?';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function ageLabel(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ago`;
}

export async function buildRichMintAlert(
  supabase: SupabaseClient,
  p: RichAlertParams,
): Promise<RichAlertResult> {
  const { tokenMint, creatorWallet, callerName } = p;
  const detectedAt = p.detectedAtMs ?? Date.now();

  // 1. Launchpad metadata (pump.fun / bags / etc)
  const lp = await fetchLaunchpadCoin(tokenMint, callerName);
  const coin = lp.data;
  const raw = (coin?.raw || {}) as Record<string, any>;

  // 2. Mayhem detection from raw pump.fun data
  const program = (raw?.program as string | undefined) || null;
  const totalSupply = Number(raw?.total_supply || 0);
  const isMayhem = program === MAYHEM_PROGRAM_ID || totalSupply >= MAYHEM_SUPPLY;

  // 3. Live X profile for the dev (display name + followers)
  let devDisplayName: string | null = null;
  let devFollowersLabel = '';
  if (p.dev.twitterHandle) {
    try {
      const { getXProfile, formatFollowers } = await import('./x-profile-lookup.ts');
      const prof = await getXProfile(supabase, p.dev.twitterHandle);
      if (prof) {
        devDisplayName = prof.displayName;
        if (prof.followers && prof.followers > 0) {
          devFollowersLabel = `${formatFollowers(prof.followers)} followers`;
        }
      }
    } catch { /* non-fatal */ }
  }

  // 4. Best prior token ATH date
  let bestAthDateLabel = '';
  if (p.dev.bestTokenMint) {
    try {
      const { data: bt } = await supabase
        .from('proven_dev_tokens')
        .select('ath_timestamp, mint_timestamp')
        .eq('token_mint', p.dev.bestTokenMint)
        .maybeSingle();
      const ts = bt?.ath_timestamp || bt?.mint_timestamp;
      if (ts) bestAthDateLabel = new Date(ts).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    } catch { /* non-fatal */ }
  }

  const symbol = coin?.symbol || raw?.symbol || 'UNKNOWN';
  const name = coin?.name || raw?.name || symbol;
  const description = (coin?.description || '').toString().slice(0, 240);
  const imageUri = coin?.imageUri || null;
  const twitter = coin?.twitter || null;
  const telegram = coin?.telegram || null;
  const website = coin?.website || null;
  const discord = coin?.discord || null;
  const currentMcap = coin?.marketCapUsd ?? null;

  const launchpadName = p.launchpad || coin?.launchpad || (tokenMint.endsWith('pump') ? 'pump.fun' : 'unknown');
  const pumpUrl = `https://pump.fun/coin/${tokenMint}`;
  const dexUrl = `https://dexscreener.com/solana/${tokenMint}`;
  const solscanUrl = `https://solscan.io/token/${tokenMint}`;
  const padreUrl = `https://padre.gg/token/${tokenMint}`;
  const axiomUrl = `https://axiom.trade/t/${tokenMint}`;

  // Mint timestamp: prefer onchain blockTime, fallback to launchpad createdAt
  let mintTsMs = p.mintTimestampMs ?? null;
  if (!mintTsMs && coin?.createdAt) mintTsMs = new Date(coin.createdAt).getTime();
  const mintAge = mintTsMs ? ageLabel(detectedAt - mintTsMs) : 'unknown';
  const mintIso = mintTsMs ? new Date(mintTsMs).toISOString().slice(0, 19).replace('T', ' ') + ' UTC' : 'unknown';
  const detectedAge = ageLabel(Date.now() - detectedAt);

  const tier = p.dev.tier ?? null;
  const tierStars = tier ? '⭐'.repeat(Math.min(tier, 8)) : '';
  const devHandle = p.dev.twitterHandle ? `@${p.dev.twitterHandle}` : `${creatorWallet.slice(0, 8)}…${creatorWallet.slice(-4)}`;
  const devLine = devDisplayName
    ? `👤 ${devDisplayName} (${devHandle})${devFollowersLabel ? ` — ${devFollowersLabel}` : ''}`
    : `👤 ${devHandle}${devFollowersLabel ? ` — ${devFollowersLabel}` : ''}`;
  const bestPriorLine = p.dev.bestTokenSymbol
    ? (bestAthDateLabel
        ? `🏆 Best prior: $${p.dev.bestTokenSymbol} → ${mcapLabel(p.dev.bestMcap)} ATH (${bestAthDateLabel})`
        : `🏆 Best prior: $${p.dev.bestTokenSymbol} → ${mcapLabel(p.dev.bestMcap)} ATH`)
    : null;

  const socialLine: string[] = [];
  if (twitter) socialLine.push(`[X](${twitter})`);
  if (website) socialLine.push(`[Web](${website})`);
  if (telegram) socialLine.push(`[TG](${telegram})`);
  if (discord) socialLine.push(`[Discord](${discord})`);

  const headerEmoji = p.alertLevel === 'critical' ? '🚨🌟' : p.alertLevel === 'high' ? '⭐🔔' : '✨';
  const headerLabel = p.eventLabel
    ? `${headerEmoji} ALLSTAR MINT — ${p.eventLabel.toUpperCase()}`
    : `${headerEmoji} ALLSTAR DEV MINT`;

  // ── BlackBox group (rich, Markdown) ──
  const blackboxLines: (string | null | false)[] = [
    headerLabel,
    tier ? `${tierStars} *Tier ${tier} Developer*` : null,
    ``,
    `🪙 *Token:* $${symbol} — ${name}`,
    description ? `_${description}_` : null,
    ``,
    `📋 *Mint Address (tap to copy):*`,
    `\`${tokenMint}\``,
    ``,
    `🌐 *Launchpad:* ${launchpadName}`,
    currentMcap ? `💰 *Mcap:* ${mcapLabel(currentMcap)}` : null,
    `⏰ *Minted:* ${mintAge} (${mintIso})`,
    `📡 *Detected:* ${detectedAge}`,
    socialLine.length ? `🔗 *Token socials:* ${socialLine.join(' · ')}` : null,
    imageUri ? `🖼 [Token image](${imageUri})` : null,
    ``,
    `🔥 *Quick trade links:*`,
    `├ [Pump.fun](${pumpUrl})`,
    `├ [Axiom](${axiomUrl})`,
    `├ [Padre](${padreUrl})`,
    `├ [DexScreener](${dexUrl})`,
    `└ [Solscan](${solscanUrl})`,
    ``,
    `─── 👨‍💻 DEV PROFILE ───`,
    devLine,
    bestPriorLine,
    `👛 *Creator wallet:* \`${creatorWallet}\``,
    p.dev.kycRoot ? `🔐 *KYC root:* \`${p.dev.kycRoot}\`` : null,
    p.dev.familySize ? `👨‍👩‍👧 *Family:* ${p.dev.familyName ? `${p.dev.familyName} · ` : ''}${p.dev.familySize} wallets` : null,
    `🏷 *Alert level:* *${String(p.alertLevel).toUpperCase()}*`,
  ];
  const blackboxMessage = blackboxLines.filter((l) => l !== null && l !== false).join('\n');

  // ── DrRick DM (plain text, no markdown so it survives any parser) ──
  const drrickLines: (string | null | false)[] = [
    headerLabel.replace(/\*/g, ''),
    `Token: $${symbol} — ${name}`,
    ``,
    `MINT (copy):`,
    tokenMint,
    ``,
    `Launchpad: ${launchpadName}`,
    currentMcap ? `Mcap: ${mcapLabel(currentMcap)}` : null,
    `Minted: ${mintAge} (${mintIso})`,
    `Detected: ${detectedAge}`,
    ``,
    `Pump:    ${pumpUrl}`,
    `Axiom:   ${axiomUrl}`,
    `Padre:   ${padreUrl}`,
    `Dex:     ${dexUrl}`,
    `Solscan: ${solscanUrl}`,
    twitter ? `X:       ${twitter}` : null,
    website ? `Web:     ${website}` : null,
    telegram ? `TG:      ${telegram}` : null,
    ``,
    `── DEV ──`,
    devDisplayName ? `${devDisplayName} (${devHandle})` : devHandle,
    devFollowersLabel || null,
    bestPriorLine ? bestPriorLine.replace(/[*_`]/g, '') : null,
    `Creator: ${creatorWallet}`,
    p.dev.kycRoot ? `KYC root: ${p.dev.kycRoot}` : null,
    p.dev.familySize ? `Family: ${p.dev.familySize} wallets` : null,
    `Alert: ${String(p.alertLevel).toUpperCase()}`,
  ];
  const drrickMessage = drrickLines.filter((l) => l !== null && l !== false).join('\n');

  return { blackboxMessage, drrickMessage, launchpadCoin: coin, isMayhem };
}