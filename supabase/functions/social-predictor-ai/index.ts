import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Fetch content from URL using Firecrawl
async function fetchUrlContent(url: string): Promise<{ content: string; title: string; links: string[] }> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  
  if (!FIRECRAWL_API_KEY) {
    console.log('Firecrawl not configured, will analyze URL without scraping');
    return { content: '', title: '', links: [] };
  }

  try {
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Fetching URL content:', formattedUrl);

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown', 'links'],
        onlyMainContent: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Firecrawl error:', response.status, errorText);
      return { content: '', title: '', links: [] };
    }

    const data = await response.json();
    const scraped = data.data || data;
    
    console.log('Successfully scraped content, length:', scraped.markdown?.length || 0);
    
    return {
      content: scraped.markdown || '',
      title: scraped.metadata?.title || '',
      links: scraped.links || [],
    };
  } catch (error) {
    console.error('Error fetching URL content:', error);
    return { content: '', title: '', links: [] };
  }
}

// Perform web search using Firecrawl
async function searchTopic(query: string): Promise<{ results: Array<{ title: string; url: string; content: string }> }> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  
  if (!FIRECRAWL_API_KEY) {
    console.log('Firecrawl not configured, will analyze topic without search');
    return { results: [] };
  }

  try {
    console.log('Searching for:', query);

    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        limit: 5,
        scrapeOptions: {
          formats: ['markdown'],
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Firecrawl search error:', response.status, errorText);
      return { results: [] };
    }

    const data = await response.json();
    const results = (data.data || []).map((item: any) => ({
      title: item.title || item.metadata?.title || 'Unknown',
      url: item.url || item.metadata?.sourceURL || '',
      content: item.markdown || '',
    }));

    console.log('Search returned', results.length, 'results');
    return { results };
  } catch (error) {
    console.error('Error searching topic:', error);
    return { results: [] };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { input, type } = await req.json();

    if (!input) {
      return new Response(
        JSON.stringify({ error: 'Input is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Analyzing ${type}: ${input.substring(0, 100)}...`);

    // Fetch real content based on input type
    let scrapedContent = '';
    let sources: string[] = [];

    if (type === 'url') {
      const urlData = await fetchUrlContent(input);
      if (urlData.content) {
        scrapedContent = `\n\n## SCRAPED ARTICLE CONTENT:\nTitle: ${urlData.title}\nURL: ${input}\n\n${urlData.content.substring(0, 15000)}`;
        sources = [input, ...urlData.links.slice(0, 5)];
      }
    } else {
      // Topic search - perform multiple searches
      const searchResults = await searchTopic(input);
      if (searchResults.results.length > 0) {
        scrapedContent = '\n\n## SEARCH RESULTS AND ARTICLE CONTENT:\n';
        for (const result of searchResults.results) {
          scrapedContent += `\n### Source: ${result.title}\nURL: ${result.url}\n${result.content.substring(0, 3000)}\n\n---\n`;
          if (result.url) sources.push(result.url);
        }
      }
    }

    // Build the analysis prompt
    const systemPrompt = `You are an expert AI analyst specializing in social media trends, market sentiment, and predictive commentary. Your task is to analyze the given input and provide intelligent, actionable observations.

CRITICAL RULES:
1. Be objective and data-driven in your analysis
2. Use conditional language when making predictions ("If X continues...", "Should Y occur...")
3. Never give direct financial advice or guarantees
4. Acknowledge uncertainty where appropriate
5. Focus on observable patterns and verifiable information
6. IMPORTANT: Base your analysis ONLY on the actual content provided below. Do NOT make up information or cite sources you haven't read.
7. If scraped content is provided, use it as your PRIMARY source of information.

Your response MUST be a valid JSON object with this exact structure:
{
  "summary": "A 2-3 sentence executive summary of your analysis based on the actual content",
  "sentiment": "bullish" | "bearish" | "neutral" | "mixed",
  "confidence": <number between 0-100>,
  "keyInsights": ["insight1", "insight2", "insight3"],
  "riskFactors": ["risk1", "risk2", "risk3"],
  "opportunities": ["opportunity1", "opportunity2", "opportunity3"],
  "sources": ["actual source URLs from the content"],
  "fullAnalysis": "A detailed markdown-formatted analysis with headers and bullet points"
}

For the fullAnalysis field, structure it with:
## Overview
Brief context about the topic based on actual content

## Market Dynamics
Current state and trends observed in the sources

## Content Analysis
Key information extracted from the articles/sources

## Sentiment Analysis
What the actual content suggests about sentiment

## Forward-Looking Observations
Conditional predictions based on observed patterns in the content

## Conclusion
Summary of key takeaways from the actual sources`;

    const userPrompt = type === 'url' 
      ? `Analyze this URL and its content for market trends and social sentiment: ${input}
${scrapedContent}

Based on the ACTUAL CONTENT above (not assumptions), provide:
1. What is the main topic/subject being discussed?
2. What are the key claims or information presented?
3. How might this impact market sentiment?
4. What are the potential implications?
5. What risks or opportunities does this present?

IMPORTANT: Only cite information that appears in the scraped content above.`
      : `Conduct a comprehensive analysis on this topic using the search results provided: ${input}
${scrapedContent}

Based on the ACTUAL SEARCH RESULTS above, provide:
1. Current state and recent developments
2. Key information from the sources
3. Market implications and trends mentioned
4. Risk factors identified in the content
5. Opportunities mentioned in the sources

IMPORTANT: Only cite information that appears in the search results above. Use the actual URLs as sources.`;

    // Call the AI Gateway
    const response = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response received, parsing...');

    // Parse the JSON response from AI
    let parsedResult;
    try {
      // Extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, content];
      const jsonStr = jsonMatch[1] || content;
      parsedResult = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      // Create a fallback structure
      parsedResult = {
        summary: content.substring(0, 200) + '...',
        sentiment: 'neutral',
        confidence: 60,
        keyInsights: ['Analysis generated but structured parsing failed'],
        riskFactors: ['Unable to extract structured risk factors'],
        opportunities: ['Unable to extract structured opportunities'],
        sources: sources,
        fullAnalysis: content
      };
    }

    // Validate and ensure all required fields - use scraped sources if AI didn't provide them
    const finalSources = Array.isArray(parsedResult.sources) && parsedResult.sources.length > 0
      ? parsedResult.sources.filter((s: string) => typeof s === 'string' && s.startsWith('http')).slice(0, 10)
      : sources;

    const result = {
      summary: parsedResult.summary || 'Analysis complete',
      sentiment: ['bullish', 'bearish', 'neutral', 'mixed'].includes(parsedResult.sentiment) 
        ? parsedResult.sentiment 
        : 'neutral',
      confidence: typeof parsedResult.confidence === 'number' 
        ? Math.min(100, Math.max(0, parsedResult.confidence)) 
        : 60,
      keyInsights: Array.isArray(parsedResult.keyInsights) 
        ? parsedResult.keyInsights.slice(0, 5) 
        : [],
      riskFactors: Array.isArray(parsedResult.riskFactors) 
        ? parsedResult.riskFactors.slice(0, 5) 
        : [],
      opportunities: Array.isArray(parsedResult.opportunities) 
        ? parsedResult.opportunities.slice(0, 5) 
        : [],
      sources: finalSources,
      fullAnalysis: parsedResult.fullAnalysis || content
    };

    console.log('Analysis complete:', result.summary.substring(0, 50) + '...');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Social predictor error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Analysis failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
