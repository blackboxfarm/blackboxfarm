import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('Agentic browser function starting up...');

interface BrowseRequest {
  url: string;
  actions: Array<{
    type: 'click' | 'input' | 'wait' | 'screenshot';
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
  console.log('Request headers:', Object.fromEntries(req.headers.entries()));
  
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

    const browserlessUrl = `https://chrome.browserless.io/function?token=${browserlessApiKey}`;
    console.log('Using browserless URL:', browserlessUrl.replace(browserlessApiKey, 'REDACTED'));
    
    // Create the automation script
    const automationScript = `
      async ({ page }) => {
        const results = [];
        
        try {
          console.log('Navigating to ${url}...');
          await page.goto('${url}', { waitUntil: 'networkidle0', timeout: ${timeout} });
          
          results.push({
            action: 'navigate',
            success: true,
            url: page.url(),
            title: await page.title()
          });

          ${actions.map((action, index) => {
            switch (action.type) {
              case 'click':
                return `
                  try {
                    console.log('Clicking ${action.selector}...');
                    await page.waitForSelector('${action.selector}', { timeout: 10000 });
                    await page.click('${action.selector}');
                    results.push({
                      action: 'click',
                      selector: '${action.selector}',
                      success: true
                    });
                  } catch (error) {
                    results.push({
                      action: 'click',
                      selector: '${action.selector}',
                      success: false,
                      error: error.message
                    });
                  }
                `;
              case 'input':
                return `
                  try {
                    console.log('Inputting to ${action.selector}...');
                    await page.waitForSelector('${action.selector}', { timeout: 10000 });
                    await page.focus('${action.selector}');
                    await page.keyboard.type('${action.value}');
                    results.push({
                      action: 'input',
                      selector: '${action.selector}',
                      value: '${action.value}',
                      success: true
                    });
                  } catch (error) {
                    results.push({
                      action: 'input',
                      selector: '${action.selector}',
                      success: false,
                      error: error.message
                    });
                  }
                `;
              case 'wait':
                return `
                  try {
                    console.log('Waiting ${action.delay || 1000}ms...');
                    await new Promise(resolve => setTimeout(resolve, ${action.delay || 1000}));
                    results.push({
                      action: 'wait',
                      delay: ${action.delay || 1000},
                      success: true
                    });
                  } catch (error) {
                    results.push({
                      action: 'wait',
                      success: false,
                      error: error.message
                    });
                  }
                `;
              case 'screenshot':
                return `
                  try {
                    console.log('Taking screenshot...');
                    const screenshot = await page.screenshot({ 
                      type: 'png',
                      fullPage: false,
                      encoding: 'base64'
                    });
                    results.push({
                      action: 'screenshot',
                      success: true,
                      screenshot: \`data:image/png;base64,\${screenshot}\`
                    });
                  } catch (error) {
                    results.push({
                      action: 'screenshot',
                      success: false,
                      error: error.message
                    });
                  }
                `;
              default:
                return '';
            }
          }).join('\n          await new Promise(resolve => setTimeout(resolve, 500));\n')}

          return {
            success: true,
            finalUrl: page.url(),
            finalTitle: await page.title(),
            results,
            totalActions: ${actions.length}
          };
        } catch (error) {
          console.error('Automation error:', error);
          return {
            success: false,
            error: error.message,
            results
          };
        }
      }
    `;

    console.log('Sending request to browserless API...');
    
    let response;
    try {
      response = await fetch(browserlessUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: automationScript,
          context: {}
        })
      });
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

    console.log('Browserless API response status:', response.status);

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

    let result;
    try {
      result = await response.json();
      console.log('Browser automation completed successfully');
    } catch (jsonError) {
      console.error('Failed to parse browserless response:', jsonError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid response from browser automation service',
          details: jsonError.message
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