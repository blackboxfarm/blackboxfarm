import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { checkFirecrawlBudget, handleFirecrawlError } from '../_shared/firecrawl-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function detectAccountStatus(markdown: string, statusCode?: number): 'active' | 'suspended' | 'deleted' | 'unknown' {
  const lower = markdown.toLowerCase();
  if (lower.includes('account suspended') || lower.includes('this account has been suspended')) return 'suspended';
  if (lower.includes("this account doesn't exist") || lower.includes('page not found') || lower.includes('hmm...this page doesn') || statusCode === 404) return 'deleted';
  if (lower.includes('caution: this account is temporarily restricted') || lower.includes('withheld')) return 'suspended';
  if (markdown.length < 50 && !lower.includes('follow')) return 'unknown';
  return 'active';
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
      // Normalize
      link = link.replace('telegram.me', 't.me');
      links.add(link);
    }
  }
  return Array.from(links);
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

    // ── Import handles ──
    if (action === 'import-list') {
      if (!handles || !Array.isArray(handles) || handles.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'handles array is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const rows = handles.map((h: string) => ({
        handle: h.replace('@', '').trim().toLowerCase(),
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

    // ── Scan single handle ──
    if (action === 'scan-handle') {
      if (!handle) {
        return new Response(
          JSON.stringify({ success: false, error: 'handle is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const cleanHandle = handle.replace('@', '').trim().toLowerCase();

      const guard = checkFirecrawlBudget('twitter-tg-hunter');
      if (!guard.allowed) {
        return new Response(
          JSON.stringify({ success: false, error: guard.reason }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
      if (!apiKey) {
        return new Response(
          JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Scrape the Twitter profile page
      const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `https://x.com/${cleanHandle}`,
          formats: ['markdown', 'links'],
          onlyMainContent: false,
          storeInCache: false,
        }),
      });

      if (!scrapeResponse.ok) {
        const errData = await scrapeResponse.json().catch(() => ({}));
        await handleFirecrawlError('twitter-tg-hunter', scrapeResponse.status, JSON.stringify(errData));
        return new Response(
          JSON.stringify({ success: false, error: `Scrape failed: ${scrapeResponse.status}` }),
          { status: scrapeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const scrapeData = await scrapeResponse.json();
      const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
      const links = scrapeData.data?.links || scrapeData.links || [];

      // Detect account status
      const accountStatus = detectAccountStatus(markdown, scrapeResponse.status === 404 ? 404 : undefined);

      // Extract telegram links from markdown content and discovered links
      const allText = markdown + '\n' + links.join('\n');
      const telegramLinks = extractTelegramLinks(allText);

      // Extract bio (rough heuristic from markdown)
      let bio = '';
      const mdLines = markdown.split('\n').filter((l: string) => l.trim());
      if (mdLines.length > 2) {
        bio = mdLines.slice(1, 4).join(' ').slice(0, 500);
      }

      // Extract follower count from markdown
      let followers = 0;
      const followerMatch = markdown.match(/(\d[\d,.]*[KkMm]?)\s*(?:Followers|followers)/);
      if (followerMatch) {
        let num = followerMatch[1].replace(/,/g, '');
        if (num.endsWith('K') || num.endsWith('k')) {
          followers = Math.round(parseFloat(num) * 1000);
        } else if (num.endsWith('M') || num.endsWith('m')) {
          followers = Math.round(parseFloat(num) * 1_000_000);
        } else {
          followers = parseInt(num) || 0;
        }
      }

      // Update the record
      const { data: updated, error: updateErr } = await supabase
        .from('twitter_tg_targets')
        .upsert({
          handle: cleanHandle,
          bio: bio || null,
          followers,
          telegram_links: telegramLinks,
          account_status: accountStatus,
          last_scanned_at: new Date().toISOString(),
          scan_count: 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'handle' })
        .select()
        .single();

      // Increment scan_count
      await supabase.rpc('increment_counter', { 
        table_name: 'twitter_tg_targets',
        column_name: 'scan_count',
        row_id: updated?.id
      }).catch(() => {
        // If RPC doesn't exist, that's fine — we set scan_count above
      });

      if (updateErr) throw updateErr;

      return new Response(
        JSON.stringify({
          success: true,
          handle: cleanHandle,
          telegram_links: telegramLinks,
          followers,
          account_status: accountStatus,
          bio: bio?.slice(0, 200),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Scan all missing TG links ──
    if (action === 'scan-all-missing') {
      // Only scan active accounts that have no TG links and aren't dead
      const { data: targets, error: fetchErr } = await supabase
        .from('twitter_tg_targets')
        .select('handle, account_status')
        .eq('is_active', true)
        .or('telegram_links.is.null,telegram_links.eq.[]')
        .not('account_status', 'in', '("suspended","deleted")')
        .order('last_scanned_at', { ascending: true, nullsFirst: true });

      if (fetchErr) throw fetchErr;

      const results = [];
      for (const target of targets || []) {
        const guard = checkFirecrawlBudget('twitter-tg-hunter-batch');
        if (!guard.allowed) {
          console.warn('Budget exhausted during batch, stopping');
          break;
        }

        try {
          const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twitter-tg-hunter`;
          const res = await fetch(selfUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'scan-handle', handle: target.handle }),
          });
          const result = await res.json();
          results.push({ handle: target.handle, ...result });
        } catch (e) {
          results.push({ handle: target.handle, success: false, error: String(e) });
        }

        // Rate limit: 2s between scrapes
        await new Promise(r => setTimeout(r, 2000));
      }

      return new Response(
        JSON.stringify({ success: true, scanned: results.length, total_eligible: targets?.length || 0, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
        .limit(5);

      if (fetchErr) throw fetchErr;

      const results = [];
      for (const target of targets || []) {
        const guard = checkFirecrawlBudget('twitter-tg-hunter-batch');
        if (!guard.allowed) {
          console.warn('Budget exhausted during batch, stopping');
          break;
        }

        try {
          // Recursive call via fetch to self
          const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twitter-tg-hunter`;
          const res = await fetch(selfUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'scan-handle', handle: target.handle }),
          });
          const result = await res.json();
          results.push({ handle: target.handle, ...result });
        } catch (e) {
          results.push({ handle: target.handle, success: false, error: String(e) });
        }

        // Small delay between scrapes
        await new Promise(r => setTimeout(r, 2000));
      }

      return new Response(
        JSON.stringify({ success: true, scanned: results.length, results }),
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
