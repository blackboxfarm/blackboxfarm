import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const heliusApiKey = Deno.env.get('HELIUS_API_KEY')

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const body = await req.json()
    const { user_id } = body

    // Get all open fantasy trades
    let query = supabase
      .from('fantasy_trades')
      .select('*')
      .eq('status', 'open')

    if (user_id) {
      query = query.eq('user_id', user_id)
    }

    const { data: trades, error: tradesError } = await query

    if (tradesError) {
      console.error('Error fetching trades:', tradesError)
      throw tradesError
    }

    if (!trades || trades.length === 0) {
      return new Response(
        JSON.stringify({ success: true, updated: 0, message: 'No open trades to update' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get unique token mints
    const tokenMints = [...new Set(trades.map(t => t.token_mint))]
    console.log(`Updating prices for ${tokenMints.length} tokens`)

    // Fetch current prices from Jupiter
    const priceUpdates: Record<string, number> = {}

    for (const mint of tokenMints) {
      try {
        // Use Jupiter price API
        const priceRes = await fetch(
          `https://price.jup.ag/v6/price?ids=${mint}&vsToken=So11111111111111111111111111111111111111112`
        )
        
        if (priceRes.ok) {
          const priceData = await priceRes.json()
          if (priceData.data?.[mint]?.price) {
            priceUpdates[mint] = priceData.data[mint].price
            console.log(`Price for ${mint}: ${priceUpdates[mint]}`)
          }
        }
      } catch (e) {
        console.error(`Error fetching price for ${mint}:`, e)
      }
    }

    // Update each trade with new price and P&L
    let updated = 0
    for (const trade of trades) {
      const currentPrice = priceUpdates[trade.token_mint]
      
      if (currentPrice !== undefined) {
        // Calculate P&L
        // entry_price_sol is the SOL price per token at entry
        // We bought entry_amount_sol worth of tokens
        // Token amount = entry_amount_sol / entry_price_sol
        // Current value = token_amount * current_price
        // P&L = current_value - entry_amount_sol
        
        const tokenAmount = trade.entry_price_sol > 0 
          ? trade.entry_amount_sol / trade.entry_price_sol 
          : 0
        const currentValue = tokenAmount * currentPrice
        const unrealizedPnlSol = currentValue - trade.entry_amount_sol
        const unrealizedPnlPercent = trade.entry_amount_sol > 0 
          ? (unrealizedPnlSol / trade.entry_amount_sol) * 100 
          : 0

        const { error: updateError } = await supabase
          .from('fantasy_trades')
          .update({
            current_price_sol: currentPrice,
            unrealized_pnl_sol: unrealizedPnlSol,
            unrealized_pnl_percent: unrealizedPnlPercent,
            updated_at: new Date().toISOString()
          })
          .eq('id', trade.id)

        if (!updateError) {
          updated++
        } else {
          console.error(`Error updating trade ${trade.id}:`, updateError)
        }
      }
    }

    console.log(`Updated ${updated} fantasy trades`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated,
        prices: priceUpdates
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Update fantasy prices error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
