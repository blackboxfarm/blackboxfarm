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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { action, user_id, alert_id, token_mint, launcher_score } = await req.json()

    console.log(`Auto-buyer action: ${action}`)

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
      const { config } = await req.json()
      
      const { data, error } = await supabase
        .from('mega_whale_auto_buy_config')
        .upsert({
          user_id,
          ...config,
          updated_at: new Date().toISOString(),
        })
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
        return new Response(
          JSON.stringify({ success: false, reason: 'No config' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!config.is_enabled) {
        console.log('Auto-buy disabled, skipping')
        return new Response(
          JSON.stringify({ success: false, reason: 'Disabled' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check launcher score threshold
      if (launcher_score < config.min_launcher_score) {
        console.log(`Launcher score ${launcher_score} below threshold ${config.min_launcher_score}`)
        return new Response(
          JSON.stringify({ success: false, reason: 'Score too low' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check daily limit
      if (config.buys_today >= config.max_daily_buys) {
        console.log('Daily buy limit reached')
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
        return new Response(
          JSON.stringify({ success: false, reason: 'No wallet' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check wallet balance
      if ((wallet.sol_balance || 0) < config.buy_amount_sol) {
        console.log(`Insufficient balance: ${wallet.sol_balance} < ${config.buy_amount_sol}`)
        
        // Update alert with failure reason
        if (alert_id) {
          await supabase
            .from('mega_whale_mint_alerts')
            .update({ auto_buy_status: 'insufficient_balance' })
            .eq('id', alert_id)
        }

        return new Response(
          JSON.stringify({ success: false, reason: 'Insufficient balance' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`Executing auto-buy: ${config.buy_amount_sol} SOL for ${token_mint}`)

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

        console.log(`Auto-buy completed: ${swapResult?.signature}`)

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

        // Update alert with failure
        if (alert_id) {
          await supabase
            .from('mega_whale_mint_alerts')
            .update({
              auto_buy_status: 'failed',
            })
            .eq('id', alert_id)
        }

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