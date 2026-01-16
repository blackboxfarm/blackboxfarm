import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenStats } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { symbol, name, price, marketCap, healthScore, healthGrade, totalHolders, whalePercentage, dustPercentage } = tokenStats;

    // Format values for the prompt
    const formattedPrice = price < 0.00001 ? price.toExponential(4) : price.toFixed(8).replace(/\.?0+$/, '');
    const formattedMcap = marketCap >= 1_000_000 ? `$${(marketCap / 1_000_000).toFixed(2)}M` : `$${(marketCap / 1_000).toFixed(1)}K`;

    const prompt = `Create a professional crypto social share card for Twitter/X with the following design:

DIMENSIONS: 1200x628 pixels (16:9 Twitter card format)

BRANDING: 
- "BlackBox Farm" logo/text in top left corner with a green accent color
- Dark, professional crypto aesthetic with gradients

TOKEN INFO (left side):
- Token symbol: $${symbol}
- Token name: ${name}
- Price: $${formattedPrice} (in green)
- Market Cap: ${formattedMcap}

HEALTH SCORE (center, prominent):
- Large letter grade: ${healthGrade}
- Score: ${healthScore}/100
- Label: "Holder Health Score"

STATS (right side):
- Total Holders: ${totalHolders.toLocaleString()}
- Whale %: ${whalePercentage}% (in red/warning color)
- Dust %: ${dustPercentage}% (in yellow)

STYLE:
- Dark background with subtle crypto-themed patterns or gradients (purples, blues, greens)
- Clean, modern typography
- Professional data visualization feel
- Include subtle chart/graph decorative elements
- Footer with "blackboxfarm.lovable.app/holders" URL

Make it look like a premium crypto analytics report card that traders would want to share.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        modalities: ["image", "text"]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      console.error("No image in response:", JSON.stringify(data));
      throw new Error("No image generated");
    }

    return new Response(JSON.stringify({ 
      imageUrl,
      message: "AI card generated successfully"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error generating share card:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Failed to generate share card" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
