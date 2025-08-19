import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { url, actions, headless = true, timeout = 30000 }: BrowseRequest = await req.json();

    if (!url || !actions || actions.length === 0) {
      return new Response(
        JSON.stringify({ error: 'URL and actions are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Starting agentic browsing for URL: ${url}`);

    // Import Puppeteer for Deno
    const puppeteer = await import("https://deno.land/x/puppeteer@16.2.0/mod.ts");

    // Launch browser
    const browser = await puppeteer.default.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const results: any[] = [];

    try {
      // Navigate to the URL
      console.log(`Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle0', timeout });
      
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
                await page.waitForSelector(action.selector, { timeout: 10000 });
                await page.click(action.selector);
                results.push({
                  action: 'click',
                  selector: action.selector,
                  success: true
                });
              }
              break;

            case 'input':
              if (action.selector && action.value) {
                await page.waitForSelector(action.selector, { timeout: 10000 });
                await page.focus(action.selector);
                await page.keyboard.type(action.value);
                results.push({
                  action: 'input',
                  selector: action.selector,
                  value: action.value,
                  success: true
                });
              }
              break;

            case 'wait':
              const delay = action.delay || 1000;
              await new Promise(resolve => setTimeout(resolve, delay));
              results.push({
                action: 'wait',
                delay,
                success: true
              });
              break;

            case 'screenshot':
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
      await browser.close();
    }

  } catch (error) {
    console.error('Error in agentic browser:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: 'Failed to execute browser automation'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});