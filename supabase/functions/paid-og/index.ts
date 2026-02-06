import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Check if request is from a social media bot
function isSocialBot(userAgent: string): boolean {
  const botPatterns = [
    'twitterbot',
    'facebookexternalhit',
    'linkedinbot',
    'slackbot',
    'discordbot',
    'telegrambot',
    'whatsapp',
    'applebot',
    'googlebot',
    'bingbot',
    'ia_archiver',
    'facebot',
    'pinterestbot',
  ];
  const ua = userAgent.toLowerCase();
  return botPatterns.some(bot => ua.includes(bot));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get('order');

    if (!orderId) {
      return new Response('Missing order parameter', { status: 400 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the banner order
    const { data: order, error } = await supabase
      .from('banner_orders')
      .select('*, advertiser_accounts(twitter_handle)')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      console.error('Order not found:', orderId, error);
      return new Response('Order not found', { status: 404 });
    }

    const userAgent = req.headers.get('user-agent') || '';
    const isBot = isSocialBot(userAgent);

    // Use composite image if available, otherwise fall back to original
    const imageUrl = order.paid_composite_url || order.image_url;
    const title = `${order.title} - Paid Banner on BlackBox`;
    const description = `Verified paid banner advertisement for ${order.duration_hours} hours on BlackBox.farm`;

    // If it's a bot, serve the OG meta tags
    if (isBot) {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://blackbox.farm/holders">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1500">
  <meta property="og:image:height" content="500">
  
  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  ${order.advertiser_accounts?.twitter_handle ? `<meta name="twitter:site" content="@${order.advertiser_accounts.twitter_handle}">` : ''}
</head>
<body>
  <p>Redirecting to BlackBox...</p>
  <script>window.location.href = "https://blackbox.farm/holders";</script>
</body>
</html>`;

      return new Response(html, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        },
      });
    }

    // For human users, redirect to the holders page
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': 'https://blackbox.farm/holders',
      },
    });

  } catch (error: any) {
    console.error('Error in paid-og:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
