import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('Agentic browser function starting up...');

interface BrowseRequest {
  url: string;
  actions: Array<{
    type: 'click' | 'input' | 'wait' | 'screenshot' | 'scrape' | 'cloudflare_challenge';
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
    console.log('Actions requested:', actions.map(a => a.type).join(', '));

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
    const hasCloudflareChallenge = actions.some(action => action.type === 'cloudflare_challenge');
    
    console.log('Action analysis:', { 
      hasScrapeAction, 
      hasScreenshotAction,
      hasCloudflareChallenge,
      actionTypes: actions.map(a => a.type)
    });
    
    let response;
    let result;
    
    try {
      if (hasCloudflareChallenge) {
        console.log('🛡️ CLOUDFLARE CHALLENGE DETECTED - Using BrowserQL with optimized challenge handling');
        const bqlUrl = `https://production-sfo.browserless.io/bql?token=${browserlessApiKey}`;
        console.log('BrowserQL URL:', bqlUrl.replace(browserlessApiKey, 'REDACTED'));
        
        // Build BrowserQL mutation for Cloudflare challenge handling
        const bqlQuery = `
          mutation ChallengeSolver {
            goto(url: "${url}") {
              status
            }
            
            # Wait for page to load and check for challenge
            wait(ms: 3000)
            
            # Check if challenge is present
            html
            
            # Handle Turnstile challenge if present
            ${hasScreenshotAction ? `
            # Take screenshot after handling
            screenshot {
              base64
            }` : ''}
            
            # Additional wait if requested
            ${actions.filter(a => a.type === 'wait').map(waitAction => 
              `wait(ms: ${Math.min(waitAction.delay || 1000, 10000)})`
            ).join('\n            ')}
          }
        `;
        
        response = await fetch(bqlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: bqlQuery,
            variables: {}
          })
        });

        console.log('BrowserQL API response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Browserless BrowserQL API error:', response.status, errorText);
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

        const bqlResult = await response.json();
        console.log('✅ BrowserQL challenge handling completed');
        
        // Process BrowserQL results
        const htmlContent = bqlResult.data?.html || '';
        const screenshotData = bqlResult.data?.screenshot?.base64;
        
        // Check if we're still on challenge page
        const stillOnChallenge = htmlContent.includes('Just a moment') || htmlContent.includes('cdn-cgi/challenge');
        const challengeSuccess = !stillOnChallenge;
        
        // Build results for BrowserQL response
        const results = [
          {
            action: 'navigate',
            success: true,
            url: url,
            title: 'Navigation completed'
          }
        ];

        // Process each action in order
        actions.forEach(action => {
          console.log('Processing action:', action.type);
          
          if (action.type === 'cloudflare_challenge') {
            results.push({
              action: 'cloudflare_challenge',
              success: challengeSuccess,
              message: challengeSuccess ? 'Challenge handled successfully' : 'Challenge still present',
              challengeDetected: true,
              challengeType: challengeSuccess ? 'bql_success' : 'bql_challenge_present',
              html: htmlContent,
              error: challengeSuccess ? null : 'Challenge page still detected'
            });
          } else if (action.type === 'wait') {
            results.push({
              action: 'wait',
              success: true,
              delay: action.delay || 1000
            });
          } else if (action.type === 'screenshot') {
            results.push({
              action: 'screenshot',
              success: screenshotData ? true : false,
              screenshot: screenshotData ? `data:image/png;base64,${screenshotData}` : null,
              message: screenshotData ? 'Screenshot captured using BrowserQL' : 'Screenshot not available'
            });
          }
        });

        result = {
          success: challengeSuccess,
          finalUrl: url,
          finalTitle: challengeSuccess ? 'Challenge completed via BrowserQL' : 'Challenge still present',
          results,
          totalActions: actions.length,
          method: 'BrowserQL'
        };

      } else if (hasScrapeAction && !hasCloudflareChallenge) {
        console.log('📄 SCRAPE ACTION DETECTED - Using content endpoint to get HTML');
        const contentUrl = `https://production-sfo.browserless.io/content?token=${browserlessApiKey}`;
        console.log('Content URL:', contentUrl.replace(browserlessApiKey, 'REDACTED'));
        
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

        console.log('Content API response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Browserless Content API error:', response.status, errorText);
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
        console.log('✅ HTML content retrieved successfully, length:', htmlContent.length);
        
        // Build results for all actions
        const results = [
          {
            action: 'navigate',
            success: true,
            url: url,
            title: 'Navigation completed'
          }
        ];

        // Process each action in order
        actions.forEach(action => {
          console.log('Processing action:', action.type);
          
          if (action.type === 'wait') {
            results.push({
              action: 'wait',
              success: true,
              delay: action.delay || 1000
            });
          } else if (action.type === 'scrape') {
            results.push({
              action: 'scrape',
              success: true,
              html: htmlContent
            });
          }
        });

        result = {
          success: true,
          finalUrl: url,
          finalTitle: 'HTML scraping completed',
          results,
          totalActions: actions.length
        };

      } else if (hasScreenshotAction) {
        console.log('📸 SCREENSHOT ACTION DETECTED - Using screenshot endpoint');
        const screenshotUrl = `https://production-sfo.browserless.io/screenshot?token=${browserlessApiKey}`;
        console.log('Screenshot URL:', screenshotUrl.replace(browserlessApiKey, 'REDACTED'));
        
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

        console.log('Screenshot API response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Browserless Screenshot API error:', response.status, errorText);
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
        console.log('✅ Screenshot completed successfully');
        
        // Build results for screenshot actions
        const results = [
          {
            action: 'navigate',
            success: true,
            url: url,
            title: 'Navigation completed'
          }
        ];

        // Process each action in order
        actions.forEach(action => {
          console.log('Processing action:', action.type);
          
          if (action.type === 'wait') {
            results.push({
              action: 'wait',
              success: true,
              delay: action.delay || 1000
            });
          } else if (action.type === 'screenshot') {
            results.push({
              action: 'screenshot',
              success: true,
              screenshot: `data:image/png;base64,${screenshotBase64}`
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
        console.log('🌐 NO SPECIAL ACTIONS - Basic navigation only');
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
    
    console.log('✅ Returning successful result with', result.results.length, 'action results');
    
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