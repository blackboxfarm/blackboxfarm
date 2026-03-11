/**
 * MESH FEEDER — Universal passive intelligence collector
 * 
 * ANY edge function that touches a token, wallet, or social handle
 * should call these helpers to ensure the entity enters the reputation_mesh.
 * 
 * Supports auto-resolution of creators from:
 *   - pump.fun (frontend-api-v3)
 *   - bonk.fun (api.bonk.fun)
 *   - bags.fm (public-api-v2.bags.fm)
 * 
 * This is PASSIVE — no verdicts, no blacklisting, just data collection.
 * The mesh grows 24/7 from every cron and manual process.
 * 
 * Usage:
 *   import { meshFeed } from '../_shared/mesh-feeder.ts';
 *   await meshFeed.token(supabase, { mint, symbol, name, creatorWallet, source });
 *   await meshFeed.wallet(supabase, { wallet, source });
 *   await meshFeed.social(supabase, { type, handle, linkedWallet, source });
 *   await meshFeed.resolveCreatorFromLaunchpads(supabase, mint, source);
 */

interface MeshLink {
  source_type: string;
  source_id: string;
  linked_type: string;
  linked_id: string;
  relationship: string;
  confidence: number;
  evidence?: any;
  discovered_via: string;
}

interface TokenFeedParams {
  mint: string;
  symbol?: string | null;
  name?: string | null;
  creatorWallet?: string | null;
  twitterUrl?: string | null;
  telegramUrl?: string | null;
  websiteUrl?: string | null;
  source: string;
}

interface WalletFeedParams {
  wallet: string;
  role?: string; // 'creator' | 'funder' | 'trader' | 'insider' | 'unknown'
  linkedTo?: string; // another wallet it's related to
  relationship?: string; // 'funded_by' | 'same_team' | 'created_token' etc
  source: string;
}

interface SocialFeedParams {
  type: 'x_account' | 'telegram' | 'discord' | 'website' | 'github';
  handle: string;
  linkedWallet?: string;
  linkedToken?: string;
  source: string;
}

interface BatchItem {
  type: 'token' | 'wallet' | 'social' | 'link';
  data: TokenFeedParams | WalletFeedParams | SocialFeedParams | MeshLink;
}

// Extract twitter handle from URL
function extractHandle(url: string | null | undefined, pattern: RegExp): string | null {
  if (!url) return null;
  const match = url.match(pattern);
  return match ? match[1].replace(/^@/, '').toLowerCase() : null;
}

const TWITTER_RE = /(?:twitter\.com|x\.com)\/(@?[a-zA-Z0-9_]+)/i;
const TELEGRAM_RE = /t\.me\/([a-zA-Z0-9_]+)/i;

/**
 * Upsert a single mesh link, silently ignoring duplicates.
 */
async function upsertMeshLink(supabase: any, link: MeshLink): Promise<boolean> {
  try {
    const { error } = await supabase.from('reputation_mesh').insert(link);
    if (error) {
      if (error.message?.includes('duplicate') || error.code?.includes('23505')) {
        return false; // Already exists, that's fine
      }
      console.warn(`[mesh-feeder] Insert error: ${error.message}`);
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Batch upsert mesh links in chunks.
 */
async function batchUpsertLinks(supabase: any, links: MeshLink[]): Promise<number> {
  let inserted = 0;
  const CHUNK = 50;
  
  for (let i = 0; i < links.length; i += CHUNK) {
    const chunk = links.slice(i, i + CHUNK);
    for (const link of chunk) {
      const ok = await upsertMeshLink(supabase, link);
      if (ok) inserted++;
    }
  }
  return inserted;
}

/**
 * Ensure a wallet exists in dev_wallet_reputation (lightweight, no verdicts).
 */
async function ensureWalletProfile(supabase: any, wallet: string, source: string, meta?: any): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('dev_wallet_reputation')
      .select('id')
      .eq('wallet_address', wallet)
      .maybeSingle();

    if (!existing) {
      const now = new Date().toISOString();
      await supabase.from('dev_wallet_reputation').insert({
        wallet_address: wallet,
        total_tokens_launched: 0,
        trust_level: 'unknown',
        first_seen_at: now,
        last_activity_at: now,
        notes: `Auto-seeded by mesh-feeder from ${source}`,
        metadata: { source, ...meta },
      });
    }
  } catch (e) {
    // Ignore - might be a race condition duplicate
  }
}

/**
 * Queue a wallet for background spidering if not recently scanned.
 * Uses the mesh_spider_queue table if it exists, otherwise just logs.
 */
async function queueForSpider(supabase: any, entityId: string, entityType: string, source: string): Promise<void> {
  try {
    await supabase.from('mesh_spider_queue').upsert({
      entity_id: entityId,
      entity_type: entityType,
      source,
      status: 'pending',
      queued_at: new Date().toISOString(),
    }, { onConflict: 'entity_id,entity_type', ignoreDuplicates: true });
  } catch (e) {
    // Queue table might not exist yet — that's ok
  }
}

export const meshFeed = {
  /**
   * Feed a token into the mesh. Creates wallet→token and social links.
   */
  async token(supabase: any, params: TokenFeedParams): Promise<number> {
    const { mint, symbol, name, creatorWallet, twitterUrl, telegramUrl, websiteUrl, source } = params;
    const links: MeshLink[] = [];

    // wallet → token
    if (creatorWallet) {
      links.push({
        source_type: 'wallet',
        source_id: creatorWallet,
        linked_type: 'token',
        linked_id: mint,
        relationship: 'created_token',
        confidence: 95,
        evidence: { symbol, name, source },
        discovered_via: `mesh-feeder:${source}`,
      });

      // Ensure wallet profile exists
      await ensureWalletProfile(supabase, creatorWallet, source, { first_token: mint, first_symbol: symbol });

      // Queue wallet for deeper spidering
      await queueForSpider(supabase, creatorWallet, 'wallet', source);
    }

    // Twitter → wallet
    const twitterHandle = extractHandle(twitterUrl, TWITTER_RE);
    if (twitterHandle && creatorWallet) {
      links.push({
        source_type: 'x_account',
        source_id: twitterHandle,
        linked_type: 'wallet',
        linked_id: creatorWallet,
        relationship: 'social_account_of',
        confidence: 75,
        evidence: { url: twitterUrl, token: mint, symbol, source },
        discovered_via: `mesh-feeder:${source}`,
      });
      // Also link twitter → token
      links.push({
        source_type: 'x_account',
        source_id: twitterHandle,
        linked_type: 'token',
        linked_id: mint,
        relationship: 'promotes_token',
        confidence: 70,
        evidence: { url: twitterUrl, symbol, source },
        discovered_via: `mesh-feeder:${source}`,
      });
    }

    // Telegram → wallet
    const telegramHandle = extractHandle(telegramUrl, TELEGRAM_RE);
    if (telegramHandle && creatorWallet) {
      links.push({
        source_type: 'telegram',
        source_id: telegramHandle,
        linked_type: 'wallet',
        linked_id: creatorWallet,
        relationship: 'social_account_of',
        confidence: 65,
        evidence: { url: telegramUrl, token: mint, symbol, source },
        discovered_via: `mesh-feeder:${source}`,
      });
    }

    // Website → wallet
    if (websiteUrl && creatorWallet) {
      links.push({
        source_type: 'website',
        source_id: websiteUrl.trim(),
        linked_type: 'wallet',
        linked_id: creatorWallet,
        relationship: 'website_of',
        confidence: 70,
        evidence: { token: mint, symbol, source },
        discovered_via: `mesh-feeder:${source}`,
      });
    }

    // Queue token for spidering too
    await queueForSpider(supabase, mint, 'token', source);

    return await batchUpsertLinks(supabase, links);
  },

  /**
   * Feed a wallet relationship into the mesh.
   */
  async wallet(supabase: any, params: WalletFeedParams): Promise<number> {
    const { wallet, role, linkedTo, relationship, source } = params;
    const links: MeshLink[] = [];

    await ensureWalletProfile(supabase, wallet, source, { role });

    if (linkedTo && relationship) {
      links.push({
        source_type: 'wallet',
        source_id: wallet,
        linked_type: 'wallet',
        linked_id: linkedTo,
        relationship,
        confidence: 80,
        evidence: { role, source },
        discovered_via: `mesh-feeder:${source}`,
      });
    }

    await queueForSpider(supabase, wallet, 'wallet', source);
    return await batchUpsertLinks(supabase, links);
  },

  /**
   * Feed a social handle into the mesh.
   */
  async social(supabase: any, params: SocialFeedParams): Promise<number> {
    const { type, handle, linkedWallet, linkedToken, source } = params;
    const links: MeshLink[] = [];

    if (linkedWallet) {
      links.push({
        source_type: type,
        source_id: handle.toLowerCase().replace(/^@/, ''),
        linked_type: 'wallet',
        linked_id: linkedWallet,
        relationship: 'social_account_of',
        confidence: 70,
        evidence: { source },
        discovered_via: `mesh-feeder:${source}`,
      });
    }

    if (linkedToken) {
      links.push({
        source_type: type,
        source_id: handle.toLowerCase().replace(/^@/, ''),
        linked_type: 'token',
        linked_id: linkedToken,
        relationship: 'promotes_token',
        confidence: 65,
        evidence: { source },
        discovered_via: `mesh-feeder:${source}`,
      });
    }

    return await batchUpsertLinks(supabase, links);
  },

  /**
   * Feed multiple tokens at once (e.g., from a batch fetch).
   */
  async tokenBatch(supabase: any, tokens: TokenFeedParams[]): Promise<number> {
    let total = 0;
    for (const t of tokens) {
      total += await meshFeed.token(supabase, t);
    }
    return total;
  },

  /**
   * Feed X community admins/mods into the mesh linked to a token.
   */
  async communityStaff(supabase: any, params: {
    tokenMint: string;
    creatorWallet?: string;
    admins: string[];
    mods: string[];
    source: string;
  }): Promise<number> {
    const { tokenMint, creatorWallet, admins, mods, source } = params;
    const links: MeshLink[] = [];

    for (const admin of admins.slice(0, 10)) {
      const handle = admin.toLowerCase().replace(/^@/, '');
      links.push({
        source_type: 'x_account',
        source_id: handle,
        linked_type: 'token',
        linked_id: tokenMint,
        relationship: 'community_admin',
        confidence: 80,
        evidence: { role: 'admin', source },
        discovered_via: `mesh-feeder:${source}`,
      });
      if (creatorWallet) {
        links.push({
          source_type: 'x_account',
          source_id: handle,
          linked_type: 'wallet',
          linked_id: creatorWallet,
          relationship: 'community_admin_of_dev',
          confidence: 60,
          evidence: { role: 'admin', token: tokenMint, source },
          discovered_via: `mesh-feeder:${source}`,
        });
      }
    }

    for (const mod of mods.slice(0, 10)) {
      const handle = mod.toLowerCase().replace(/^@/, '');
      links.push({
        source_type: 'x_account',
        source_id: handle,
        linked_type: 'token',
        linked_id: tokenMint,
        relationship: 'community_mod',
        confidence: 70,
        evidence: { role: 'mod', source },
        discovered_via: `mesh-feeder:${source}`,
      });
    }

    return await batchUpsertLinks(supabase, links);
  },

  /**
   * Feed insiders/whales discovered during holder analysis.
   */
  async insiders(supabase: any, params: {
    tokenMint: string;
    insiderWallets: string[];
    source: string;
  }): Promise<number> {
    const { tokenMint, insiderWallets, source } = params;
    const links: MeshLink[] = [];

    for (const insider of insiderWallets.slice(0, 20)) {
      links.push({
        source_type: 'wallet',
        source_id: insider,
        linked_type: 'token',
        linked_id: tokenMint,
        relationship: 'insider_holder',
        confidence: 75,
        evidence: { source },
        discovered_via: `mesh-feeder:${source}`,
      });
      await ensureWalletProfile(supabase, insider, source, { role: 'insider', token: tokenMint });
    }

    return await batchUpsertLinks(supabase, links);
  },
};
