import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * SOCIAL LARP DETECTOR
 * 
 * Detects when pump.fun token creators impersonate real brands/communities.
 * "LARP" = Live Action Role Playing — pretending to be associated with an entity.
 * 
 * Verification steps:
 * 1. Check if socials are listed on pump.fun profile
 * 2. Verify URLs resolve (HTTP HEAD check)
 * 3. Scrape website via Firecrawl — search for token name/symbol/mint
 * 4. Scrape X community via Apify — search for token/crypto mentions
 * 5. Score legitimacy and return verdict
 * 
 * A LARP is detected when:
 * - Socials link to real entities (websites, X communities)
 * - BUT those entities have ZERO mention of the token
 * - The dev is impersonating/hijacking the brand identity
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LarpCheckResult {
  isLarp: boolean;
  confidence: number; // 0-100
  checks: {
    hasSocials: boolean;
    websiteCheck?: { url: string; resolves: boolean; mentionsToken: boolean; mentionsCrypto: boolean; scrapedContent?: string };
    twitterCheck?: { url: string; resolves: boolean; mentionsToken: boolean; isXCommunity: boolean };
    telegramCheck?: { url: string; resolves: boolean };
  };
  verdict: string;
  flags: string[];
}

// Check if URL resolves
async function checkUrlResolves(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok || response.status === 301 || response.status === 302;
  } catch {
    return false;
  }
}

// Scrape website via Firecrawl and search for token mentions
async function scrapeWebsiteForTokenMentions(
  websiteUrl: string,
  tokenName: string,
  tokenSymbol: string,
  tokenMint: string,
): Promise<{ mentionsToken: boolean; mentionsCrypto: boolean; content: string }> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    console.warn('[LARP] Firecrawl not configured, skipping deep website check');
    return { mentionsToken: false, mentionsCrypto: false, content: '' };
  }

  try {
    console.log(`[LARP] Scraping website: ${websiteUrl}`);
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: websiteUrl,
        formats: ['markdown'],
        onlyMainContent: false, // Get EVERYTHING — we need to see if token is mentioned anywhere
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      console.warn(`[LARP] Firecrawl scrape failed: ${response.status}`);
      return { mentionsToken: false, mentionsCrypto: false, content: '' };
    }

    const data = await response.json();
    const content = (data.data?.markdown || data.markdown || '').toLowerCase();
    
    if (!content || content.length < 20) {
      return { mentionsToken: false, mentionsCrypto: false, content: '' };
    }

    // Search for token-specific mentions
    const searchTerms = [
      tokenName.toLowerCase(),
      tokenSymbol.toLowerCase(),
      `$${tokenSymbol.toLowerCase()}`,
      tokenMint.toLowerCase(),
      tokenMint.slice(0, 12).toLowerCase(), // Partial mint match
    ];

    const mentionsToken = searchTerms.some(term => term.length >= 3 && content.includes(term));

    // Search for general crypto/token mentions
    const cryptoTerms = [
      'token', 'solana', 'sol', 'pump.fun', 'pumpfun', 'dex', 'raydium',
      'crypto', 'blockchain', 'mint address', 'contract address', 'airdrop',
      'presale', 'buy now', 'token launch', 'memecoin', 'meme coin',
      'community takeover', 'cto', 'bonding curve',
    ];

    const mentionsCrypto = cryptoTerms.some(term => content.includes(term));

    console.log(`[LARP] Website scrape: mentionsToken=${mentionsToken}, mentionsCrypto=${mentionsCrypto}, contentLen=${content.length}`);

    return {
      mentionsToken,
      mentionsCrypto,
      content: content.slice(0, 2000), // Store first 2000 chars for evidence
    };
  } catch (error) {
    console.error(`[LARP] Website scrape error:`, error);
    return { mentionsToken: false, mentionsCrypto: false, content: '' };
  }
}

// Check X Community for token mentions via Apify
async function checkXCommunityForToken(
  communityUrl: string,
  tokenName: string,
  tokenSymbol: string,
  tokenMint: string,
): Promise<{ mentionsToken: boolean; communityName?: string; memberCount?: number; hasCryptoContent: boolean }> {
  const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY');
  if (!APIFY_API_KEY) {
    console.warn('[LARP] Apify not configured, skipping X community check');
    return { mentionsToken: false, hasCryptoContent: false };
  }

  // Extract community ID from URL
  const communityMatch = communityUrl.match(/communities\/(\d+)/);
  if (!communityMatch) {
    console.warn(`[LARP] Could not extract community ID from: ${communityUrl}`);
    return { mentionsToken: false, hasCryptoContent: false };
  }

  const communityId = communityMatch[1];

  try {
    console.log(`[LARP] Scraping X Community: ${communityId}`);
    
    // Use Apify X Community Member Scraper to get community data
    const response = await fetch(
      `https://api.apify.com/v2/acts/danpoletaev~twitter-x-community-member-scraper/run-sync-get-dataset-items?token=${APIFY_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          maxItems: 50,
          proxyConfiguration: {
            useApifyProxy: true,
            apifyProxyGroups: ['RESIDENTIAL'],
          },
        }),
      },
    );

    if (!response.ok) {
      console.warn(`[LARP] Apify community scrape failed: ${response.status}`);
      return { mentionsToken: false, hasCryptoContent: false };
    }

    const members = await response.json();
    
    if (!Array.isArray(members) || members.length === 0) {
      // Community might be deleted or private
      return { mentionsToken: false, hasCryptoContent: false, memberCount: 0 };
    }

    // Check member bios and community metadata for token mentions
    const searchTerms = [
      tokenName.toLowerCase(),
      tokenSymbol.toLowerCase(),
      `$${tokenSymbol.toLowerCase()}`,
      tokenMint.slice(0, 12).toLowerCase(),
    ];

    const cryptoTerms = [
      'token', 'solana', 'sol', 'crypto', 'memecoin', 'pump.fun',
      'dex', 'mint', 'airdrop', 'presale', 'blockchain',
    ];

    let mentionsToken = false;
    let hasCryptoContent = false;

    for (const member of members) {
      const bio = (member.description || member.bio || '').toLowerCase();
      const name = (member.name || member.screenName || '').toLowerCase();
      const combinedText = `${bio} ${name}`;

      if (searchTerms.some(term => term.length >= 3 && combinedText.includes(term))) {
        mentionsToken = true;
      }
      if (cryptoTerms.some(term => combinedText.includes(term))) {
        hasCryptoContent = true;
      }
    }

    // Also check the community name itself from any member's community data
    const communityName = members[0]?.communityName || members[0]?.community?.name;
    if (communityName) {
      const lcName = communityName.toLowerCase();
      if (searchTerms.some(term => term.length >= 3 && lcName.includes(term))) {
        mentionsToken = true;
      }
      if (cryptoTerms.some(term => lcName.includes(term))) {
        hasCryptoContent = true;
      }
    }

    console.log(`[LARP] X Community: mentionsToken=${mentionsToken}, hasCrypto=${hasCryptoContent}, members=${members.length}`);

    return {
      mentionsToken,
      communityName,
      memberCount: members.length,
      hasCryptoContent,
    };
  } catch (error) {
    console.error(`[LARP] X Community check error:`, error);
    return { mentionsToken: false, hasCryptoContent: false };
  }
}

// Extract X community URL from twitter field
function extractXCommunityUrl(twitter?: string): string | null {
  if (!twitter) return null;
  if (twitter.includes('/communities/')) return twitter;
  return null;
}

// Main LARP detection
async function detectLarp(
  tokenMint: string,
  tokenName: string,
  tokenSymbol: string,
  website?: string,
  twitter?: string,
  telegram?: string,
): Promise<LarpCheckResult> {
  const flags: string[] = [];
  const checks: LarpCheckResult['checks'] = {
    hasSocials: false,
  };

  const hasSocials = !!(website || twitter || telegram);
  checks.hasSocials = hasSocials;

  // No socials = no LARP check needed (might still be suspicious but not a LARP)
  if (!hasSocials) {
    return {
      isLarp: false,
      confidence: 0,
      checks,
      verdict: 'no_socials_listed',
      flags: [],
    };
  }

  let larpScore = 0; // Higher = more likely LARP
  const xCommunityUrl = extractXCommunityUrl(twitter);

  // === WEBSITE CHECK ===
  if (website) {
    const normalizedUrl = website.startsWith('http') ? website : `https://${website}`;
    const resolves = await checkUrlResolves(normalizedUrl);
    
    let mentionsToken = false;
    let mentionsCrypto = false;
    let scrapedContent = '';

    if (resolves) {
      const scrapeResult = await scrapeWebsiteForTokenMentions(normalizedUrl, tokenName, tokenSymbol, tokenMint);
      mentionsToken = scrapeResult.mentionsToken;
      mentionsCrypto = scrapeResult.mentionsCrypto;
      scrapedContent = scrapeResult.content;

      if (!mentionsToken && !mentionsCrypto) {
        // Website exists, is live, but has ZERO token or crypto mentions
        // This is the classic LARP — hijacking a real brand
        larpScore += 40;
        flags.push('website_no_token_mention');
        flags.push('website_no_crypto_content');
      } else if (!mentionsToken && mentionsCrypto) {
        // Has crypto content but doesn't mention THIS token specifically
        // Could be a different project's website being repurposed
        larpScore += 15;
        flags.push('website_crypto_but_wrong_token');
      }
      // mentionsToken = legit, no penalty
    } else {
      // Website doesn't resolve — dead link
      larpScore += 5;
      flags.push('website_dead_link');
    }

    checks.websiteCheck = { url: normalizedUrl, resolves, mentionsToken, mentionsCrypto, scrapedContent };
  }

  // === X COMMUNITY CHECK ===
  if (xCommunityUrl) {
    const resolves = await checkUrlResolves(xCommunityUrl);

    if (resolves) {
      const communityResult = await checkXCommunityForToken(xCommunityUrl, tokenName, tokenSymbol, tokenMint);
      
      if (!communityResult.mentionsToken && !communityResult.hasCryptoContent) {
        // X Community exists but has ZERO token/crypto mentions
        // Classic LARP — pretending to be community staff
        larpScore += 40;
        flags.push('x_community_no_token_mention');
        flags.push('x_community_no_crypto_content');
      } else if (!communityResult.mentionsToken && communityResult.hasCryptoContent) {
        larpScore += 10;
        flags.push('x_community_crypto_but_wrong_token');
      }

      checks.twitterCheck = {
        url: xCommunityUrl,
        resolves,
        mentionsToken: communityResult.mentionsToken,
        isXCommunity: true,
      };
    } else {
      larpScore += 5;
      flags.push('x_community_dead_link');
      checks.twitterCheck = { url: xCommunityUrl, resolves: false, mentionsToken: false, isXCommunity: true };
    }
  } else if (twitter) {
    // Regular Twitter handle — just check if it resolves
    const twitterUrl = twitter.startsWith('http') ? twitter : `https://x.com/${twitter.replace('@', '')}`;
    const resolves = await checkUrlResolves(twitterUrl);
    
    if (!resolves) {
      larpScore += 5;
      flags.push('twitter_dead_link');
    }

    checks.twitterCheck = { url: twitterUrl, resolves, mentionsToken: false, isXCommunity: false };
  }

  // === TELEGRAM CHECK ===
  if (telegram) {
    const telegramUrl = telegram.startsWith('http') ? telegram : `https://t.me/${telegram}`;
    const resolves = await checkUrlResolves(telegramUrl);
    
    if (!resolves) {
      larpScore += 3;
      flags.push('telegram_dead_link');
    }

    checks.telegramCheck = { url: telegramUrl, resolves };
  }

  // === COMPOUND LARP SIGNALS ===
  // If BOTH website and X community don't mention token = very high confidence LARP
  if (flags.includes('website_no_token_mention') && flags.includes('x_community_no_token_mention')) {
    larpScore += 20;
    flags.push('compound_larp_both_socials_unrelated');
  }

  // Determine verdict
  const isLarp = larpScore >= 35;
  const confidence = Math.min(100, larpScore);

  let verdict: string;
  if (larpScore >= 60) verdict = 'confirmed_larp';
  else if (larpScore >= 35) verdict = 'likely_larp';
  else if (larpScore >= 15) verdict = 'suspicious_socials';
  else verdict = 'socials_appear_legitimate';

  console.log(`[LARP] VERDICT for ${tokenSymbol}: ${verdict} (score: ${larpScore}, confidence: ${confidence}%)`);
  console.log(`[LARP] FLAGS: ${flags.join(', ') || 'none'}`);

  return { isLarp, confidence, checks, verdict, flags };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token_mint, token_name, token_symbol, website, twitter, telegram, creator_wallet, triggered_by } = await req.json();

    if (!token_mint || !token_symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'token_mint and token_symbol required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[LARP DETECTOR] Analyzing ${token_symbol} (${token_mint.slice(0, 8)}...)`);

    const result = await detectLarp(
      token_mint,
      token_name || token_symbol,
      token_symbol,
      website,
      twitter,
      telegram,
    );

    // If LARP detected → auto-reject + blacklist
    if (result.isLarp && creator_wallet) {
      console.log(`[LARP DETECTOR] 🚨 LARP CONFIRMED for ${token_symbol} — blacklisting dev ${creator_wallet.slice(0, 8)}...`);

      // Blacklist the dev wallet
      await supabase.from('pumpfun_blacklist').upsert({
        wallet_address: creator_wallet,
        reason: `LARP detected: ${result.verdict} — ${result.flags.join(', ')}`,
        severity: 'critical',
        wallet_type: 'dev_wallet',
        added_by: triggered_by || 'social-larp-detector',
        auto_detected: true,
      }, { onConflict: 'wallet_address' });

      // Update dev reputation in Oracle
      await supabase.from('dev_wallet_reputation').upsert({
        wallet_address: creator_wallet,
        trust_level: 'scammer',
        behavior_tags: ['larp', 'brand_impersonation'],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'wallet_address' });

      // Add to reputation mesh
      const meshEntries = [
        {
          source_type: 'wallet',
          source_id: creator_wallet,
          target_type: 'token',
          target_id: token_mint,
          relationship: 'larp_created',
          confidence_score: result.confidence / 100,
          detected_by: 'social-larp-detector',
          metadata: { verdict: result.verdict, flags: result.flags },
        },
      ];

      if (website) {
        meshEntries.push({
          source_type: 'wallet',
          source_id: creator_wallet,
          target_type: 'website',
          target_id: website,
          relationship: 'impersonated',
          confidence_score: result.confidence / 100,
          detected_by: 'social-larp-detector',
          metadata: { verdict: result.verdict, websiteCheck: result.checks.websiteCheck },
        });
      }

      if (twitter) {
        meshEntries.push({
          source_type: 'wallet',
          source_id: creator_wallet,
          target_type: 'x_account',
          target_id: twitter,
          relationship: 'impersonated',
          confidence_score: result.confidence / 100,
          detected_by: 'social-larp-detector',
          metadata: { verdict: result.verdict, twitterCheck: result.checks.twitterCheck },
        });
      }

      for (const entry of meshEntries) {
        await supabase.from('reputation_mesh').insert(entry).then(r => {
          if (r.error) console.warn('[LARP] Mesh insert error:', r.error.message);
        });
      }

      // Create admin notification
      await supabase.from('admin_notifications').insert({
        notification_type: 'larp_detected',
        title: `🎭 LARP Detected: $${token_symbol}`,
        message: `Dev ${creator_wallet.slice(0, 8)}... is impersonating real brands via fake socials. Verdict: ${result.verdict}. Flags: ${result.flags.join(', ')}`,
        metadata: {
          token_mint,
          token_symbol,
          creator_wallet,
          larp_result: result,
        },
      });
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[LARP DETECTOR] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
