import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS pre-flight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the Supabase URL and Key from the environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables')
    }

    // Create a Supabase client
    const supabaseClient = createClient(supabaseUrl, supabaseKey)

    // Get the ticker from the request body
    const { ticker } = await req.json()
    console.log({ ticker })

    if (!ticker) {
      throw new Error('Missing ticker in request body')
    }

    // // Check if the ticker already exists in the database
    // const { data: existingTicker, error: tickerError } = await supabaseClient
    //   .from('tickers')
    //   .select('*')
    //   .eq('ticker', ticker)
    //   .single()

    // if (tickerError) {
    //   console.error('Error checking for existing ticker:', tickerError)
    //   return new Response(JSON.stringify({ error: 'Error checking for existing ticker' }), {
    //     status: 500,
    //     headers: { 'Content-Type': 'application/json' },
    //   })
    // }

    // if (existingTicker) {
    //   console.log('Ticker already exists:', ticker)
    //   return new Response(JSON.stringify({ message: 'Ticker already exists' }), {
    //     status: 200,
    //     headers: { 'Content-Type': 'application/json' },
    //   })
    // }

    // Insert the ticker into the database
    const { data, error } = await supabaseClient
      .from('tickers')
      .insert([{ ticker }])
      .select()

    if (error) {
      console.error('Error inserting ticker:', error)
      return new Response(JSON.stringify({ error: 'Error inserting ticker' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log('Ticker inserted:', ticker)
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
