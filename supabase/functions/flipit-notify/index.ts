import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { obfuscateTicker } from '../_shared/ticker-obfuscator.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyParams {
  type: 'buy' | 'sell';
  positionId: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenName?: string;
  // Buy-specific
  buyAmountSol?: number;
  buyAmountUsd?: number;
  buyPrice?: number;
  tokensReceived?: number;
  targetMultiplier?: number;
  targetPrice?: number;
  expectedProfit?: number;
  // Sell-specific
  sellAmountSol?: number;
  sellAmountUsd?: number;
  sellPrice?: number;
  tokensSold?: number;
  profitLossSol?: number;
  profitLossUsd?: number;
  profitLossPct?: number;
  holdDurationMins?: number;
  // Common
  walletAddress?: string;
  txSignature?: string;
  venue?: string;
  source?: string;
  sourceChannel?: string;
  priceImpact?: number;
  slippageBps?: number;
  solPrice?: number;
  // Socials
  twitterUrl?: string;
  telegramUrl?: string;
  websiteUrl?: string;
  pumpfunUrl?: string;
}

function formatBuyMessage(params: NotifyParams): string {
  const {
    tokenSymbol, tokenName, tokenMint,
    buyAmountSol, buyAmountUsd, buyPrice, tokensReceived,
    targetMultiplier, targetPrice, expectedProfit,
    walletAddress, txSignature, venue, source, sourceChannel,
    priceImpact, slippageBps, solPrice,
    twitterUrl, telegramUrl, websiteUrl, pumpfunUrl
  } = params;

  const shortMint = tokenMint.slice(0, 8) + '...' + tokenMint.slice(-4);
  const shortWallet = walletAddress ? walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4) : 'N/A';
  const shortSig = txSignature ? txSignature.slice(0, 12) + '...' : 'Pending';
  const safeTicker = obfuscateTicker(tokenSymbol);

  let msg = `🟢 *FLIPIT BUY EXECUTED*\n\n`;
  msg += `📊 *Token:* ${safeTicker}${tokenName ? ` (${tokenName})` : ''}\n`;
  msg += `🔗 \`${shortMint}\`\n\n`;
  
  msg += `💰 *Trade Details:*\n`;
  msg += `├ Spent: ${buyAmountSol?.toFixed(4) || '?'} SOL (~$${buyAmountUsd?.toFixed(2) || '?'})\n`;
  msg += `├ Entry Price: $${buyPrice?.toExponential(4) || '?'}\n`;
  msg += `├ Tokens: ${tokensReceived?.toLocaleString() || '?'}\n`;
  msg += `├ SOL Price: $${solPrice?.toFixed(2) || '?'}\n`;
  msg += `└ Venue: ${venue || 'Unknown'}\n\n`;
  
  msg += `🎯 *Target:*\n`;
  msg += `├ Multiplier: ${targetMultiplier || '?'}x\n`;
  msg += `├ Target Price: $${targetPrice?.toExponential(4) || '?'}\n`;
  msg += `└ Expected Profit: $${expectedProfit?.toFixed(2) || '?'}\n\n`;
  
  msg += `⚙️ *Execution:*\n`;
  msg += `├ Source: ${source || 'Manual'}${sourceChannel ? ` (${sourceChannel})` : ''}\n`;
  msg += `├ Slippage: ${((slippageBps || 0) / 100).toFixed(1)}%\n`;
  msg += `├ Price Impact: ${(priceImpact || 0).toFixed(2)}%\n`;
  msg += `└ Wallet: \`${shortWallet}\`\n\n`;
  
  // Links section
  const links: string[] = [];
  if (pumpfunUrl || tokenMint) {
    links.push(`[Pump.fun](${pumpfunUrl || `https://pump.fun/${tokenMint}`})`);
  }
  if (txSignature) {
    links.push(`[Solscan](https://solscan.io/tx/${txSignature})`);
  }
  if (twitterUrl) {
    links.push(`[Twitter](${twitterUrl})`);
  }
  if (telegramUrl) {
    links.push(`[Telegram](${telegramUrl})`);
  }
  if (websiteUrl) {
    links.push(`[Website](${websiteUrl})`);
  }
  
  if (links.length > 0) {
    msg += `🔗 ${links.join(' • ')}\n\n`;
  }
  
  msg += `📋 TX: \`${shortSig}\``;
  
  return msg;
}

function formatSellMessage(params: NotifyParams): string {
  const {
    tokenSymbol, tokenName, tokenMint,
    buyAmountSol, buyAmountUsd, buyPrice,
    sellAmountSol, sellAmountUsd, sellPrice, tokensSold,
    profitLossSol, profitLossUsd, profitLossPct, holdDurationMins,
    walletAddress, txSignature, venue, source,
    solPrice, twitterUrl, telegramUrl, websiteUrl, pumpfunUrl
  } = params;

  const shortMint = tokenMint.slice(0, 8) + '...' + tokenMint.slice(-4);
  const shortWallet = walletAddress ? walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4) : 'N/A';
  const shortSig = txSignature ? txSignature.slice(0, 12) + '...' : 'Pending';
  
  const isProfitable = (profitLossSol || 0) >= 0;
  const emoji = isProfitable ? '🟢' : '🔴';
  const profitEmoji = isProfitable ? '📈' : '📉';
  
  // Calculate X return
  const entryValue = buyAmountSol || buyAmountUsd || 0;
  const exitValue = sellAmountSol || sellAmountUsd || 0;
  const xReturn = entryValue > 0 ? (exitValue / entryValue) : 0;
  const safeTicker = obfuscateTicker(tokenSymbol);

  let msg = `${emoji} *FLIPIT SELL EXECUTED*\n\n`;
  msg += `📊 *Token:* ${safeTicker}${tokenName ? ` (${tokenName})` : ''}\n`;
  msg += `🔗 \`${shortMint}\`\n\n`;
  
  msg += `${profitEmoji} *P&L Summary:*\n`;
  msg += `├ Result: ${isProfitable ? '✅ PROFIT' : '❌ LOSS'}\n`;
  msg += `├ Return: ${xReturn.toFixed(2)}x (${(profitLossPct || 0) >= 0 ? '+' : ''}${(profitLossPct || 0).toFixed(1)}%)\n`;
  msg += `├ P&L (SOL): ${(profitLossSol || 0) >= 0 ? '+' : ''}${(profitLossSol || 0).toFixed(4)} SOL\n`;
  msg += `├ P&L (USD): ${(profitLossUsd || 0) >= 0 ? '+' : ''}$${(profitLossUsd || 0).toFixed(2)}\n`;
  msg += `└ Hold Time: ${holdDurationMins ? `${holdDurationMins.toFixed(0)} mins` : 'N/A'}\n\n`;
  
  msg += `💰 *Trade Flow:*\n`;
  msg += `├ Entry: ${buyAmountSol?.toFixed(4) || '?'} SOL @ $${buyPrice?.toExponential(4) || '?'}\n`;
  msg += `├ Exit: ${sellAmountSol?.toFixed(4) || '?'} SOL @ $${sellPrice?.toExponential(4) || '?'}\n`;
  msg += `├ Tokens Sold: ${tokensSold?.toLocaleString() || '?'}\n`;
  msg += `└ SOL Price: $${solPrice?.toFixed(2) || '?'}\n\n`;
  
  msg += `⚙️ *Execution:*\n`;
  msg += `├ Venue: ${venue || 'Unknown'}\n`;
  msg += `├ Source: ${source || 'Manual'}\n`;
  msg += `└ Wallet: \`${shortWallet}\`\n\n`;
  
  // Links section
  const links: string[] = [];
  if (pumpfunUrl || tokenMint) {
    links.push(`[Pump.fun](${pumpfunUrl || `https://pump.fun/${tokenMint}`})`);
  }
  if (txSignature) {
    links.push(`[Solscan](https://solscan.io/tx/${txSignature})`);
  }
  if (twitterUrl) {
    links.push(`[Twitter](${twitterUrl})`);
  }
  
  if (links.length > 0) {
    msg += `🔗 ${links.join(' • ')}\n\n`;
  }
  
  msg += `📋 TX: \`${shortSig}\``;
  
  return msg;
}

serve(withRunLog('flipit-notify', async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: NotifyParams = await req.json();
    const { type, positionId, tokenMint, tokenSymbol } = body;

    if (!type || !tokenMint) {
      return new Response(JSON.stringify({ error: "Missing type or tokenMint" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[flipit-notify] Sending ${type} notification for ${tokenSymbol} (${tokenMint.slice(0, 8)}...)`);

    // Get all notification settings with enabled targets
    const { data: allSettings } = await supabase
      .from('flipit_notification_settings')
      .select(`
        id,
        user_id,
        is_enabled,
        notify_on_buy,
        notify_on_sell,
        flipit_notification_targets (
          target_id
        )
      `)
      .eq('is_enabled', true);

    if (!allSettings || allSettings.length === 0) {
      console.log('[flipit-notify] No enabled notification settings found');
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No notifications enabled' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Collect all target IDs that need notifications
    const targetIds = new Set<string>();
    
    for (const settings of allSettings) {
      // Check if this notification type should be sent
      if (type === 'buy' && !settings.notify_on_buy) continue;
      if (type === 'sell' && !settings.notify_on_sell) continue;
      
      // Add all targets for this user
      const targets = settings.flipit_notification_targets as { target_id: string }[];
      for (const t of targets || []) {
        targetIds.add(t.target_id);
      }
    }

    if (targetIds.size === 0) {
      console.log('[flipit-notify] No targets for this notification type');
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No targets for this type' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target details
    const { data: targets } = await supabase
      .from('telegram_message_targets')
      .select('*')
      .in('id', Array.from(targetIds));

    if (!targets || targets.length === 0) {
      console.log('[flipit-notify] No valid targets found');
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No valid targets' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Format the message
    const message = type === 'buy' ? formatBuyMessage(body) : formatSellMessage(body);

    // Send to all targets via MTProto
    const results: { target: string; success: boolean; error?: string }[] = [];

    for (const target of targets) {
      try {
        console.log(`[flipit-notify] Sending to ${target.label} (${target.chat_id || target.chat_username})`);
        
        const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
          body: {
            action: 'send_message',
            chatId: target.target_type === 'private' ? target.chat_id : undefined,
            chatUsername: target.target_type === 'public' ? target.chat_username : undefined,
            message: message
          }
        });

        if (error) {
          console.error(`[flipit-notify] Failed to send to ${target.label}:`, error);
          results.push({ target: target.label, success: false, error: error.message });
        } else if (data?.success) {
          console.log(`[flipit-notify] ✓ Sent to ${target.label}`);
          results.push({ target: target.label, success: true });
          
          // Update last_used_at
          await supabase
            .from('telegram_message_targets')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', target.id);
        } else {
          console.error(`[flipit-notify] Failed to send to ${target.label}:`, data?.error);
          results.push({ target: target.label, success: false, error: data?.error });
        }
      } catch (e) {
        console.error(`[flipit-notify] Exception sending to ${target.label}:`, e);
        results.push({ target: target.label, success: false, error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[flipit-notify] Sent ${successCount}/${results.length} notifications`);

    return new Response(JSON.stringify({ 
      success: true, 
      sent: successCount,
      total: results.length,
      results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('[flipit-notify] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));

