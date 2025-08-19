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

    console.log(`Starting REAL agentic browsing for URL: ${url} with ${actions.length} actions`);

    // Import Puppeteer for Deno - using different approach
    console.log('Importing Puppeteer...');
    const { default: puppeteer } = await import("https://deno.land/x/puppeteer@16.2.0/mod.ts");
    console.log('Puppeteer imported successfully');

    // Launch browser with more permissive settings
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });
    console.log('Browser launched successfully');

    const page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const results: any[] = [];

    try {
      // Navigate to the URL
      console.log(`Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle0', timeout });
      console.log('Navigation completed');
      
      results.push({
        action: 'navigate',
        success: true,
        url: page.url(),
        title: await page.title()
      });

      // Execute actions sequentially
      for (const [index, action] of actions.entries()) {
        console.log(`Executing action ${index + 1}: ${action.type}`);
        
        try {
          switch (action.type) {
            case 'click':
              if (action.selector) {
                console.log(`Waiting for selector: ${action.selector}`);
                await page.waitForSelector(action.selector, { timeout: 10000 });
                console.log(`Clicking selector: ${action.selector}`);
                await page.click(action.selector);
                results.push({
                  action: 'click',
                  selector: action.selector,
                  success: true
                });
                console.log(`Click completed for: ${action.selector}`);
              }
              break;

            case 'input':
              if (action.selector && action.value) {
                console.log(`Inputting text to: ${action.selector}`);
                await page.waitForSelector(action.selector, { timeout: 10000 });
                await page.focus(action.selector);
                await page.keyboard.type(action.value);
                results.push({
                  action: 'input',
                  selector: action.selector,
                  value: action.value,
                  success: true
                });
                console.log(`Input completed for: ${action.selector}`);
              }
              break;

            case 'wait':
              const delay = action.delay || 1000;
              console.log(`Waiting for ${delay}ms`);
              await new Promise(resolve => setTimeout(resolve, delay));
              results.push({
                action: 'wait',
                delay,
                success: true
              });
              console.log(`Wait completed`);
              break;

            case 'screenshot':
              console.log('Taking screenshot...');
              const screenshot = await page.screenshot({ 
                type: 'png',
                fullPage: false,
                encoding: 'base64'
              });
              results.push({
                action: 'screenshot',
                success: true,
                screenshot: `data:image/png;base64,${screenshot}`
              });
              console.log('Screenshot taken successfully');
              break;
          }

          // Small delay between actions
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (actionError) {
          console.error(`Error in action ${index + 1}:`, actionError);
          results.push({
            action: action.type,
            selector: action.selector,
            success: false,
            error: actionError.message
          });
        }
      }

      // Get final page state
      const finalUrl = page.url();
      const finalTitle = await page.title();
      
      console.log('Agentic browsing completed successfully');

      return new Response(
        JSON.stringify({
          success: true,
          finalUrl,
          finalTitle,
          results,
          totalActions: actions.length
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );

    } finally {
      console.log('Closing browser...');
      await browser.close();
      console.log('Browser closed');
    }

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