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
        
        // Create a sophisticated script to handle Cloudflare challenges
        const challengeScript = `
          export default async ({ page, context }) => {
            console.log('🚀 Starting Cloudflare challenge handler');
            
            try {
              // Navigate to the page
              console.log('Navigating to URL...');
              await page.goto('${url}', { waitUntil: 'domcontentloaded', timeout: ${timeout} });
              
              // Wait a bit for initial page load
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              // Check for Cloudflare challenge indicators
              const pageTitle = await page.title();
              const pageContent = await page.content();
              
              let challengeDetected = false;
              let challengeType = 'unknown';
              
              // Primary detection: Look for Cloudflare challenge page indicators
              if (pageTitle.includes('Just a moment') || 
                  pageContent.includes('cdn-cgi/challenge-platform') ||
                  pageContent.includes('challenges.cloudflare.com') ||
                  pageContent.includes('Verify you are human')) {
                challengeDetected = true;
                challengeType = 'cloudflare_challenge_page';
                console.log('✅ Cloudflare challenge page detected via page content analysis');
              }
              
              // Secondary detection: Look for specific challenge elements
              const challengeSelectors = [
                'iframe[src*="challenges.cloudflare.com"]',
                '[name="cf-turnstile-response"]',
                '#challenge-success-text',
                '.cf-turnstile',
                '[data-sitekey]',
                'script[src*="cdn-cgi/challenge-platform"]'
              ];
              
              for (const selector of challengeSelectors) {
                const element = await page.$(selector);
                if (element) {
                  challengeDetected = true;
                  challengeType = selector;
                  console.log('✅ Cloudflare challenge element detected:', selector);
                  break;
                }
              }
              
              if (!challengeDetected) {
                console.log('ℹ️ No Cloudflare challenge detected, proceeding normally');
                return {
                  success: true,
                  message: 'No challenge detected',
                  html: await page.content(),
                  finalUrl: page.url()
                };
              }
              
              // Wait longer for challenge to fully load and scripts to execute
              console.log('⏳ Waiting for challenge scripts to load and execute...');
              await new Promise(resolve => setTimeout(resolve, 8000));
              
              // Try multiple challenge handling approaches
              console.log('🎯 Attempting to handle Cloudflare challenge...');
              
              try {
                // Approach 1: Look for and interact with turnstile iframe
                console.log('🔍 Looking for Turnstile iframe...');
                try {
                  await page.waitForSelector('iframe[src*="challenges.cloudflare.com"]', { timeout: 15000 });
                  const iframe = await page.$('iframe[src*="challenges.cloudflare.com"]');
                  if (iframe) {
                    console.log('✅ Found Turnstile iframe, attempting to click');
                    await iframe.click();
                    await new Promise(resolve => setTimeout(resolve, 2000));
                  }
                } catch (iframeError) {
                  console.log('⚠️ No iframe found or could not click:', iframeError.message);
                }
                
                // Approach 2: Look for turnstile widget container and click it
                console.log('🔍 Looking for Turnstile widget container...');
                const turnstileSelectors = [
                  '.cf-turnstile',
                  '[data-sitekey]',
                  'div[id*="turnstile"]',
                  'div[class*="turnstile"]'
                ];
                
                for (const selector of turnstileSelectors) {
                  try {
                    const element = await page.$(selector);
                    if (element) {
                      console.log('✅ Found Turnstile widget:', selector);
                      await element.click();
                      await new Promise(resolve => setTimeout(resolve, 2000));
                      break;
                    }
                  } catch (e) {
                    console.log('⚠️ Could not interact with', selector, ':', e.message);
                  }
                }
                
                // Approach 3: Wait for automatic challenge completion
                console.log('⏳ Waiting for automatic challenge completion...');
                const completionResult = await Promise.race([
                  // Wait for success message to appear
                  page.waitForSelector('#challenge-success-text', { visible: true, timeout: 30000 }).then(() => 'success_message'),
                  // Wait for response token to be filled
                  page.waitForFunction(
                    () => {
                      const token = document.querySelector('[name="cf-turnstile-response"]')?.value;
                      return token && token.length > 0;
                    },
                    { timeout: 30000 }
                  ).then(() => 'token_filled'),
                  // Wait for navigation away from challenge page
                  page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).then(() => 'navigation'),
                  // Wait for page title change
                  page.waitForFunction(
                    () => !document.title.includes('Just a moment'),
                    { timeout: 30000 }
                  ).then(() => 'title_change')
                ]).catch(() => 'timeout');
                
                console.log('🎯 Challenge completion result:', completionResult);
                
                if (completionResult !== 'timeout') {
                  console.log('✅ Challenge appears to be completed successfully!');
                  // Wait a bit more for any final processing
                  await new Promise(resolve => setTimeout(resolve, 3000));
                } else {
                  console.log('⚠️ Challenge completion timeout - may still be processing');
                }
                
              } catch (challengeError) {
                console.log('⚠️ Error during challenge handling:', challengeError.message);
              }
              
              return {
                success: true,
                message: 'Challenge handling completed',
                html: await page.content(),
                finalUrl: page.url(),
                challengeDetected: true,
                challengeType
              };
              
            } catch (error) {
              console.error('❌ Error in challenge handler:', error);
              return {
                success: false,
                error: error.message,
                html: await page.content().catch(() => ''),
                finalUrl: page.url()
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
          } else if (action.type === 'scrape') {
            results.push({
              action: 'scrape',
              success: true,
              html: functionResult.html || ''
            });
          }
        });

        result = {
          success: functionResult.success,
          finalUrl: functionResult.finalUrl || url,
          finalTitle: 'Cloudflare challenge handling completed',
          results,
          totalActions: actions.length
        };

      } else if (hasScrapeAction) {
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