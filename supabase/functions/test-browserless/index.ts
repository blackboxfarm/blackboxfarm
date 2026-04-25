import { scrapeHtml, scrapeText } from '../_shared/browserless-scraper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let url = 'https://dexscreener.com/solana';
    try {
      const body = await req.json();
      if (body.url) url = body.url;
    } catch { /* use default */ }

    console.log(`[test-browserless] Scraping: ${url}`);

    // Try /content first (HTML)
    const htmlResult = await scrapeHtml(url, { waitMs: 5000 });
    
    const summary = {
      url,
      success: htmlResult.success,
      title: htmlResult.title || null,
      html_length: htmlResult.html?.length || 0,
      html_preview: htmlResult.html?.slice(0, 500) || null,
      error: htmlResult.error || null,
      elapsed_ms: htmlResult.elapsed_ms,
    };

    console.log(`[test-browserless] Result: success=${summary.success}, html=${summary.html_length} chars, ${summary.elapsed_ms}ms`);

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[test-browserless] Error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
