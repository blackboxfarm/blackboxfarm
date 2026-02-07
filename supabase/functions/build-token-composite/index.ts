import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenMint, bannerUrl } = await req.json();

    if (!tokenMint) {
      return new Response(
        JSON.stringify({ error: 'Missing tokenMint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ALWAYS fetch the latest banner from DexScreener to avoid stale cached data
    let actualBannerUrl = bannerUrl;
    
    // Try to get fresh banner from DexScreener first
    try {
      console.log('Fetching latest banner from DexScreener for:', tokenMint);
      const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      });
      
      if (dexResponse.ok) {
        const dexData = await dexResponse.json();
        const freshBanner = dexData.pairs?.[0]?.info?.header;
        if (freshBanner) {
          console.log('Found fresh banner from DexScreener:', freshBanner);
          actualBannerUrl = freshBanner;
          
          // Also update our database with the fresh banner
          await supabase
            .from('holders_intel_seen_tokens')
            .update({ banner_url: freshBanner })
            .eq('token_mint', tokenMint);
        }
      }
    } catch (dexError) {
      console.log('DexScreener fetch failed, will use fallback:', dexError);
    }
    
    // Fallback to provided URL or database if DexScreener didn't return a banner
    if (!actualBannerUrl) {
      const { data: token } = await supabase
        .from('holders_intel_seen_tokens')
        .select('banner_url')
        .eq('token_mint', tokenMint)
        .single();
      
      if (!token?.banner_url) {
        return new Response(
          JSON.stringify({ error: 'No banner URL found for token' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      actualBannerUrl = token.banner_url;
      console.log('Using fallback banner from database:', actualBannerUrl);
    }

    // Use the 24h badge for marketing purposes
    const badgeName = 'paid_24h.png';
    const { data: badgeData } = supabase.storage
      .from('OG')
      .getPublicUrl(badgeName);

    const badgeUrl = badgeData?.publicUrl;
    
    console.log('Generating token composite:', { tokenMint, bannerUrl: actualBannerUrl, badgeUrl });

    // Use Lovable AI to generate a composite image
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Create a composite image by overlaying the second image (the "PAID" badge) onto the first image (the banner). Place the badge in the top-left corner with approximately 20 pixels of padding from both the top and left edges. The badge should maintain its original size and aspect ratio. Keep the banner at its original dimensions and quality. Do not add any other modifications or text.`
              },
              {
                type: 'image_url',
                image_url: { url: actualBannerUrl }
              },
              {
                type: 'image_url',
                image_url: { url: badgeUrl }
              }
            ]
          }
        ],
        modalities: ['image', 'text']
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const generatedImageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!generatedImageUrl) {
      console.error('No image generated:', aiData);
      throw new Error('AI did not return an image');
    }

    // The image is base64 encoded, extract the data
    const base64Match = generatedImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error('Invalid image format returned from AI');
    }

    const imageFormat = base64Match[1];
    const base64Data = base64Match[2];
    
    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to storage with token mint as filename
    const fileName = `token_composite_${tokenMint.slice(0, 8)}.${imageFormat}`;
    const { error: uploadError } = await supabase.storage
      .from('OG')
      .upload(fileName, bytes, {
        contentType: `image/${imageFormat}`,
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload composite image: ${uploadError.message}`);
    }

    // Get the public URL
    const { data: publicUrlData } = supabase.storage
      .from('OG')
      .getPublicUrl(fileName);

    const compositeUrl = publicUrlData?.publicUrl;

    // Update the token record with the composite URL
    const { error: updateError } = await supabase
      .from('holders_intel_seen_tokens')
      .update({ paid_composite_url: compositeUrl })
      .eq('token_mint', tokenMint);

    if (updateError) {
      console.error('Update error:', updateError);
      // Don't fail - the image was generated successfully
    }

    console.log('Token composite generated:', compositeUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        compositeUrl,
        tokenMint 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error generating token composite:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
