import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Keypair } from 'https://esm.sh/@solana/web3.js@1.87.6';
import { encode as bs58Encode } from 'https://esm.sh/bs58@5.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header - use service role to verify token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract token and verify with service role client
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('User validation error:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid user', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Validated user:', user.id, user.email);

    const { imageUrl, linkUrl, title, email, twitter, durationHours, priceUsd, startTime } = await req.json();

    // Validate required fields
    if (!imageUrl || !linkUrl || !title || !email || !durationHours || !priceUsd || !startTime) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current SOL price
    let solPrice = 150; // Default fallback
    try {
      const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const priceData = await priceResponse.json();
      if (priceData?.solana?.usd) {
        solPrice = priceData.solana.usd;
      }
    } catch (e) {
      console.error('Error fetching SOL price:', e);
    }

    const priceSol = priceUsd / solPrice;
    const endTime = new Date(new Date(startTime).getTime() + durationHours * 60 * 60 * 1000).toISOString();

    // Check if user has an advertiser account
    let { data: advertiserAccount, error: accountError } = await supabase
      .from('advertiser_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Create advertiser account if doesn't exist
    if (!advertiserAccount) {
      // Generate new Solana wallet for this advertiser
      const keypair = Keypair.generate();
      const pubkey = keypair.publicKey.toBase58();
      const secretKey = bs58Encode(keypair.secretKey);

      // Encrypt the secret key
      const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
      if (!encryptionKey) {
        throw new Error('Encryption key not configured');
      }

      // Simple encryption using Web Crypto API
      const encoder = new TextEncoder();
      const keyData = encoder.encode(encryptionKey.slice(0, 32).padEnd(32, '0'));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );

      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        encoder.encode(secretKey)
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encryptedData.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encryptedData), iv.length);
      const encryptedSecret = btoa(String.fromCharCode(...combined));

      const { data: newAccount, error: createError } = await supabase
        .from('advertiser_accounts')
        .insert({
          user_id: user.id,
          email,
          twitter_handle: twitter,
          payment_wallet_pubkey: pubkey,
          payment_wallet_secret_encrypted: encryptedSecret,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating advertiser account:', createError);
        throw createError;
      }

      advertiserAccount = newAccount;
      console.log('Created new advertiser account:', advertiserAccount.id);
    } else {
      // Update email/twitter if changed
      if (advertiserAccount.email !== email || advertiserAccount.twitter_handle !== twitter) {
        await supabase
          .from('advertiser_accounts')
          .update({ email, twitter_handle: twitter })
          .eq('id', advertiserAccount.id);
      }
    }

    // Generate activation key
    const activationKey = `BB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create banner order
    const { data: order, error: orderError } = await supabase
      .from('banner_orders')
      .insert({
        advertiser_id: advertiserAccount.id,
        image_url: imageUrl,
        link_url: linkUrl,
        title,
        duration_hours: durationHours,
        price_usd: priceUsd,
        price_sol: priceSol,
        sol_price_at_order: solPrice,
        start_time: startTime,
        end_time: endTime,
        activation_key: activationKey,
        payment_status: 'pending',
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      throw orderError;
    }

    console.log('Created banner order:', order.id);

    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
        paymentWallet: advertiserAccount.payment_wallet_pubkey,
        priceSol,
        solPrice,
        activationKey,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error processing banner order:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});