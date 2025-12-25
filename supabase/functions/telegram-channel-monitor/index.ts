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
  // Filter out common false positives (too short, looks like words)
  return matches.filter(addr => {
    if (addr.length < 32 || addr.length > 44) return false;
    // Must have a mix of upper/lower/numbers
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

// Fetch token price from Jupiter
async function fetchTokenPrice(tokenMint: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.jup.ag/price/v2?ids=${tokenMint}`
    );
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
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
    );
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

// Estimate token age from on-chain data (simplified - uses DexScreener pair creation time)
async function estimateTokenAge(tokenMint: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
    );
    const data = await response.json();
    if (data.pairs?.[0]?.pairCreatedAt) {
      const createdAt = data.pairs[0].pairCreatedAt;
      const ageMs = Date.now() - createdAt;
      return Math.floor(ageMs / 60000); // Age in minutes
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
        metadata: {
          tokenMint,
          tokenSymbol,
          price,
          buyTier,
          buyAmount,
          sellMultiplier
        }
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    
    if (!botToken) {
      return new Response(JSON.stringify({
        success: false,
        error: 'TELEGRAM_BOT_TOKEN not configured'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

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

    for (const config of configs) {
      const channelId = requestChannelId || config.channel_id;
      console.log(`[telegram-channel-monitor] Processing channel: ${channelId} (${config.channel_name || 'unnamed'})`);

      try {
        // Fetch recent messages using Telegram Bot API
        // Note: Bot must be admin in the channel to read messages
        const updatesResponse = await fetch(
          `https://api.telegram.org/bot${botToken}/getUpdates?offset=-100&limit=100`
        );
        const updatesData = await updatesResponse.json();

        if (!updatesData.ok) {
          console.error(`[telegram-channel-monitor] Bot API error:`, updatesData.description);
          results.push({
            channelId,
            error: updatesData.description,
            processed: 0
          });
          continue;
        }

        // Filter messages from the target channel
        const channelMessages = updatesData.result?.filter((update: any) => {
          const msg = update.channel_post || update.message;
          if (!msg) return false;
          const chatId = msg.chat?.id?.toString();
          return chatId === channelId || chatId === channelId.replace('-100', '');
        }) || [];

        console.log(`[telegram-channel-monitor] Found ${channelMessages.length} messages from channel ${channelId}`);

        for (const update of channelMessages) {
          const msg = update.channel_post || update.message;
          if (!msg?.text) continue;

          const messageId = msg.message_id;
          const messageText = msg.text;
          const messageDate = new Date(msg.date * 1000);

          // Skip if message is too old (> 1 hour)
          const messageAgeMinutes = (Date.now() - messageDate.getTime()) / 60000;
          if (messageAgeMinutes > 60) continue;

          // Skip if we already processed this message
          if (config.last_message_id && messageId <= config.last_message_id) {
            continue;
          }

          // Extract Solana addresses
          const addresses = extractSolanaAddresses(messageText);
          if (addresses.length === 0) continue;

          console.log(`[telegram-channel-monitor] Found ${addresses.length} addresses in message ${messageId}`);

          for (const tokenMint of addresses) {
            // Check if already processed
            const { data: existing } = await supabase
              .from('telegram_channel_calls')
              .select('id')
              .eq('channel_id', channelId)
              .eq('token_mint', tokenMint)
              .single();

            if (existing) {
              console.log(`[telegram-channel-monitor] Token ${tokenMint} already processed, skipping`);
              continue;
            }

            // Check for ape keyword
            const hasApeKeyword = containsApeKeyword(messageText);

            // Fetch token data
            let price = await fetchTokenPrice(tokenMint);
            let marketCap: number | null = null;
            
            if (price === null) {
              const dexData = await fetchDexScreenerPrice(tokenMint);
              price = dexData.price;
              marketCap = dexData.marketCap;
            }

            const tokenAge = await estimateTokenAge(tokenMint);
            const metadata = await fetchTokenMetadata(tokenMint);

            console.log(`[telegram-channel-monitor] Token ${tokenMint}: price=$${price}, age=${tokenAge}min, ape=${hasApeKeyword}`);

            // Apply trading rules
            let buyTier: string | null = null;
            let buyAmountUsd: number | null = null;
            let sellMultiplier: number | null = null;
            let skipReason: string | null = null;

            // Check if token is too old
            if (tokenAge !== null && tokenAge > (config.max_mint_age_minutes || 60)) {
              skipReason = `Token too old: ${tokenAge} minutes`;
            }
            // Check if price is available
            else if (price === null) {
              skipReason = 'Unable to fetch price';
            }
            // Apply trading logic based on config
            else {
              const minPriceThreshold = config.min_price_threshold || 0.00002;
              const maxPriceThreshold = config.max_price_threshold || 0.00004;

              if (hasApeKeyword && price < minPriceThreshold) {
                // Large buy: "ape" keyword + low price
                buyTier = 'large';
                buyAmountUsd = config.large_buy_amount_usd || 100;
                sellMultiplier = config.large_sell_multiplier || 10;
              } else if (price > maxPriceThreshold) {
                // Standard buy: higher price
                buyTier = 'standard';
                buyAmountUsd = config.standard_buy_amount_usd || 50;
                sellMultiplier = config.standard_sell_multiplier || 5;
              } else if (hasApeKeyword) {
                // Ape keyword but price in middle range
                buyTier = 'standard';
                buyAmountUsd = config.standard_buy_amount_usd || 50;
                sellMultiplier = config.large_sell_multiplier || 10; // Higher target for ape calls
              } else {
                skipReason = 'Price in middle range without ape keyword';
              }
            }

            // Insert call record
            const { data: callRecord, error: insertError } = await supabase
              .from('telegram_channel_calls')
              .insert({
                channel_id: channelId,
                channel_name: config.channel_name,
                message_id: messageId,
                token_mint: tokenMint,
                token_symbol: metadata?.symbol || 'UNKNOWN',
                token_name: metadata?.name || 'Unknown',
                raw_message: messageText.substring(0, 1000), // Limit message length
                contains_ape: hasApeKeyword,
                price_at_call: price,
                market_cap_at_call: marketCap,
                mint_age_minutes: tokenAge,
                buy_tier: buyTier,
                buy_amount_usd: buyAmountUsd,
                sell_multiplier: sellMultiplier,
                status: skipReason ? 'skipped' : 'detected',
                skip_reason: skipReason
              })
              .select()
              .single();

            if (insertError) {
              console.error(`[telegram-channel-monitor] Error inserting call:`, insertError);
              continue;
            }

            totalProcessed++;

            // If we should buy, execute the trade
            if (buyTier && buyAmountUsd && !skipReason && config.flipit_wallet_id) {
              console.log(`[telegram-channel-monitor] Executing ${buyTier} buy: $${buyAmountUsd} of ${tokenMint}`);

              try {
                // Send email notification first
                if (config.email_notifications && config.notification_email) {
                  const emailSent = await sendEmailNotification(
                    supabase,
                    config.notification_email,
                    tokenMint,
                    metadata?.symbol || 'UNKNOWN',
                    price!,
                    hasApeKeyword,
                    buyTier,
                    buyAmountUsd,
                    sellMultiplier!
                  );

                  if (emailSent) {
                    await supabase
                      .from('telegram_channel_calls')
                      .update({ email_sent: true, email_sent_at: new Date().toISOString() })
                      .eq('id', callRecord.id);
                  }
                }

                // Execute buy via flipit-execute
                const { data: buyResult, error: buyError } = await supabase.functions.invoke('flipit-execute', {
                  body: {
                    action: 'buy',
                    tokenMint,
                    walletId: config.flipit_wallet_id,
                    amountUsd: buyAmountUsd,
                    targetMultiplier: sellMultiplier
                  }
                });

                if (buyError) {
                  console.error(`[telegram-channel-monitor] Buy error:`, buyError);
                  await supabase
                    .from('telegram_channel_calls')
                    .update({ 
                      status: 'failed', 
                      skip_reason: buyError.message 
                    })
                    .eq('id', callRecord.id);
                } else if (buyResult?.success) {
                  console.log(`[telegram-channel-monitor] Buy successful:`, buyResult);
                  await supabase
                    .from('telegram_channel_calls')
                    .update({ 
                      status: 'bought',
                      position_id: buyResult.positionId,
                      buy_tx_signature: buyResult.txSignature
                    })
                    .eq('id', callRecord.id);
                  totalBuys++;
                } else {
                  await supabase
                    .from('telegram_channel_calls')
                    .update({ 
                      status: 'failed', 
                      skip_reason: buyResult?.error || 'Unknown buy error'
                    })
                    .eq('id', callRecord.id);
                }
              } catch (buyErr: any) {
                console.error(`[telegram-channel-monitor] Buy exception:`, buyErr);
                await supabase
                  .from('telegram_channel_calls')
                  .update({ 
                    status: 'failed', 
                    skip_reason: buyErr.message 
                  })
                  .eq('id', callRecord.id);
              }
            }
          }

          // Update last processed message ID
          await supabase
            .from('telegram_channel_config')
            .update({ 
              last_message_id: messageId,
              last_check_at: new Date().toISOString(),
              total_calls_detected: (config.total_calls_detected || 0) + 1
            })
            .eq('id', config.id);
        }

        results.push({
          channelId,
          channelName: config.channel_name,
          messagesProcessed: channelMessages.length,
          success: true
        });

      } catch (channelError: any) {
        console.error(`[telegram-channel-monitor] Error processing channel ${channelId}:`, channelError);
        results.push({
          channelId,
          error: channelError.message,
          processed: 0
        });
      }
    }

    // Update total buys count
    if (totalBuys > 0) {
      for (const config of configs) {
        await supabase
          .from('telegram_channel_config')
          .update({ 
            total_buys_executed: (config.total_buys_executed || 0) + totalBuys
          })
          .eq('id', config.id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: totalProcessed,
      buysExecuted: totalBuys,
      channels: results
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[telegram-channel-monitor] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
