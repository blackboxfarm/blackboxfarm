import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Social Links Backfill
 * 
 * Batch-extracts social data from reputation_mesh into token_social_links.
 * Sources:
 * - reputation_mesh entries where linked_type = 'token' and source_type = 'x_account' or 'telegram'
 * - Also captures community → token links
 * 
 * Zero external API cost — purely internal DB operations.
 */
Deno.serve(withRunLog('social-links-backfill', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 500, 2000);
    const offset = body.offset || 0;

    // Count total mesh entries that link to tokens with social source types
    const { count: total } = await supabase
      .from('reputation_mesh')
      .select('*', { count: 'exact', head: true })
      .eq('linked_type', 'token')
      .in('source_type', ['x_account', 'telegram', 'x_community', 'website', 'discord']);

    // Fetch batch of mesh entries linking socials → tokens
    const { data: meshEntries, error: fetchError } = await supabase
      .from('reputation_mesh')
      .select('source_type, source_id, linked_id, relationship, confidence, evidence')
      .eq('linked_type', 'token')
      .in('source_type', ['x_account', 'telegram', 'x_community', 'website', 'discord'])
      .order('discovered_at', { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (fetchError) throw fetchError;

    if (!meshEntries || meshEntries.length === 0) {
      // Check current token_social_links count
      const { count: linkCount } = await supabase
        .from('token_social_links')
        .select('*', { count: 'exact', head: true });

      return new Response(JSON.stringify({
        success: true,
        done: true,
        processed: 0,
        total: total || 0,
        currentLinks: linkCount || 0,
        message: 'All mesh social entries have been processed!',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Transform mesh entries into token_social_links rows
    const links: any[] = [];
    let processed = 0;
    let skipped = 0;

    for (const entry of meshEntries) {
      const tokenMint = entry.linked_id;
      const sourceType = entry.source_type;
      const sourceId = entry.source_id;

      let url = '';
      let linkType = '';
      let platform = '';
      let extractedHandle = sourceId;
      let isCommunity = false;
      let communityId: string | null = null;

      switch (sourceType) {
        case 'x_account':
          url = `https://x.com/${sourceId}`;
          linkType = 'twitter';
          platform = 'x';
          extractedHandle = sourceId;
          break;
        case 'x_community':
          url = `https://x.com/i/communities/${sourceId}`;
          linkType = 'twitter_community';
          platform = 'x';
          extractedHandle = sourceId;
          isCommunity = true;
          communityId = sourceId;
          break;
        case 'telegram':
          url = sourceId.startsWith('http') ? sourceId : `https://t.me/${sourceId}`;
          linkType = 'telegram';
          platform = 'telegram';
          extractedHandle = sourceId.replace(/^https?:\/\/t\.me\//, '');
          break;
        case 'website':
          url = sourceId.startsWith('http') ? sourceId : `https://${sourceId}`;
          linkType = 'website';
          platform = 'website';
          extractedHandle = sourceId;
          break;
        case 'discord':
          url = sourceId.startsWith('http') ? sourceId : `https://discord.gg/${sourceId}`;
          linkType = 'discord';
          platform = 'discord';
          extractedHandle = sourceId;
          break;
        default:
          skipped++;
          continue;
      }

      links.push({
        token_mint: tokenMint,
        url,
        link_type: linkType,
        platform,
        extracted_handle: extractedHandle,
        source: 'mesh_backfill',
        is_community: isCommunity,
        community_id: communityId,
        is_current: true,
        discovered_at: new Date().toISOString(),
      });
      processed++;
    }

    // Batch upsert (avoid duplicates on token_mint + url)
    if (links.length > 0) {
      // Upsert in chunks of 200 to avoid payload limits
      for (let i = 0; i < links.length; i += 200) {
        const chunk = links.slice(i, i + 200);
        const { error: upsertError } = await supabase
          .from('token_social_links')
          .upsert(chunk, {
            onConflict: 'token_mint,url',
            ignoreDuplicates: true,
          });
        if (upsertError) {
          console.warn(`[social-links-backfill] Upsert chunk error:`, upsertError.message);
        }
      }

      // ═══ Creator Fusion: attach social signals to each known creator profile ═══
      try {
        const uniqueMints = [...new Set(links.map((l: any) => l.token_mint))];
        const { data: lifecycleRows } = await supabase
          .from('token_lifecycle')
          .select('token_mint, creator_wallet')
          .in('token_mint', uniqueMints)
          .not('creator_wallet', 'is', null);
        const walletByMint = new Map<string, string>();
        for (const r of (lifecycleRows || []) as any[]) walletByMint.set(r.token_mint, r.creator_wallet);

        // Group socials by mint
        const socialsByMint = new Map<string, { twitter?: string; telegram?: string; website?: string; discord?: string }>();
        for (const l of links as any[]) {
          const cur = socialsByMint.get(l.token_mint) || {};
          if (l.platform === 'twitter' || l.platform === 'x') cur.twitter = cur.twitter || l.url;
          if (l.platform === 'telegram') cur.telegram = cur.telegram || l.url;
          if (l.platform === 'website' || l.platform === 'site') cur.website = cur.website || l.url;
          if (l.platform === 'discord') cur.discord = cur.discord || l.url;
          socialsByMint.set(l.token_mint, cur);
        }

        const { fuseAndAudit } = await import('../_shared/fuse-and-audit.ts');
        for (const [mint, social] of socialsByMint) {
          const wallet = walletByMint.get(mint);
          if (!wallet) continue;
          await fuseAndAudit(
            {
              devWallet: wallet,
              xHandle: social.twitter || null,
              telegramHandle: social.telegram || null,
              websiteDomain: social.website || null,
              discordHandle: social.discord || null,
              source: 'social-links-backfill',
            },
            supabase,
          );
        }
      } catch (fusionErr) {
        console.warn('[social-links-backfill] Fusion sweep error:', (fusionErr as Error).message);
      }
    }

    const nextOffset = offset + meshEntries.length;
    const done = meshEntries.length < batchSize;

    console.log(`[social-links-backfill] Batch: ${processed} links from ${meshEntries.length} mesh entries (skipped ${skipped}). Offset ${offset} → ${nextOffset}. Done: ${done}`);

    return new Response(JSON.stringify({
      success: true,
      done,
      processed,
      skipped,
      nextOffset,
      total: total || 0,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('[social-links-backfill] Fatal:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
