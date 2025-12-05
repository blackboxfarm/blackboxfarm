import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Keypair } from 'https://esm.sh/@solana/web3.js@1.98.0'
import bs58 from 'https://esm.sh/bs58@5.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Inline encryption function - avoids function-to-function calls
async function encryptSecret(plaintext: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plaintext)
  
  const keyMaterial = Deno.env.get('ENCRYPTION_KEY')
  if (!keyMaterial) {
    console.log('⚠️ No ENCRYPTION_KEY found, using base64 fallback')
    return btoa(plaintext)
  }
  
  try {
    const keyData = encoder.encode(keyMaterial.padEnd(32, '0').slice(0, 32))
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    )
    
    const iv = crypto.getRandomValues(new Uint8Array(12))
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    )
    
    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)
    
    return 'AES:' + btoa(String.fromCharCode(...combined))
  } catch (error) {
    console.error('AES encryption failed, using base64 fallback:', error)
    return btoa(plaintext)
  }
}

async function logDecision(
  supabase: any,
  params: {
    user_id?: string
    mega_whale_id?: string
    offspring_wallet?: string
    token_mint?: string
    token_symbol?: string
    decision: string
    reason?: string
    details?: any
    sol_amount?: number
    tx_signature?: string
    launcher_score?: number
  }
) {
  try {
    await supabase.from('mega_whale_decision_log').insert({
      user_id: params.user_id,
      mega_whale_id: params.mega_whale_id,
      offspring_wallet: params.offspring_wallet,
      token_mint: params.token_mint,
      token_symbol: params.token_symbol,
      decision: params.decision,
      reason: params.reason,
      details: params.details || {},
      sol_amount: params.sol_amount,
      tx_signature: params.tx_signature,
      launcher_score: params.launcher_score,
    })
    console.log(`📝 Decision logged: ${params.decision} - ${params.reason}`)
  } catch (e) {
    console.log('Decision log insert failed:', e)
  }
}

async function sendTelegramNotification(
  supabase: any,
  userId: string,
  message: string
) {
  try {
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (!telegramBotToken) {
      console.log('No TELEGRAM_BOT_TOKEN configured')
      return
    }

    // Get user's telegram config
    const { data: config } = await supabase
      .from('mega_whale_alert_config')
      .select('telegram_chat_id, additional_telegram_ids, notify_telegram')
      .eq('user_id', userId)
      .single()

    if (!config?.notify_telegram) {
      console.log('Telegram notifications disabled for user')
      return
    }

    const chatIds: string[] = []
    if (config.telegram_chat_id) chatIds.push(config.telegram_chat_id)
    if (config.additional_telegram_ids?.length) {
      chatIds.push(...config.additional_telegram_ids)
    }

    if (chatIds.length === 0) {
      console.log('No Telegram chat IDs configured')
      return
    }

    for (const chatId of chatIds) {
      const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown'
        })
      })
      if (response.ok) {
        console.log(`✅ Telegram sent to ${chatId}`)
      } else {
        const err = await response.text()
        console.error(`❌ Telegram failed for ${chatId}:`, err)
      }
    }
  } catch (e) {
    console.error('Telegram notification error:', e)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseKey)

    const body = await req.json()
    const { action, user_id, alert_id, token_mint, token_symbol, launcher_score, config } = body

    console.log(`[AUTO-BUYER] Action: ${action}, Token: ${token_mint}, Score: ${launcher_score}`)

    if (action === 'generate_wallet') {
      // Generate a new auto-buy wallet for a user
      const keypair = Keypair.generate()
      const pubkey = keypair.publicKey.toBase58()
      const secretKey = bs58.encode(keypair.secretKey)

      console.log(`Generated keypair with pubkey: ${pubkey}`)

      // Encrypt the secret key directly (no function-to-function call)
      const encryptedSecret = await encryptSecret(secretKey)
      
      console.log(`Encrypted secret key, length: ${encryptedSecret.length}`)

      // Store the wallet
      const { data: wallet, error: walletError } = await supabase
        .from('mega_whale_auto_buy_wallets')
        .insert({
          user_id,
          pubkey,
          secret_key_encrypted: encryptedSecret,
        })
        .select()
        .single()

      if (walletError) {
        console.error('Failed to insert wallet:', walletError)
        throw walletError
      }

      console.log(`Generated auto-buy wallet: ${pubkey}`)

      return new Response(
        JSON.stringify({
          success: true,
          wallet: {
            id: wallet.id,
            pubkey: wallet.pubkey,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'get_wallet') {
      // Get user's auto-buy wallet
      const { data: wallet, error } = await supabase
        .from('mega_whale_auto_buy_wallets')
        .select('id, pubkey, sol_balance, is_active, total_buys, total_sol_spent')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return new Response(
        JSON.stringify({
          success: true,
          wallet: wallet || null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'get_config') {
      // Get user's auto-buy configuration
      const { data: config, error } = await supabase
        .from('mega_whale_auto_buy_config')
        .select('*')
        .eq('user_id', user_id)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return new Response(
        JSON.stringify({
          success: true,
          config: config || {
            is_enabled: false,
            min_launcher_score: 70,
            buy_amount_sol: 0.1,
            max_daily_buys: 10,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'update_config') {
      const { data, error } = await supabase
        .from('mega_whale_auto_buy_config')
        .upsert({
          user_id,
          ...config,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select()
        .single()

      if (error) throw error

      return new Response(
        JSON.stringify({ success: true, config: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'execute_buy') {
      // Check if auto-buy is enabled and configured
      const { data: config, error: configError } = await supabase
        .from('mega_whale_auto_buy_config')
        .select('*')
        .eq('user_id', user_id)
        .single()

      if (configError || !config) {
        console.log('No auto-buy config for user, skipping')
        await logDecision(supabase, {
          user_id,
          token_mint,
          token_symbol,
          decision: 'buy_skipped',
          reason: 'No auto-buy config found',
          launcher_score,
        })
        return new Response(
          JSON.stringify({ success: false, reason: 'No config' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!config.is_enabled) {
        console.log('Auto-buy disabled, skipping')
        await logDecision(supabase, {
          user_id,
          token_mint,
          token_symbol,
          decision: 'buy_skipped',
          reason: 'Auto-buy is disabled',
          launcher_score,
        })
        
        // Still notify about the mint even if auto-buy is off
        await sendTelegramNotification(
          supabase,
          user_id,
          `🔔 *MINT ALERT* (Auto-buy OFF)\n\n` +
          `Token: \`${token_symbol || 'Unknown'}\`\n` +
          `Mint: \`${token_mint}\`\n` +
          `Score: ${launcher_score || 0}\n\n` +
          `_Auto-buy is disabled. Enable to auto-purchase._`
        )
        
        return new Response(
          JSON.stringify({ success: false, reason: 'Disabled' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check launcher score threshold
      if (launcher_score < config.min_launcher_score) {
        console.log(`Launcher score ${launcher_score} below threshold ${config.min_launcher_score}`)
        await logDecision(supabase, {
          user_id,
          token_mint,
          token_symbol,
          decision: 'buy_skipped',
          reason: `Score ${launcher_score} < threshold ${config.min_launcher_score}`,
          launcher_score,
          details: { threshold: config.min_launcher_score },
        })
        
        await sendTelegramNotification(
          supabase,
          user_id,
          `⏭️ *MINT SKIPPED* (Low Score)\n\n` +
          `Token: \`${token_symbol || 'Unknown'}\`\n` +
          `Mint: \`${token_mint}\`\n` +
          `Score: ${launcher_score} (min: ${config.min_launcher_score})\n\n` +
          `_Score below threshold. Not buying._`
        )
        
        return new Response(
          JSON.stringify({ success: false, reason: 'Score too low' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check daily limit
      if (config.buys_today >= config.max_daily_buys) {
        console.log('Daily buy limit reached')
        await logDecision(supabase, {
          user_id,
          token_mint,
          token_symbol,
          decision: 'buy_skipped',
          reason: `Daily limit reached (${config.buys_today}/${config.max_daily_buys})`,
          launcher_score,
          details: { buys_today: config.buys_today, max: config.max_daily_buys },
        })
        
        await sendTelegramNotification(
          supabase,
          user_id,
          `🚫 *MINT SKIPPED* (Daily Limit)\n\n` +
          `Token: \`${token_symbol || 'Unknown'}\`\n` +
          `Mint: \`${token_mint}\`\n` +
          `Score: ${launcher_score}\n` +
          `Buys Today: ${config.buys_today}/${config.max_daily_buys}\n\n` +
          `_Daily buy limit reached._`
        )
        
        return new Response(
          JSON.stringify({ success: false, reason: 'Daily limit reached' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get user's auto-buy wallet
      const { data: wallet, error: walletError } = await supabase
        .from('mega_whale_auto_buy_wallets')
        .select('*')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .single()

      if (walletError || !wallet) {
        console.log('No auto-buy wallet found')
        await logDecision(supabase, {
          user_id,
          token_mint,
          token_symbol,
          decision: 'buy_skipped',
          reason: 'No auto-buy wallet found',
          launcher_score,
        })
        
        await sendTelegramNotification(
          supabase,
          user_id,
          `❌ *BUY FAILED* (No Wallet)\n\n` +
          `Token: \`${token_symbol || 'Unknown'}\`\n` +
          `Mint: \`${token_mint}\`\n` +
          `Score: ${launcher_score}\n\n` +
          `_No auto-buy wallet configured._`
        )
        
        return new Response(
          JSON.stringify({ success: false, reason: 'No wallet' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check wallet balance
      if ((wallet.sol_balance || 0) < config.buy_amount_sol) {
        console.log(`Insufficient balance: ${wallet.sol_balance} < ${config.buy_amount_sol}`)
        
        await logDecision(supabase, {
          user_id,
          token_mint,
          token_symbol,
          decision: 'buy_skipped',
          reason: `Insufficient balance: ${wallet.sol_balance} < ${config.buy_amount_sol} SOL`,
          sol_amount: config.buy_amount_sol,
          launcher_score,
          details: { wallet_balance: wallet.sol_balance, required: config.buy_amount_sol },
        })
        
        // Update alert with failure reason
        if (alert_id) {
          await supabase
            .from('mega_whale_mint_alerts')
            .update({ auto_buy_status: 'insufficient_balance' })
            .eq('id', alert_id)
        }

        await sendTelegramNotification(
          supabase,
          user_id,
          `💰 *BUY FAILED* (Low Balance)\n\n` +
          `Token: \`${token_symbol || 'Unknown'}\`\n` +
          `Mint: \`${token_mint}\`\n` +
          `Score: ${launcher_score}\n` +
          `Wallet Balance: ${wallet.sol_balance?.toFixed(4) || 0} SOL\n` +
          `Required: ${config.buy_amount_sol} SOL\n\n` +
          `_Please fund your auto-buy wallet._`
        )

        return new Response(
          JSON.stringify({ success: false, reason: 'Insufficient balance' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`🚀 Executing auto-buy: ${config.buy_amount_sol} SOL for ${token_mint}`)
      
      // Send "buying" notification
      await sendTelegramNotification(
        supabase,
        user_id,
        `⏳ *BUYING TOKEN...*\n\n` +
        `Token: \`${token_symbol || 'Unknown'}\`\n` +
        `Mint: \`${token_mint}\`\n` +
        `Amount: ${config.buy_amount_sol} SOL\n` +
        `Score: ${launcher_score}`
      )

      // Mark as triggered
      if (alert_id) {
        await supabase
          .from('mega_whale_mint_alerts')
          .update({
            auto_buy_triggered: true,
            auto_buy_amount_sol: config.buy_amount_sol,
            auto_buy_status: 'executing',
          })
          .eq('id', alert_id)
      }

      // Execute the swap via raydium-swap
      try {
        const { data: swapResult, error: swapError } = await supabase.functions.invoke('raydium-swap', {
          body: {
            action: 'buy',
            tokenMint: token_mint,
            amountSol: config.buy_amount_sol,
            slippageBps: config.slippage_bps,
            walletSecretEncrypted: wallet.secret_key_encrypted,
          },
        })

        if (swapError) throw swapError

        // Log success
        await logDecision(supabase, {
          user_id,
          token_mint,
          token_symbol,
          decision: 'buy_executed',
          reason: 'Auto-buy successful',
          sol_amount: config.buy_amount_sol,
          tx_signature: swapResult?.signature,
          launcher_score,
          details: { 
            slippage_bps: config.slippage_bps,
            wallet_pubkey: wallet.pubkey,
          },
        })

        // Update alert with success
        if (alert_id) {
          await supabase
            .from('mega_whale_mint_alerts')
            .update({
              auto_buy_tx: swapResult?.signature,
              auto_buy_status: 'completed',
            })
            .eq('id', alert_id)
        }

        // Update wallet stats
        await supabase
          .from('mega_whale_auto_buy_wallets')
          .update({
            total_buys: (wallet.total_buys || 0) + 1,
            total_sol_spent: (wallet.total_sol_spent || 0) + config.buy_amount_sol,
            sol_balance: (wallet.sol_balance || 0) - config.buy_amount_sol,
          })
          .eq('id', wallet.id)

        // Update daily counter
        await supabase
          .from('mega_whale_auto_buy_config')
          .update({ buys_today: config.buys_today + 1 })
          .eq('user_id', user_id)

        console.log(`✅ Auto-buy completed: ${swapResult?.signature}`)

        // Send success notification
        await sendTelegramNotification(
          supabase,
          user_id,
          `✅ *BUY SUCCESSFUL!*\n\n` +
          `Token: \`${token_symbol || 'Unknown'}\`\n` +
          `Mint: \`${token_mint}\`\n` +
          `Amount: ${config.buy_amount_sol} SOL\n` +
          `Score: ${launcher_score}\n` +
          `TX: \`${swapResult?.signature?.slice(0, 20)}...\`\n\n` +
          `[View on Solscan](https://solscan.io/tx/${swapResult?.signature})`
        )

        return new Response(
          JSON.stringify({
            success: true,
            signature: swapResult?.signature,
            amountSol: config.buy_amount_sol,
            tokenMint: token_mint,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (swapError) {
        console.error('Swap error:', swapError)

        // Log failure
        await logDecision(supabase, {
          user_id,
          token_mint,
          token_symbol,
          decision: 'buy_failed',
          reason: `Swap failed: ${swapError.message}`,
          sol_amount: config.buy_amount_sol,
          launcher_score,
          details: { error: swapError.message },
        })

        // Update alert with failure
        if (alert_id) {
          await supabase
            .from('mega_whale_mint_alerts')
            .update({
              auto_buy_status: 'failed',
            })
            .eq('id', alert_id)
        }

        // Send failure notification
        await sendTelegramNotification(
          supabase,
          user_id,
          `❌ *BUY FAILED*\n\n` +
          `Token: \`${token_symbol || 'Unknown'}\`\n` +
          `Mint: \`${token_mint}\`\n` +
          `Amount: ${config.buy_amount_sol} SOL\n` +
          `Score: ${launcher_score}\n` +
          `Error: ${swapError.message?.slice(0, 100)}`
        )

        return new Response(
          JSON.stringify({ success: false, reason: 'Swap failed', error: swapError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Auto-buyer error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})