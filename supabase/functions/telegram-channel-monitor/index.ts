import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Solana address regex - matches base58 addresses 32-44 chars
const SOLANA_ADDRESS_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

// Helper to extract Solana addresses from text
function extractSolanaAddresses(text: string): string[] {
  const matches = text.match(SOLANA_ADDRESS_REGEX) || [];
  return matches.filter(addr => {
    if (addr.length < 32 || addr.length > 44) return false;
    const hasUpper = /[A-HJ-NP-Z]/.test(addr);
    const hasLower = /[a-km-z]/.test(addr);
    const hasNumber = /[1-9]/.test(addr);
    return hasUpper && hasLower && hasNumber;
  });
}

// Check if message contains "ape" keyword (case insensitive)
function containsApeKeyword(text: string): boolean {
  const apePattern = /\bape\b/i;
  return apePattern.test(text);
}

// Generate AI interpretation of a message
function generateAIInterpretation(
  messageText: string,
  extractedTokens: string[],
  hasApeKeyword: boolean,
  tokenData: { symbol?: string; price?: number; age?: number } | null
): {
  summary: string;
  interpretation: string;
  decision: 'buy' | 'fantasy_buy' | 'skip' | 'no_action';
  reasoning: string;
  confidence: number;
} {
  const truncatedMsg = messageText.length > 200 ? messageText.substring(0, 200) + '...' : messageText;
  
  let messageType = 'unknown';
  let confidence = 0.5;
  
  if (extractedTokens.length > 0) {
    if (hasApeKeyword) {
      messageType = 'high_conviction_call';
      confidence = 0.9;
    } else if (/buy|long|bullish|moon|pump|🚀|💎|🔥/i.test(messageText)) {
      messageType = 'token_call';
      confidence = 0.7;
    } else {
      messageType = 'token_mention';
      confidence = 0.5;
    }
  } else if (/gm|gn|lol|haha|thanks/i.test(messageText)) {
    messageType = 'casual_chat';
    confidence = 0.3;
  } else if (/market|analysis|ta|chart/i.test(messageText)) {
    messageType = 'analysis';
    confidence = 0.4;
  } else {
    messageType = 'general_discussion';
    confidence = 0.3;
  }

  let summary = '';
  let interpretation = '';
  let decision: 'buy' | 'fantasy_buy' | 'skip' | 'no_action' = 'no_action';
  let reasoning = '';

  switch (messageType) {
    case 'high_conviction_call':
      summary = `🦍 APE call detected with token address. User appears highly bullish.`;
      interpretation = `High-conviction buy signal with "APE" keyword. Token: ${tokenData?.symbol || 'Unknown'}. Price: $${tokenData?.price?.toFixed(8) || 'N/A'}. Age: ${tokenData?.age || 'N/A'}min.`;
      break;
    case 'token_call':
      summary = `Token call posted with bullish sentiment indicators.`;
      interpretation = `Moderate conviction call. Token: ${tokenData?.symbol || 'Unknown'}. Bullish language detected but no explicit "APE" signal.`;
      break;
    case 'token_mention':
      summary = `Token address shared without strong conviction signals.`;
      interpretation = `Token mentioned casually. May be discussion or weak call. Token: ${tokenData?.symbol || 'Unknown'}.`;
      break;
    case 'casual_chat':
      summary = `Casual conversation (greeting/social).`;
      interpretation = `Non-trading related social message. No actionable content.`;
      break;
    case 'analysis':
      summary = `Market analysis or chart discussion.`;
      interpretation = `Educational/analytical content. May inform but not a direct call.`;
      break;
    default:
      summary = `General channel message.`;
      interpretation = `Standard message without clear trading signals.`;
  }

  if (extractedTokens.length === 0) {
    decision = 'no_action';
    reasoning = 'No token address found in message. Nothing to trade.';
  } else if (!tokenData?.price) {
    decision = 'skip';
    reasoning = 'Token address found but unable to fetch price data. May be too new or invalid.';
  } else if (tokenData.age && tokenData.age > 60) {
    decision = 'skip';
    reasoning = `Token is ${tokenData.age} minutes old, exceeds 60-minute freshness threshold.`;
  } else if (hasApeKeyword && tokenData.price < 0.00002) {
    decision = 'buy';
    reasoning = `High conviction: APE keyword + low price ($${tokenData.price.toFixed(8)} < $0.00002). Triggers large buy tier.`;
    confidence = 0.9;
  } else if (tokenData.price > 0.00004) {
    decision = 'buy';
    reasoning = `Token price ($${tokenData.price.toFixed(8)}) above standard threshold. Triggers standard buy tier.`;
    confidence = 0.7;
  } else if (hasApeKeyword) {
    decision = 'buy';
    reasoning = `APE keyword present with mid-range price. Triggers standard buy with higher target.`;
    confidence = 0.75;
  } else {
    decision = 'skip';
    reasoning = `Price in middle range ($0.00002-$0.00004) without APE keyword. Insufficient conviction.`;
    confidence = 0.4;
  }

  return { summary, interpretation, decision, reasoning, confidence };
}

// Fetch token price from Jupiter
async function fetchTokenPrice(tokenMint: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${tokenMint}`);
    const data = await response.json();
    if (data.data?.[tokenMint]?.price) {
      return parseFloat(data.data[tokenMint].price);
    }
    return null;
  } catch (error) {
    console.error(`[telegram-channel-monitor] Error fetching Jupiter price:`, error);
    return null;
  }
}

// Fetch token price from DexScreener as fallback
async function fetchDexScreenerPrice(tokenMint: string): Promise<{ price: number | null; marketCap: number | null }> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    const data = await response.json();
    if (data.pairs?.[0]) {
      return {
        price: parseFloat(data.pairs[0].priceUsd) || null,
        marketCap: data.pairs[0].marketCap || null
      };
    }
    return { price: null, marketCap: null };
  } catch (error) {
    console.error(`[telegram-channel-monitor] Error fetching DexScreener price:`, error);
    return { price: null, marketCap: null };
  }
}

// Fetch token metadata from Jupiter
async function fetchTokenMetadata(tokenMint: string): Promise<{ symbol: string; name: string } | null> {
  try {
    const response = await fetch(`https://tokens.jup.ag/token/${tokenMint}`);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      symbol: data.symbol || 'UNKNOWN',
      name: data.name || 'Unknown Token'
    };
  } catch (error) {
    console.error(`[telegram-channel-monitor] Error fetching token metadata:`, error);
    return null;
  }
}

// Estimate token age from DexScreener
async function estimateTokenAge(tokenMint: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    const data = await response.json();
    if (data.pairs?.[0]?.pairCreatedAt) {
      const createdAt = data.pairs[0].pairCreatedAt;
      const ageMs = Date.now() - createdAt;
      return Math.floor(ageMs / 60000);
    }
    return null;
  } catch (error) {
    console.error(`[telegram-channel-monitor] Error estimating token age:`, error);
    return null;
  }
}

// Send email notification
async function sendEmailNotification(
  supabase: any,
  email: string,
  tokenMint: string,
  tokenSymbol: string,
  price: number,
  apeKeyword: boolean,
  buyTier: string,
  buyAmount: number,
  sellMultiplier: number
) {
  try {
    const { error } = await supabase.functions.invoke('send-notification', {
      body: {
        type: 'email',
        to: email,
        subject: `🦍 APE CALL DETECTED: ${tokenSymbol}`,
        title: `New Token Call from Blind Ape Alpha`,
        message: `
Token: ${tokenSymbol}
Mint: ${tokenMint}
Price: $${price?.toFixed(10) || 'Unknown'}
Ape Keyword: ${apeKeyword ? 'YES 🦍' : 'No'}
Buy Tier: ${buyTier.toUpperCase()}
Buy Amount: $${buyAmount}
Sell Target: ${sellMultiplier}x

View on Solscan: https://solscan.io/token/${tokenMint}
View on DexScreener: https://dexscreener.com/solana/${tokenMint}
        `.trim(),
        metadata: { tokenMint, tokenSymbol, price, buyTier, buyAmount, sellMultiplier }
      }
    });
    
    if (error) {
      console.error('[telegram-channel-monitor] Error sending email:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[telegram-channel-monitor] Error invoking send-notification:', error);
    return false;
  }
}

// Scrape messages from public Telegram channel web view with caller info
async function scrapePublicChannel(username: string): Promise<Array<{
  messageId: string;
  text: string;
  date: Date;
  callerUsername?: string;
  callerDisplayName?: string;
}>> {
  const url = `https://t.me/s/${username}`;
  console.log(`[telegram-channel-monitor] Scraping public channel: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    if (!response.ok) {
      console.error(`[telegram-channel-monitor] Failed to fetch channel page: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    const messages: Array<{ messageId: string; text: string; date: Date; callerUsername?: string; callerDisplayName?: string }> = [];
    
    const messageBlockPattern = /<div class="tgme_widget_message_wrap[^"]*"[^>]*>[\s\S]*?<div class="tgme_widget_message[^"]*"[^>]*data-post="([^"]+)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
    
    let match;
    while ((match = messageBlockPattern.exec(html)) !== null) {
      const [fullBlock, postId, messageContent] = match;
      
      const authorNameMatch = messageContent.match(/<span class="tgme_widget_message_author_name"[^>]*>([^<]+)<\/span>/i);
      const callerDisplayName = authorNameMatch ? authorNameMatch[1].trim() : undefined;
      
      const authorLinkMatch = messageContent.match(/<a class="tgme_widget_message_owner_name"[^>]*href="https:\/\/t\.me\/([^"\/]+)"[^>]*>/i);
      const callerUsername = authorLinkMatch ? authorLinkMatch[1] : (callerDisplayName ? callerDisplayName.replace(/\s+/g, '_').toLowerCase() : undefined);
      
      const textMatch = messageContent.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const rawText = textMatch ? textMatch[1] : '';
      
      const dateMatch = messageContent.match(/<time[^>]*datetime="([^"]+)"[^>]*>/i);
      const dateStr = dateMatch ? dateMatch[1] : new Date().toISOString();
      
      const text = rawText
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      
      if (text) {
        const messageId = postId.split('/').pop() || postId;
        messages.push({
          messageId,
          text,
          date: new Date(dateStr),
          callerUsername,
          callerDisplayName
        });
        
        if (callerDisplayName) {
          console.log(`[telegram-channel-monitor] Message from caller: ${callerDisplayName} (@${callerUsername})`);
        }
      }
    }
    
    if (messages.length === 0) {
      const simplePattern = /<div class="tgme_widget_message[^"]*"[^>]*data-post="([^"]+)"[^>]*>[\s\S]*?<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<time[^>]*datetime="([^"]+)"[^>]*>/gi;
      
      while ((match = simplePattern.exec(html)) !== null) {
        const [, postId, rawText, dateStr] = match;
        const text = rawText
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
        
        if (text) {
          const messageId = postId.split('/').pop() || postId;
          messages.push({
            messageId,
            text,
            date: new Date(dateStr)
          });
        }
      }
    }
    
    console.log(`[telegram-channel-monitor] Scraped ${messages.length} messages from ${username}`);
    return messages;
  } catch (error) {
    console.error(`[telegram-channel-monitor] Error scraping channel:`, error);
    return [];
  }
}

// For groups, we need MTProto but since that's complex in edge functions,
// we'll provide clear feedback when a group can't be scraped
async function checkGroupAccessibility(
  channelUsername: string
): Promise<{ accessible: boolean; isGroup: boolean; message: string }> {
  console.log(`[telegram-channel-monitor] Checking accessibility for: ${channelUsername}`);
  
  try {
    const url = `https://t.me/s/${channelUsername}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });
    
    if (!response.ok) {
      return { accessible: false, isGroup: false, message: 'Channel/group not found' };
    }
    
    const html = await response.text();
    
    // Check for message content
    const hasMessages = html.includes('tgme_widget_message_wrap');
    const isGroup = html.includes('members') && !hasMessages;
    
    if (hasMessages) {
      return { accessible: true, isGroup: false, message: 'Public channel - can scrape messages' };
    } else if (isGroup) {
      return { 
        accessible: false, 
        isGroup: true, 
        message: 'This is a GROUP - cannot scrape without MTProto. Add bot as member or use MTProto session.' 
      };
    } else {
      return { accessible: false, isGroup: false, message: 'No public messages available' };
    }
  } catch (error: any) {
    return { accessible: false, isGroup: false, message: error.message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { action, channelId: requestChannelId } = body;

    console.log(`[telegram-channel-monitor] Action: ${action || 'scan'}`);

    // Get active channel configurations
    const { data: configs, error: configError } = await supabase
      .from('telegram_channel_config')
      .select('*')
      .eq('is_active', true);

    if (configError) {
      console.error('[telegram-channel-monitor] Error fetching configs:', configError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch channel configurations'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    if (!configs || configs.length === 0) {
      console.log('[telegram-channel-monitor] No active channel configurations found');
      return new Response(JSON.stringify({
        success: true,
        message: 'No active channel configurations',
        processed: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results: any[] = [];
    let totalProcessed = 0;
    let totalBuys = 0;
    let totalFantasyBuys = 0;

    for (const config of configs) {
      const channelId = requestChannelId || config.channel_id;
      const channelUsername = config.channel_username;
      const channelType = config.channel_type || 'channel';
      const isFantasyMode = config.fantasy_mode ?? true;
      const fantasyBuyAmount = config.fantasy_buy_amount_usd || 100;
      
      console.log(`[telegram-channel-monitor] Processing: ${channelUsername || channelId} (${config.channel_name || 'unnamed'}) - Type: ${channelType} - Fantasy: ${isFantasyMode}`);

      try {
        let channelMessages: Array<{ messageId: string; text: string; date: Date; callerUsername?: string; callerDisplayName?: string }> = [];
        let groupWarning: string | null = null;
        
        // Check accessibility for groups vs channels
        if (channelType === 'group' || !channelUsername) {
          // Check if this is actually a group
          const accessCheck = await checkGroupAccessibility(channelUsername);
          
          if (!accessCheck.accessible) {
            console.log(`[telegram-channel-monitor] ${accessCheck.message}`);
            groupWarning = accessCheck.message;
            
            // For groups, we can only use Bot API if bot is a member
            const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
            if (botToken) {
              console.log(`[telegram-channel-monitor] Trying Bot API for group...`);
              const updatesResponse = await fetch(
                `https://api.telegram.org/bot${botToken}/getUpdates?offset=-100&limit=100`
              );
              const updatesData = await updatesResponse.json();

              if (updatesData.ok) {
                const filtered = updatesData.result?.filter((update: any) => {
                  const msg = update.channel_post || update.message;
                  if (!msg) return false;
                  const chatUsername = msg.chat?.username?.toLowerCase();
                  return chatUsername === channelUsername?.toLowerCase();
                }) || [];
                
                channelMessages = filtered.map((update: any) => {
                  const msg = update.channel_post || update.message;
                  const from = msg.from || msg.sender_chat || {};
                  return {
                    messageId: msg.message_id.toString(),
                    text: msg.text || '',
                    date: new Date(msg.date * 1000),
                    callerUsername: from.username,
                    callerDisplayName: from.first_name ? `${from.first_name} ${from.last_name || ''}`.trim() : from.title
                  };
                });
                
                if (channelMessages.length > 0) {
                  console.log(`[telegram-channel-monitor] Bot API found ${channelMessages.length} messages from group`);
                  groupWarning = null; // Clear warning if we got messages
                }
              }
            }
          } else {
            // Accessible via web scraping
            channelMessages = await scrapePublicChannel(channelUsername);
          }
        } else if (channelUsername) {
          // Regular channel - try web scraping
          channelMessages = await scrapePublicChannel(channelUsername);
        }

        // Log warning for groups that couldn't be accessed
        if (groupWarning && channelMessages.length === 0) {
          console.log(`[telegram-channel-monitor] WARNING: ${groupWarning}`);
          results.push({
            channel: config.channel_name || channelUsername || channelId,
            channelType,
            messagesFound: 0,
            success: false,
            warning: groupWarning
          });
          continue; // Skip to next channel
        }

        for (const msg of channelMessages) {
          if (!msg.text) continue;

          const messageId = msg.messageId;
          const messageText = msg.text;
          const messageDate = msg.date;
          const callerUsername = msg.callerUsername;
          const callerDisplayName = msg.callerDisplayName;

          // Skip if message is too old (> 15 minutes)
          const messageAgeMinutes = (Date.now() - messageDate.getTime()) / 60000;
          if (messageAgeMinutes > 15) continue;

          // Skip if we already processed this message
          if (config.last_message_id) {
            const lastId = parseInt(config.last_message_id);
            const currentId = parseInt(messageId);
            if (!isNaN(lastId) && !isNaN(currentId) && currentId <= lastId) {
              continue;
            }
          }

          // Extract Solana addresses
          const addresses = extractSolanaAddresses(messageText);
          const hasApeKeyword = containsApeKeyword(messageText);

          // Fetch token data for the first address
          let tokenData: { symbol?: string; price?: number; age?: number; marketCap?: number; name?: string } | null = null;
          const firstToken = addresses[0];
          
          if (firstToken) {
            let price = await fetchTokenPrice(firstToken);
            let marketCap: number | null = null;
            
            if (price === null) {
              const dexData = await fetchDexScreenerPrice(firstToken);
              price = dexData.price;
              marketCap = dexData.marketCap;
            }

            const tokenAge = await estimateTokenAge(firstToken);
            const metadata = await fetchTokenMetadata(firstToken);
            
            tokenData = {
              symbol: metadata?.symbol,
              name: metadata?.name,
              price: price || undefined,
              age: tokenAge || undefined,
              marketCap: marketCap || undefined
            };
          }

          // Generate AI interpretation
          const aiResult = generateAIInterpretation(messageText, addresses, hasApeKeyword, tokenData);

          // Adjust decision for fantasy mode
          let finalDecision = aiResult.decision;
          if (isFantasyMode && aiResult.decision === 'buy') {
            finalDecision = 'fantasy_buy';
          }

          // Log the interpretation
          await supabase
            .from('telegram_message_interpretations')
            .insert({
              channel_config_id: config.id,
              channel_id: channelId,
              message_id: messageId,
              raw_message: messageText.substring(0, 2000),
              ai_summary: aiResult.summary,
              ai_interpretation: aiResult.interpretation,
              extracted_tokens: addresses,
              decision: finalDecision,
              decision_reasoning: aiResult.reasoning,
              confidence_score: aiResult.confidence,
              token_mint: firstToken || null,
              token_symbol: tokenData?.symbol || null,
              price_at_detection: tokenData?.price || null,
              caller_username: callerUsername || null,
              caller_display_name: callerDisplayName || null
            });

          console.log(`[telegram-channel-monitor] AI: ${aiResult.summary} -> ${finalDecision} (Caller: ${callerDisplayName || callerUsername || 'Unknown'})`);

          // Process each token address
          for (const tokenMint of addresses) {
            // Check for first-time calls
            const { data: existingGlobal } = await supabase
              .from('telegram_channel_calls')
              .select('id, caller_username, caller_display_name, channel_name')
              .eq('token_mint', tokenMint)
              .order('created_at', { ascending: true })
              .limit(1)
              .single();

            const isFirstCall = !existingGlobal;
            
            // Check if already processed in THIS channel
            const { data: existingInChannel } = await supabase
              .from('telegram_channel_calls')
              .select('id')
              .eq('channel_id', channelId)
              .eq('token_mint', tokenMint)
              .single();

            if (existingInChannel) {
              console.log(`[telegram-channel-monitor] Token ${tokenMint} already processed in this channel`);
              continue;
            }

            // Get token-specific data
            let currentTokenData = tokenData;
            if (tokenMint !== firstToken) {
              let price = await fetchTokenPrice(tokenMint);
              if (price === null) {
                const dexData = await fetchDexScreenerPrice(tokenMint);
                price = dexData.price;
              }
              const age = await estimateTokenAge(tokenMint);
              const meta = await fetchTokenMetadata(tokenMint);
              currentTokenData = { symbol: meta?.symbol, name: meta?.name, price: price || undefined, age: age || undefined };
            }

            const price = currentTokenData?.price || null;
            const tokenAge = currentTokenData?.age || null;

            // Apply trading rules
            let buyTier: string | null = null;
            let buyAmountUsd: number | null = null;
            let sellMultiplier: number | null = null;
            let skipReason: string | null = null;

            if (tokenAge !== null && tokenAge > (config.max_mint_age_minutes || 60)) {
              skipReason = `Token too old: ${tokenAge} minutes`;
            } else if (price === null) {
              skipReason = 'Unable to fetch price';
            } else {
              const minPriceThreshold = config.min_price_threshold || 0.00002;
              const maxPriceThreshold = config.max_price_threshold || 0.00004;

              if (hasApeKeyword && price < minPriceThreshold) {
                buyTier = 'large';
                buyAmountUsd = config.large_buy_amount_usd || 100;
                sellMultiplier = config.large_sell_multiplier || 5;
              } else if (price >= minPriceThreshold && price < maxPriceThreshold) {
                buyTier = 'standard';
                buyAmountUsd = config.standard_buy_amount_usd || 50;
                sellMultiplier = config.standard_sell_multiplier || 3;
              } else if (price >= maxPriceThreshold) {
                buyTier = 'standard';
                buyAmountUsd = config.standard_buy_amount_usd || 50;
                sellMultiplier = config.standard_sell_multiplier || 2;
              } else {
                skipReason = 'Price below threshold without APE keyword';
              }
            }

            const status = skipReason ? 'skipped' : (isFantasyMode ? 'fantasy_bought' : 'detected');

            // Insert call record
            await supabase
              .from('telegram_channel_calls')
              .insert({
                channel_config_id: config.id,
                channel_id: channelId,
                channel_name: config.channel_name,
                message_id: messageId,
                token_mint: tokenMint,
                token_symbol: currentTokenData?.symbol || null,
                token_name: currentTokenData?.name || null,
                raw_message: messageText.substring(0, 1000),
                contains_ape: hasApeKeyword,
                price_at_call: price,
                mint_age_minutes: tokenAge,
                buy_tier: buyTier,
                buy_amount_usd: buyAmountUsd,
                sell_multiplier: sellMultiplier,
                status,
                skip_reason: skipReason,
                caller_username: callerUsername || null,
                caller_display_name: callerDisplayName || null,
                is_first_call: isFirstCall
              });

            // Track caller if first call
            if (isFirstCall && (callerUsername || callerDisplayName)) {
              const { data: existingCaller } = await supabase
                .from('telegram_callers')
                .select('*')
                .eq('caller_username', callerUsername || callerDisplayName?.replace(/\s+/g, '_').toLowerCase())
                .single();

              if (!existingCaller) {
                await supabase
                  .from('telegram_callers')
                  .insert({
                    caller_username: callerUsername || callerDisplayName?.replace(/\s+/g, '_').toLowerCase(),
                    caller_display_name: callerDisplayName,
                    channel_config_id: config.id,
                    total_calls: 1,
                    first_calls: 1,
                    last_active_at: new Date().toISOString()
                  });
              } else {
                await supabase
                  .from('telegram_callers')
                  .update({
                    total_calls: (existingCaller.total_calls || 0) + 1,
                    first_calls: (existingCaller.first_calls || 0) + 1,
                    last_active_at: new Date().toISOString()
                  })
                  .eq('id', existingCaller.id);
              }
            }

            totalProcessed++;

            // Handle fantasy or real trades
            if (!skipReason && buyTier && buyAmountUsd) {
              if (isFantasyMode) {
                // Create fantasy position
                const tokenAmount = price ? buyAmountUsd / price : null;
                await supabase
                  .from('telegram_fantasy_positions')
                  .insert({
                    channel_config_id: config.id,
                    token_mint: tokenMint,
                    token_symbol: currentTokenData?.symbol || null,
                    token_name: currentTokenData?.name || null,
                    entry_price_usd: price,
                    entry_amount_usd: buyAmountUsd,
                    token_amount: tokenAmount,
                    current_price_usd: price,
                    target_sell_multiplier: sellMultiplier,
                    status: 'open',
                    caller_username: callerUsername,
                    caller_display_name: callerDisplayName
                  });

                totalFantasyBuys++;
                console.log(`[telegram-channel-monitor] Fantasy buy: ${currentTokenData?.symbol || tokenMint} - $${buyAmountUsd} @ $${price?.toFixed(10)}`);
              } else {
                // Real trading
                if (config.flipit_wallet_id) {
                  try {
                    await supabase.functions.invoke('flipit-execute', {
                      body: {
                        walletId: config.flipit_wallet_id,
                        action: 'buy',
                        tokenMint,
                        amountUsd: buyAmountUsd,
                        targetMultiplier: sellMultiplier
                      }
                    });
                    totalBuys++;
                  } catch (buyError) {
                    console.error('[telegram-channel-monitor] FlipIt buy error:', buyError);
                  }
                }

                // Send email notification
                if (config.email_notifications && config.notification_email) {
                  await sendEmailNotification(
                    supabase,
                    config.notification_email,
                    tokenMint,
                    currentTokenData?.symbol || 'UNKNOWN',
                    price || 0,
                    hasApeKeyword,
                    buyTier,
                    buyAmountUsd,
                    sellMultiplier || 2
                  );
                }
              }
            }
          }
        }

        // Update last check and message ID
        const maxMessageId = channelMessages.length > 0
          ? Math.max(...channelMessages.map(m => parseInt(m.messageId) || 0))
          : config.last_message_id;

        await supabase
          .from('telegram_channel_config')
          .update({
            last_check_at: new Date().toISOString(),
            last_message_id: maxMessageId
          })
          .eq('id', config.id);

        results.push({
          channel: config.channel_name || channelUsername || channelId,
          channelType,
          messagesFound: channelMessages.length,
          success: true
        });

      } catch (channelError: any) {
        console.error(`[telegram-channel-monitor] Error processing channel ${config.channel_name}:`, channelError);
        results.push({
          channel: config.channel_name || channelUsername || channelId,
          channelType,
          success: false,
          error: channelError.message
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: totalProcessed,
      buysExecuted: totalBuys,
      fantasyBuysExecuted: totalFantasyBuys,
      channels: results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[telegram-channel-monitor] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
