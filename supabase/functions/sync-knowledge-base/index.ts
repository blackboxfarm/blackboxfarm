import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { withRunLog } from "../_shared/run-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const SITE_PAGES = [
  { path: '/', category: 'marketing', title: 'Homepage — What is BlackBox Farm', keywords: ['home', 'blackbox', 'holdersintel', 'what is', 'about'] },
  { path: '/holders', category: 'features', title: 'Holders Analysis Tool', keywords: ['holders', 'scan', 'token', 'analysis', 'bagless'] },
  { path: '/bubblemap', category: 'features', title: 'Bubblemap — Developer Reputation & Network Forensics', keywords: ['bubblemap', 'developer', 'reputation', 'kyc', 'wallet', 'forensics', 'sybil', 'cluster', 'dev wallet', 'x community'] },
  { path: '/intel', category: 'features', title: 'Intel Briefings — Research Reports', keywords: ['intel', 'briefing', 'research', 'report', 'article'] },
  { path: '/oracle', category: 'features', title: 'Oracle — Token Risk Analysis', keywords: ['oracle', 'risk', 'score', 'safety', 'audit'] },
  { path: '/advertise', category: 'billing', title: 'Advertising & Banner Ads', keywords: ['advertise', 'banner', 'ad', 'sponsor', 'promote'] },
  { path: '/register', category: 'onboarding', title: 'Registration & Getting Started', keywords: ['register', 'signup', 'account', 'start', 'join'] },
  { path: '/dashboard', category: 'features', title: 'Dashboard — User Hub', keywords: ['dashboard', 'account', 'profile', 'settings'] },
  { path: '/faq', category: 'faq', title: 'Frequently Asked Questions', keywords: ['faq', 'help', 'question', 'support'] },
  { path: '/share', category: 'marketing', title: 'Share on Socials', keywords: ['share', 'social', 'twitter', 'telegram', 'referral'] },
];

Deno.serve(withRunLog('sync-knowledge-base', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return new Response(JSON.stringify({ success: false, error: 'Firecrawl not configured' }), { status: 500, headers: corsHeaders });
    }

    const baseUrl = 'https://blackbox.farm';
    const results: { page: string; status: string; error?: string }[] = [];
    let synced = 0;
    let failed = 0;

    for (const page of SITE_PAGES) {
      try {
        const url = `${baseUrl}${page.path}`;
        console.log(`[sync-kb] Scraping ${url}...`);

        const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            onlyMainContent: true,
            waitFor: 5000,
          }),
        });

        if (!scrapeRes.ok) {
          const errText = await scrapeRes.text();
          console.error(`[sync-kb] Scrape failed for ${url}: ${scrapeRes.status} ${errText}`);
          results.push({ page: page.path, status: 'error', error: `HTTP ${scrapeRes.status}` });
          failed++;
          continue;
        }

        const scrapeData = await scrapeRes.json();
        const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';

        if (!markdown || markdown.length < 50) {
          results.push({ page: page.path, status: 'skipped', error: 'Content too short or empty' });
          failed++;
          continue;
        }

        // Truncate to ~4000 chars to keep knowledge bins manageable
        const truncated = markdown.length > 4000 ? markdown.slice(0, 4000) + '\\n\\n[Content truncated — see full page at ' + url + ']' : markdown;

        // Add internal link reference
        const content = `Source: ${url}\\n\\n${truncated}`;

        // Upsert: match by title to avoid duplicates
        const { error: upsertErr } = await supabase
          .from('bot_knowledge_bins')
          .upsert({
            category: page.category,
            title: `[Website] ${page.title}`,
            content,
            keywords: [...page.keywords, 'website', 'blackbox.farm'],
            priority: 50, // Medium priority — manual entries can override
            is_active: true,
          }, { 
            onConflict: 'title',
            ignoreDuplicates: false,
          });

        if (upsertErr) {
          // Title might not have unique constraint, try insert/update manually
          const { data: existing } = await supabase
            .from('bot_knowledge_bins')
            .select('id')
            .eq('title', `[Website] ${page.title}`)
            .limit(1);

          if (existing && existing.length > 0) {
            await supabase
              .from('bot_knowledge_bins')
              .update({ content, keywords: [...page.keywords, 'website', 'blackbox.farm'], updated_at: new Date().toISOString() })
              .eq('id', existing[0].id);
          } else {
            const { error: insertErr } = await supabase
              .from('bot_knowledge_bins')
              .insert({
                category: page.category,
                title: `[Website] ${page.title}`,
                content,
                keywords: [...page.keywords, 'website', 'blackbox.farm'],
                priority: 50,
                is_active: true,
              });
            if (insertErr) {
              console.error(`[sync-kb] Insert failed for ${page.path}:`, insertErr);
              results.push({ page: page.path, status: 'error', error: insertErr.message });
              failed++;
              continue;
            }
          }
        }

        results.push({ page: page.path, status: 'synced' });
        synced++;
        console.log(`[sync-kb] ✓ Synced ${page.path} (${markdown.length} chars)`);

        // Be polite — small delay between scrapes
        await new Promise(r => setTimeout(r, 1500));
      } catch (pageErr) {
        console.error(`[sync-kb] Error on ${page.path}:`, pageErr);
        results.push({ page: page.path, status: 'error', error: pageErr instanceof Error ? pageErr.message : String(pageErr) });
        failed++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      synced,
      failed,
      total: SITE_PAGES.length,
      results,
    }), { headers: corsHeaders });

  } catch (error) {
    console.error('[sync-kb] Fatal error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}));
