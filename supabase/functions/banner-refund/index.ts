import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from 'npm:@solana/web3.js@1.87.6';
import bs58 from 'https://esm.sh/bs58@5.0.0';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('banner-refund');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLAWBACK_FEE_USD = 10; // $10 clawback fee

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY')!;
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY')!;

    // Validate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid user' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { orderId } = await req.json();

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'Missing orderId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get order with advertiser account
    const { data: order, error: orderError } = await supabase
      .from('banner_orders')
      .select(`
        *,
        advertiser_accounts!inner(
          id,
          user_id,
          payment_wallet_pubkey,
          payment_wallet_secret_encrypted
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check order belongs to user
    if (order.advertiser_accounts.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - not your order' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if order is eligible for refund (before start time)
    const startTime = new Date(order.start_time);
    const now = new Date();
    
    if (now >= startTime) {
      return new Response(
        JSON.stringify({ error: 'Refund not available - campaign has already started' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already refunded
    if (order.payment_status === 'refunded') {
      return new Response(
        JSON.stringify({ error: 'Order already refunded' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if paid
    if (order.payment_status !== 'paid') {
      return new Response(
        JSON.stringify({ error: 'Order not paid - nothing to refund' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the refund wallet - use the stored sender wallet
    const refundWallet = order.payment_sender_wallet;
    if (!refundWallet) {
      return new Response(
        JSON.stringify({ error: 'Original payment sender wallet not recorded - cannot auto-refund' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const advertiser = order.advertiser_accounts;

    // Decrypt wallet secret
    const encryptedData = Uint8Array.from(atob(advertiser.payment_wallet_secret_encrypted), c => c.charCodeAt(0));
    const iv = encryptedData.slice(0, 12);
    const ciphertext = encryptedData.slice(12);

    const encoder = new TextEncoder();
    const keyData = encoder.encode(encryptionKey.slice(0, 32).padEnd(32, '0'));
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext
    );

    const secretKey = new TextDecoder().decode(decryptedData);
    const keypair = Keypair.fromSecretKey(bs58.decode(secretKey));

    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, 'confirmed');

    // Get balance
    const balance = await connection.getBalance(keypair.publicKey);
    
    // Calculate clawback in SOL
    const solPrice = order.sol_price_at_order || 150; // Use order's rate or fallback
    const clawbackSol = CLAWBACK_FEE_USD / solPrice;
    const clawbackLamports = Math.floor(clawbackSol * LAMPORTS_PER_SOL);
    const txFee = 5000;
    
    const refundAmount = balance - clawbackLamports - txFee;

    if (refundAmount <= 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Insufficient balance for refund after $10 clawback fee',
          balance: balance / LAMPORTS_PER_SOL,
          clawback: clawbackSol,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing refund for order ${orderId}:`);
    console.log(`  Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Clawback: ${clawbackSol} SOL ($${CLAWBACK_FEE_USD})`);
    console.log(`  Refund: ${refundAmount / LAMPORTS_PER_SOL} SOL`);
    console.log(`  To: ${refundWallet}`);

    // Create refund transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(refundWallet),
        lamports: refundAmount,
      })
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    transaction.sign(keypair);
    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });

    console.log(`Refund sent: ${signature}`);

    // Update order status
    await supabase
      .from('banner_orders')
      .update({
        payment_status: 'refunded',
        refunded_at: new Date().toISOString(),
        refund_tx_signature: signature,
        refund_amount_sol: refundAmount / LAMPORTS_PER_SOL,
        clawback_amount_sol: clawbackSol,
        refund_wallet: refundWallet,
      })
      .eq('id', orderId);

    // Deactivate the banner ad if it was created
    if (order.banner_ad_id) {
      await supabase
        .from('banner_ads')
        .update({ is_active: false })
        .eq('id', order.banner_ad_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Refund processed successfully',
        refundAmount: refundAmount / LAMPORTS_PER_SOL,
        clawbackFee: clawbackSol,
        clawbackFeeUsd: CLAWBACK_FEE_USD,
        txSignature: signature,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error processing refund:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
