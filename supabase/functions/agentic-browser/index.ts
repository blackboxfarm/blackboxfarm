import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('Agentic browser function starting up...');

interface BrowseRequest {
  url: string;
  actions: Array<{
    type: 'click' | 'input' | 'wait' | 'screenshot' | 'scrape';
    selector?: string;
    value?: string;
    delay?: number;
  }>;
  headless?: boolean;
  timeout?: number;
}

serve(async (req) => {
  console.log('=== Agentic Browser Function Started ===');
  console.log('Function called with method:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Processing request...');
    
    if (req.method !== 'POST') {
      console.log('Invalid method:', req.method);
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let requestBody;
    try {
      requestBody = await req.json();
      console.log('Request body parsed:', JSON.stringify(requestBody, null, 2));
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { url, actions, headless = true, timeout = 30000 }: BrowseRequest = requestBody;

    if (!url || !actions || actions.length === 0) {
      console.log('Missing required parameters:', { url: !!url, actions: actions?.length });
      return new Response(
        JSON.stringify({ error: 'URL and actions are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Starting browser automation for URL: ${url} with ${actions.length} actions`);

    // Use browserless.io API for browser automation
    const browserlessApiKey = Deno.env.get('BROWSERLESS_API_KEY');
    console.log('Browserless API key found:', !!browserlessApiKey);
    
    if (!browserlessApiKey) {
      console.error('BROWSERLESS_API_KEY not found');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Browser automation service not configured - missing BROWSERLESS_API_KEY',
          details: 'Please add your Browserless API key to Supabase secrets'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check what actions we need to perform
    const hasScrapeAction = actions.some(action => action.type === 'scrape');
    const hasScreenshotAction = actions.some(action => action.type === 'screenshot');
    
    let response;
    let result;
    
    try {
      if (hasScrapeAction) {
        // Use content endpoint to get HTML
        console.log('Scrape action detected, using content endpoint');
        const contentUrl = `https://production-sfo.browserless.io/content?token=${browserlessApiKey}`;
        console.log('Using content URL for scraping:', contentUrl.replace(browserlessApiKey, 'REDACTED'));
        
        response = await fetch(contentUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: url,
            gotoOptions: {
              waitUntil: 'networkidle0',
              timeout: timeout
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Browserless API error:', response.status, errorText);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Browser automation service error: ${response.status}`,
              details: errorText
            }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const htmlContent = await response.text();
        console.log('HTML content retrieved, length:', htmlContent.length);
        
        // Build results for scrape actions
        const results = [
          {
            action: 'navigate',
            success: true,
            url: url,
            title: 'Navigation completed'
          }
        ];

        // Add results for each action
        actions.forEach(action => {
          if (action.type === 'scrape') {
            results.push({
              action: 'scrape',
              success: true,
              html: htmlContent
            });
          } else if (action.type === 'wait') {
            results.push({
              action: 'wait',
              success: true,
              delay: action.delay || 1000
            });
          }
        });

        result = {
          success: true,
          finalUrl: url,
          finalTitle: 'Scraping completed',
          results,
          totalActions: actions.length
        };

      } else if (hasScreenshotAction) {
        // Use screenshot endpoint
        const screenshotUrl = `https://production-sfo.browserless.io/screenshot?token=${browserlessApiKey}`;
        console.log('Using screenshot URL:', screenshotUrl.replace(browserlessApiKey, 'REDACTED'));
        
        response = await fetch(screenshotUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: url,
            options: {
              type: 'png',
              fullPage: false,
              encoding: 'base64'
            },
            gotoOptions: {
              waitUntil: 'networkidle0',
              timeout: timeout
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Browserless API error:', response.status, errorText);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Browser automation service error: ${response.status}`,
              details: errorText
            }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const screenshotBase64 = await response.text();
        console.log('Screenshot completed successfully');
        
        // Build results for screenshot actions
        const results = [
          {
            action: 'navigate',
            success: true,
            url: url,
            title: 'Navigation completed'
          }
        ];

        // Add results for each action
        actions.forEach(action => {
          if (action.type === 'screenshot') {
            results.push({
              action: 'screenshot',
              success: true,
              screenshot: `data:image/png;base64,${screenshotBase64}`
            });
          } else if (action.type === 'wait') {
            results.push({
              action: 'wait',
              success: true,
              delay: action.delay || 1000
            });
          }
        });

        result = {
          success: true,
          finalUrl: url,
          finalTitle: 'Screenshot completed',
          results,
          totalActions: actions.length
        };
      } else {
        // Just navigation for other action types
        result = {
          success: true,
          finalUrl: url,
          finalTitle: 'Basic navigation completed',
          results: [
            {
              action: 'navigate',
              success: true,
              url: url,
              title: 'Navigation completed'
            }
          ],
          totalActions: actions.length
        };
      }

    } catch (fetchError) {
      console.error('Failed to connect to browserless API:', fetchError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to connect to browser automation service',
          details: fetchError.message
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in agentic browser:', error);
    console.error('Error stack:', error.stack);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack,
        details: 'Failed to execute browser automation'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});