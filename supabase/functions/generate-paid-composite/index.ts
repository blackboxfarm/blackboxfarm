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
    const { bannerUrl, durationHours, orderId } = await req.json();

    if (!bannerUrl || !orderId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: bannerUrl, orderId' }),
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

    // Determine which badge to use based on duration
    let badgeName = 'paid_24h.png';
    if (durationHours >= 168) { // 1 week
      badgeName = 'paid_1week.png';
    } else if (durationHours >= 72) {
      badgeName = 'paid_72h.png';
    } else if (durationHours >= 48) {
      badgeName = 'paid_48h.png';
    }

    // Get the badge URL from storage
    const { data: badgeData } = supabase.storage
      .from('OG')
      .getPublicUrl(badgeName);

    const badgeUrl = badgeData?.publicUrl;
    
    // If specific duration badge doesn't exist, fall back to 24h
    const fallbackBadgeUrl = supabase.storage.from('OG').getPublicUrl('paid_24h.png').data?.publicUrl;
    const actualBadgeUrl = badgeUrl || fallbackBadgeUrl;

    console.log('Generating composite image:', { bannerUrl, badgeUrl: actualBadgeUrl, orderId });

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
                image_url: { url: bannerUrl }
              },
              {
                type: 'image_url',
                image_url: { url: actualBadgeUrl }
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

    // Upload to storage
    const fileName = `paid_composite_${orderId}.${imageFormat}`;
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

    // Update the banner order with the composite URL
    const { error: updateError } = await supabase
      .from('banner_orders')
      .update({ paid_composite_url: compositeUrl })
      .eq('id', orderId);

    if (updateError) {
      console.error('Update error:', updateError);
      // Don't fail - the image was generated successfully
    }

    console.log('Composite image generated:', compositeUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        compositeUrl,
        orderId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error generating composite:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
