import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { createApiLogger } from '../_shared/api-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/** Strip full URLs, @symbols, whitespace → bare lowercase handle */
function cleanHandle(raw: string): string {
  let h = raw.trim();
  h = h.replace(/^["'"]+|["'"]+$/g, '');
  h = h.replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i, '');
  h = h.replace(/[?/].*$/, '');
  h = h.replace(/^@/, '');
  return h.toLowerCase().trim();
}

function extractTelegramLinks(text: string): string[] {
  const patterns = [
    /https?:\/\/t\.me\/[a-zA-Z0-9_]+/gi,
    /https?:\/\/telegram\.me\/[a-zA-Z0-9_]+/gi,
    /t\.me\/[a-zA-Z0-9_]+/gi,
  ];
  const links = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const match of matches) {
      let link = match;
      if (!link.startsWith('http')) link = `https://${link}`;
      link = link.replace('telegram.me', 't.me');
      links.add(link);
    }
  }
  return Array.from(links);
}

/** Call Apify twitter-user-scraper for a batch of handles, return profile data */
async function scrapeProfilesViaApify(handles: string[], apiKey: string): Promise<any[]> {
  const actorId = 'apidojo~twitter-user-scraper';
  
  const logger = createApiLogger({
    serviceName: 'apify',
    endpoint: `${actorId}/tg-hunter`,
    method: 'POST',
    functionName: 'twitter-tg-hunter',
    metadata: { handleCount: handles.length },
  });

  const response = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        twitterHandles: handles,
        maxItems: handles.length,
        getFollowers: false,
        getFollowing: false,
        getRetweeters: false,
      }),
    }
  );

  await logger.complete(response.status);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Apify error ${response.status}: ${errText.slice(0, 200)}`);
  }

  return await response.json();
}

/** Process a single Apify profile result into DB fields */
function processProfile(profile: any) {
  const username = (profile.userName || '').toLowerCase();
  if (!username) return null;

  // Build text blob to search for TG links
  const textParts = [profile.description || ''];
  
  // Extract URLs from entities
  const descUrls = profile.entities?.description?.urls || [];
  const profileUrls = profile.entities?.url?.urls || [];
  for (const u of [...descUrls, ...profileUrls]) {
    if (u.expanded_url) textParts.push(u.expanded_url);
    if (u.display_url) textParts.push(u.display_url);
  }
  if (profile.url) textParts.push(profile.url);

  const allText = textParts.join('\n');
  const telegramLinks = extractTelegramLinks(allText);

  // Determine account status
  let accountStatus: 'active' | 'suspended' | 'deleted' | 'unknown' = 'active';
  if (profile.withheldInCountries?.length) accountStatus = 'suspended';

  return {
    handle: username,
    bio: (profile.description || '').slice(0, 500) || null,
    followers: profile.followers || 0,
    telegram_links: telegramLinks,
    account_status: accountStatus,
    last_scanned_at: new Date().toISOString(),
    scan_count: 1,
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(withRunLog('twitter-tg-hunter', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, handles, handle } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY');

    // ── Clean existing handles in DB ──
    if (action === 'clean-handles') {
      const { data: all, error: fetchErr } = await supabase
        .from('twitter_tg_targets')
        .select('id, handle');
      if (fetchErr) throw fetchErr;

      let cleaned = 0;
      for (const row of all || []) {
        const clean = cleanHandle(row.handle);
        if (clean !== row.handle) {
          const { error } = await supabase
            .from('twitter_tg_targets')
            .update({ handle: clean })
            .eq('id', row.id);
          if (!error) cleaned++;
        }
      }

      return new Response(
        JSON.stringify({ success: true, cleaned, total: all?.length || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Import handles ──
    if (action === 'import-list') {
      if (!handles || !Array.isArray(handles) || handles.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'handles array is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const rows = handles.map((h: string) => ({
        handle: cleanHandle(h),
        is_active: true,
      }));

      const { data, error } = await supabase
        .from('twitter_tg_targets')
        .upsert(rows, { onConflict: 'handle', ignoreDuplicates: true })
        .select();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, imported: data?.length || 0, total: handles.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Scan single handle via Apify ──
    if (action === 'scan-handle') {
      if (!handle) {
        return new Response(
          JSON.stringify({ success: false, error: 'handle is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!APIFY_API_KEY) {
        return new Response(
          JSON.stringify({ success: false, error: 'APIFY_API_KEY not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const clean = cleanHandle(handle);
      const profiles = await scrapeProfilesViaApify([clean], APIFY_API_KEY);
      
      if (profiles.length === 0) {
        // Account likely deleted/suspended — auto-archive
        await supabase.from('twitter_tg_targets').upsert({
          handle: clean,
          account_status: 'deleted',
          is_archived: true,
          last_scanned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'handle' });

        return new Response(
          JSON.stringify({ success: true, handle: clean, account_status: 'deleted', telegram_links: [], followers: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const processed = processProfile(profiles[0]);
      if (!processed) throw new Error('Failed to process profile');

      await supabase.from('twitter_tg_targets').upsert(processed, { onConflict: 'handle' });

      return new Response(
        JSON.stringify({
          success: true,
          handle: processed.handle,
          telegram_links: processed.telegram_links,
          followers: processed.followers,
          account_status: processed.account_status,
          bio: processed.bio?.slice(0, 200),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Scan all missing TG links (batch of 5 via single Apify call) ──
    if (action === 'scan-all-missing') {
      if (!APIFY_API_KEY) {
        return new Response(
          JSON.stringify({ success: false, error: 'APIFY_API_KEY not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const batchSize = 5;

      const { data: targets, error: fetchErr } = await supabase
        .from('twitter_tg_targets')
        .select('handle, account_status')
        .eq('is_active', true)
        .or('telegram_links.is.null,telegram_links.eq.[]')
        .not('account_status', 'in', '("suspended","deleted")')
        .order('last_scanned_at', { ascending: true, nullsFirst: true })
        .limit(batchSize);

      if (fetchErr) throw fetchErr;
      if (!targets || targets.length === 0) {
        return new Response(
          JSON.stringify({ success: true, scanned: 0, total_eligible: 0, has_more: false, results: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const handleList = targets.map(t => cleanHandle(t.handle));
      console.log(`Scanning ${handleList.length} handles via Apify:`, handleList);

      let profiles: any[] = [];
      try {
        profiles = await scrapeProfilesViaApify(handleList, APIFY_API_KEY);
      } catch (e) {
        console.error('Apify batch scan failed:', e);
        return new Response(
          JSON.stringify({ success: false, error: String(e) }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const results = [];
      const foundUsernames = new Set<string>();

      for (const profile of profiles) {
        const processed = processProfile(profile);
        if (!processed) continue;
        foundUsernames.add(processed.handle);

        await supabase.from('twitter_tg_targets').upsert(processed, { onConflict: 'handle' });
        results.push({
          handle: processed.handle,
          success: true,
          telegram_links: processed.telegram_links,
          account_status: processed.account_status,
          followers: processed.followers,
        });
      }

      // Mark handles not returned by Apify as deleted + auto-archive
      for (const h of handleList) {
        if (!foundUsernames.has(h)) {
          await supabase.from('twitter_tg_targets').upsert({
            handle: h,
            account_status: 'deleted',
            is_archived: true,
            last_scanned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'handle' });
          results.push({ handle: h, success: true, account_status: 'deleted', telegram_links: [] });
        }
      }

      const has_more = targets.length >= batchSize;
      return new Response(
        JSON.stringify({ success: true, scanned: results.length, total_eligible: targets.length, has_more, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('twitter-tg-hunter error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
