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
        console.log('🛡️ CLOUDFLARE CHALLENGE DETECTED - Using optimized Function endpoint');
        const functionUrl = `https://production-sfo.browserless.io/function?token=${browserlessApiKey}`;
        console.log('Function URL:', functionUrl.replace(browserlessApiKey, 'REDACTED'));
        
        // Enhanced challenge handler with proper string escaping
        const challengeScript = `
          export default async ({ page, context }) => {
            console.log('🚀 Starting enhanced challenge handler');
            
            try {
              // Set realistic user agent
              await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
              
              // Set viewport through evaluate since setViewportSize isn't available in Browserless
              await page.evaluate(() => {
                Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1920 });
                Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 1080 });
              });
              
              // Navigate to page with load wait
              console.log('🔗 Navigating to: ${url}');
              await page.goto('${url}', { 
                waitUntil: 'load', 
                timeout: 60000 
              });
              console.log('✅ Page loaded, checking for challenge...');
              
              // Initial wait for page to stabilize
              await new Promise(resolve => setTimeout(resolve, 5000));
              
              let finalResult = {
                success: false,
                message: 'Challenge processing started',
                html: '',
                finalUrl: page.url(),
                finalTitle: '',
                challengeDetected: false,
                challengeType: 'none',
                screenshot: null
              };
              
              // Check for Cloudflare challenge indicators
              const pageContent = await page.content();
              const pageTitle = await page.title();
              
              const challengeIndicators = [
                pageTitle.includes('Just a moment'),
                pageTitle.includes('Please wait'),
                pageContent.includes('Checking your browser'),
                pageContent.includes('DDoS protection'),
                pageContent.includes('cf-browser-verification'),
                pageContent.includes('challenge-platform')
              ];
              
              const challengeDetected = challengeIndicators.some(indicator => indicator);
              finalResult.challengeDetected = challengeDetected;
              
              if (challengeDetected) {
                console.log('🛡️ Cloudflare challenge detected - initiating patient wait...');
                finalResult.challengeType = 'detected';
                
                // Extended wait with multiple check methods - up to 90 seconds
                for (let attempt = 0; attempt < 45; attempt++) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // Multiple success indicators
                  const currentTitle = await page.title();
                  const currentUrl = page.url();
                  const currentContent = await page.content();
                  
                  // Check if challenge is complete
                  const successIndicators = [
                    !currentTitle.includes('Just a moment'),
                    !currentTitle.includes('Please wait'),
                    !currentContent.includes('Checking your browser'),
                    currentContent.includes('dexscreener') && currentContent.length > 50000,
                    currentUrl !== '${url}' || currentContent.includes('chart-container')
                  ];
                  
                  const challengeComplete = successIndicators.filter(Boolean).length >= 3;
                  
                  if (challengeComplete) {
                    console.log('✅ Challenge completed successfully after ' + (attempt * 2) + ' seconds!');
                    finalResult.success = true;
                    finalResult.message = 'Challenge completed successfully';
                    finalResult.challengeType = 'completed';
                    break;
                  }
                  
                  if (attempt % 5 === 0) {
                    console.log('⏳ Still waiting for challenge completion... (' + (attempt * 2) + '/90s)');
                  }
                }
              } else {
                console.log('✅ No challenge detected, page loaded successfully');
                finalResult.success = true;
                finalResult.message = 'Page loaded without challenge';
              }
              
              // Handle wait actions
              const waitActions = ${JSON.stringify(actions.filter(a => a.type === 'wait'))};
              for (const waitAction of waitActions) {
                const delay = Math.min(waitAction.delay || 1000, 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
              
              // Take screenshot if needed
              if (${hasScreenshotAction}) {
                try {
                  finalResult.screenshot = await page.screenshot({ 
                    type: 'png', 
                    encoding: 'base64',
                    fullPage: false,
                    clip: { x: 0, y: 0, width: 1920, height: 1080 }
                  });
                  console.log('📸 Screenshot captured successfully');
                } catch (e) {
                  console.log('❌ Screenshot failed: ' + e.message);
                }
              }
              
              // Final page state
              finalResult.html = await page.content();
              finalResult.finalUrl = page.url();
              finalResult.finalTitle = await page.title();
              
              // Final success check
              if (!finalResult.success && finalResult.challengeDetected) {
                const stillChallenged = finalResult.finalTitle.includes('Just a moment');
                if (!stillChallenged) {
                  finalResult.success = true;
                  finalResult.message = 'Challenge completed (final check)';
                  finalResult.challengeType = 'completed';
                }
              }
              
              console.log('🎯 Final result:', JSON.stringify({
                success: finalResult.success,
                challengeDetected: finalResult.challengeDetected,
                challengeType: finalResult.challengeType,
                finalTitle: finalResult.finalTitle,
                finalUrl: finalResult.finalUrl
              }));
              
              return finalResult;
              
            } catch (error) {
              console.error('❌ Challenge handler error:', error);
              return {
                success: false,
                error: error.message,
                finalUrl: page.url(),
                finalTitle: await page.title().catch(() => 'Error'),
                challengeDetected: true,
                challengeType: 'error'
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
        console.log('Function result:', functionResult.success);
        
        // Build results
        const results = [
          {
            action: 'navigate',
            success: true,
            url: url,
            title: 'Navigation completed'
          }
        ];

        actions.forEach(action => {
          if (action.type === 'cloudflare_challenge') {
            results.push({
              action: 'cloudflare_challenge',
              success: functionResult.success,
              message: functionResult.message || 'Challenge processing completed',
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
              message: functionResult.screenshot ? 'Screenshot captured' : 'Screenshot failed'
            });
          }
        });

        result = {
          success: functionResult.success,
          finalUrl: functionResult.finalUrl || url,
          finalTitle: functionResult.finalTitle || 'Processing completed',
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

        actions.forEach(action => {
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
              screenshot: `data:image/png;base64,${screenshotBase64}`,
              message: 'Screenshot captured successfully'
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
        // No specific action type detected, return error
        result = {
          success: false,
          error: 'No supported action types detected',
          finalUrl: url,
          finalTitle: 'Error',
          results: [],
          totalActions: 0
        };
      }
    } catch (fetchError) {
      console.error('Error during browser operation:', fetchError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Browser automation failed',
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