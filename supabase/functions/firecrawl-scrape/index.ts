import { withRunLog } from '../_shared/run-logger.ts';
import { smartScrape } from '../_shared/scraper-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(withRunLog('firecrawl-scrape', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, options } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Scraping URL:', formattedUrl);

    const result = await smartScrape({
      url: formattedUrl,
      functionName: 'firecrawl-scrape',
      formats: options?.formats || ['markdown', 'links'],
      onlyMainContent: options?.onlyMainContent ?? true,
      waitFor: options?.waitFor,
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scrape successful via ${result.provider}${result.fellBack ? ' (fallback)' : ''}`);

    // Return in Firecrawl-compatible format for existing consumers
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          markdown: result.markdown,
          html: result.html,
          links: result.links || [],
          metadata: result.metadata || {},
        },
        provider: result.provider,
        fell_back: result.fellBack,
        response_time_ms: result.responseTimeMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
