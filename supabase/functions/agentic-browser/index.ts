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
        console.log('🛡️ CLOUDFLARE CHALLENGE DETECTED - Using function endpoint with advanced JavaScript handling');
        const functionUrl = `https://production-sfo.browserless.io/function?token=${browserlessApiKey}`;
        console.log('Function URL:', functionUrl.replace(browserlessApiKey, 'REDACTED'));
        
                // Create an optimized script to handle Cloudflare challenges faster
        const challengeScript = `
          export default async ({ page, context }) => {
            console.log('🚀 Starting fast Cloudflare challenge handler');
            
            try {
              // Navigate with shorter timeout
              console.log('Navigating to URL...');
              await page.goto('${url}', { waitUntil: 'domcontentloaded', timeout: 30000 });
              
              // Quick initial check for challenge
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              const pageTitle = await page.title();
              let challengeDetected = pageTitle.includes('Just a moment');
              let challengeType = 'unknown';
              
              if (!challengeDetected) {
                // Quick element check
                const challengeElement = await page.$('[name="cf-turnstile-response"]');
                if (challengeElement) {
                  challengeDetected = true;
                  challengeType = 'cf-turnstile-response';
                }
              }
              
              if (challengeDetected) {
                console.log('✅ Challenge detected, waiting for completion...');
                
                // Wait for completion with shorter timeout
                const completionResult = await Promise.race([
                  // Wait for navigation (most reliable indicator of success)
                  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).then(() => 'navigation'),
                  // Wait for title change
                  page.waitForFunction(
                    () => !document.title.includes('Just a moment'),
                    { timeout: 25000 }
                  ).then(() => 'title_change'),
                  // Wait for token to be filled
                  page.waitForFunction(
                    () => {
                      const token = document.querySelector('[name="cf-turnstile-response"]')?.value;
                      return token && token.length > 0;
                    },
                    { timeout: 25000 }
                  ).then(() => 'token_filled')
                ]).catch(() => 'timeout');
                
                console.log('🎯 Challenge result:', completionResult);
                
                if (completionResult !== 'timeout') {
                  console.log('✅ Challenge completed successfully!');
                  // Short stabilization wait
                  await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                  console.log('⚠️ Challenge timeout, proceeding anyway');
                }
              } else {
                console.log('ℹ️ No challenge detected');
              }

              // Take screenshot after challenge handling
              let screenshot = null;
              const hasScreenshot = ${hasScreenshotAction};
              
              if (hasScreenshot) {
                console.log('📸 Taking screenshot...');
                try {
                  screenshot = await page.screenshot({ 
                    type: 'png', 
                    encoding: 'base64',
                    fullPage: false 
                  });
                  console.log('✅ Screenshot captured');
                } catch (screenshotError) {
                  console.log('❌ Screenshot failed:', screenshotError.message);
                }
              }

              // Handle wait actions (but cap them to avoid timeout)
              const waitActions = ${JSON.stringify(actions.filter(a => a.type === 'wait'))};
              for (const waitAction of waitActions) {
                const delay = Math.min(waitAction.delay || 1000, 5000); // Cap wait at 5s
                console.log('⏳ Wait action:', delay, 'ms');
                await new Promise(resolve => setTimeout(resolve, delay));
              }
              
              return {
                success: true,
                message: 'Challenge handling completed',
                html: await page.content(),
                finalUrl: page.url(),
                finalTitle: await page.title(),
                challengeDetected,
                challengeType,
                screenshot: screenshot
              };
              
            } catch (error) {
              console.error('❌ Error in challenge handler:', error);
              return {
                success: false,
                error: error.message,
                html: await page.content().catch(() => ''),
                finalUrl: page.url(),
                finalTitle: await page.title().catch(() => 'Error')
              };
            }
          };
        `;
        
        response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: challengeScript,
            context: {}
          })
        });

        console.log('Function API response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Browserless Function API error:', response.status, errorText);
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

        const functionResult = await response.json();
        console.log('✅ Cloudflare challenge handling completed');
        
        // Build results for cloudflare challenge
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
              success: functionResult.success,
              message: functionResult.message || (functionResult.success ? 'Challenge handled' : 'Challenge failed'),
              challengeDetected: functionResult.challengeDetected || false,
              challengeType: functionResult.challengeType || 'unknown',
              html: functionResult.html,
              error: functionResult.error
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
              success: functionResult.screenshot ? true : false,
              screenshot: functionResult.screenshot ? `data:image/png;base64,${functionResult.screenshot}` : null,
              message: functionResult.screenshot ? 'Screenshot captured after challenge completion' : 'Screenshot failed'
            });
          }
        });

        result = {
          success: functionResult.success,
          finalUrl: functionResult.finalUrl || url,
          finalTitle: functionResult.finalTitle || 'Cloudflare challenge handling completed',
          results,
          totalActions: actions.length
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