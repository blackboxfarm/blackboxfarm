import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('wallet-monitor');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WalletTransaction {
  monitored_wallet_id: string;
  signature: string;
  transaction_type: 'buy' | 'sell';
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  amount_sol: number;
  amount_usd?: number;
  platform?: string;
  is_first_purchase: boolean;
  meets_criteria: boolean;
  timestamp: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const { headers } = req
  const upgradeHeader = headers.get('upgrade') || ''

  if (upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket connection', { status: 400 })
  }

  const { socket, response } = Deno.upgradeWebSocket(req)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const heliusApiKey = Deno.env.get('HELIUS_API_KEY')

  if (!heliusApiKey) {
    console.error('HELIUS_API_KEY not configured')
    socket.close(1008, 'Server configuration error')
    return response
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  let heliusSocket: WebSocket | null = null
  const monitoredWallets = new Set<string>()

  // Function to get monitored wallets
  const loadMonitoredWallets = async () => {
    try {
      const { data, error } = await supabase
        .from('monitored_wallets')
        .select('wallet_address')
        .eq('is_active', true)

      if (error) {
        console.error('Error loading monitored wallets:', error)
        return
      }

      monitoredWallets.clear()
      data?.forEach(wallet => monitoredWallets.add(wallet.wallet_address))
      console.log(`Loaded ${monitoredWallets.size} monitored wallets`)
    } catch (err) {
      console.error('Failed to load monitored wallets:', err)
    }
  }

  // Function to get SOL price
  const getSolPrice = async (): Promise<number> => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
      const data = await response.json()
      return data.solana?.usd || 0
    } catch (err) {
      console.error('Failed to get SOL price:', err)
      return 0
    }
  }

  // Function to check if it's first purchase
  const isFirstPurchase = async (monitoredWalletId: string, tokenMint: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('id')
        .eq('monitored_wallet_id', monitoredWalletId)
        .eq('token_mint', tokenMint)
        .eq('transaction_type', 'buy')
        .limit(1)

      if (error) {
        console.error('Error checking first purchase:', error)
        return false
      }

      return (data?.length || 0) === 0
    } catch (err) {
      console.error('Failed to check first purchase:', err)
      return false
    }
  }

  // Function to detect platform
  const detectPlatform = async (signature: string): Promise<string> => {
    try {
      const response = await fetch(`https://api.helius.xyz/v0/transactions/${signature}?api-key=${heliusApiKey}`)
      const data = await response.json()
      
      // Check for Raydium program IDs
      const raydiumPrograms = [
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
        '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', // Raydium Liquidity
      ]
      
      const pumpPrograms = [
        '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' // Pump.fun
      ]

      const programIds = data?.accountKeys?.map((key: any) => key.pubkey) || []
      
      if (programIds.some((id: string) => raydiumPrograms.includes(id))) {
        return 'raydium'
      } else if (programIds.some((id: string) => pumpPrograms.includes(id))) {
        return 'pump.fun'
      }
      
      return 'unknown'
    } catch (err) {
      console.error('Failed to detect platform:', err)
      return 'unknown'
    }
  }

  // Function to process transaction
  const processTransaction = async (txData: any) => {
    try {
      const { signature, source, type, feePayer, events } = txData
      
      if (!monitoredWallets.has(feePayer)) return

      // Parse swap events
      const swapEvents = events?.filter((e: any) => e.type === 'SWAP') || []
      
      for (const swapEvent of swapEvents) {
        const { tokenInputs, tokenOutputs } = swapEvent
        
        // Determine if this is a buy or sell based on SOL involvement
        const solInput = tokenInputs?.find((t: any) => t.mint === 'So11111111111111111111111111111111111111112')
        const solOutput = tokenOutputs?.find((t: any) => t.mint === 'So11111111111111111111111111111111111111112')
        
        let transactionType: 'buy' | 'sell'
        let tokenMint: string
        let amountSol: number
        
        if (solInput && !solOutput) {
          // Selling SOL for tokens = buying tokens
          transactionType = 'buy'
          tokenMint = tokenOutputs?.[0]?.mint || ''
          amountSol = parseFloat(solInput.rawTokenAmount.tokenAmount) / 1e9
        } else if (!solInput && solOutput) {
          // Selling tokens for SOL = selling tokens
          transactionType = 'sell'
          tokenMint = tokenInputs?.[0]?.mint || ''
          amountSol = parseFloat(solOutput.rawTokenAmount.tokenAmount) / 1e9
        } else {
          continue // Skip if not a clear buy/sell
        }

        if (!tokenMint || amountSol <= 0) continue

        // Get monitored wallet ID
        const { data: walletData } = await supabase
          .from('monitored_wallets')
          .select('id')
          .eq('wallet_address', feePayer)
          .single()

        if (!walletData) continue

        const solPrice = await getSolPrice()
        const amountUsd = amountSol * solPrice
        const platform = await detectPlatform(signature)
        const firstPurchase = transactionType === 'buy' ? await isFirstPurchase(walletData.id, tokenMint) : false
        
        // Check if meets criteria: new + >$1000 + raydium
        const meetsCriteria = transactionType === 'buy' && 
                             firstPurchase && 
                             amountUsd > 1000 && 
                             platform === 'raydium'

        const transaction: WalletTransaction = {
          monitored_wallet_id: walletData.id,
          signature,
          transaction_type: transactionType,
          token_mint: tokenMint,
          amount_sol: amountSol,
          amount_usd: amountUsd,
          platform,
          is_first_purchase: firstPurchase,
          meets_criteria: meetsCriteria,
          timestamp: new Date().toISOString()
        }

        // Store in database
        const { error } = await supabase
          .from('wallet_transactions')
          .insert(transaction)

        if (error) {
          console.error('Error storing transaction:', error)
        } else {
          console.log(`Stored ${transactionType} transaction:`, {
            signature: signature.substring(0, 8),
            token: tokenMint.substring(0, 8),
            amountSol,
            amountUsd,
            platform,
            meetsCriteria
          })
        }
      }
    } catch (err) {
      console.error('Error processing transaction:', err)
    }
  }

  // Setup Helius websocket
  const setupHeliusSocket = () => {
    if (monitoredWallets.size === 0) {
      console.log('No wallets to monitor')
      return
    }

    const wsUrl = `wss://api.helius.xyz/v0/websocket/?api-key=${heliusApiKey}`
    heliusSocket = new WebSocket(wsUrl)

    heliusSocket.onopen = () => {
      console.log('Connected to Helius websocket')
      
      // Subscribe to wallet transactions
      const subscribeMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'transactionSubscribe',
        params: [
          {
            accountInclude: Array.from(monitoredWallets),
            accountRequired: Array.from(monitoredWallets)
          },
          {
            commitment: 'confirmed',
            encoding: 'jsonParsed',
            transactionDetails: 'full',
            showRewards: false,
            maxSupportedTransactionVersion: 0
          }
        ]
      }
      
      heliusSocket?.send(JSON.stringify(subscribeMessage))
      console.log(`Subscribed to ${monitoredWallets.size} wallets`)
    }

    heliusSocket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.method === 'transactionNotification') {
          await processTransaction(data.params.result)
        }
      } catch (err) {
        console.error('Error handling Helius message:', err)
      }
    }

    heliusSocket.onerror = (error) => {
      console.error('Helius websocket error:', error)
    }

    heliusSocket.onclose = () => {
      console.log('Helius websocket closed, reconnecting...')
      setTimeout(setupHeliusSocket, 5000)
    }
  }

  socket.onopen = async () => {
    console.log('Client connected to wallet monitor')
    await loadMonitoredWallets()
    setupHeliusSocket()
  }

  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data)

      if (message.type === 'refresh_wallets') {
        await loadMonitoredWallets()
        if (heliusSocket) heliusSocket.close()
        setupHeliusSocket()
      } else if (message.type === 'add_wallet' && message.address) {
        monitoredWallets.add(message.address)
        if (heliusSocket) heliusSocket.close()
        setupHeliusSocket()
      } else if (message.type === 'remove_wallet' && message.address) {
        monitoredWallets.delete(message.address)
        if (heliusSocket) heliusSocket.close()
        setupHeliusSocket()
      }
    } catch (err) {
      console.error('Error handling client message:', err)
    }
  }

  socket.onclose = () => {
    console.log('Client disconnected')
    if (heliusSocket) {
      heliusSocket.close()
    }
  }

  return response
})