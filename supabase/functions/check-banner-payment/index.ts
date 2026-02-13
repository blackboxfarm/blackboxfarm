import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from 'npm:@solana/web3.js@1.87.6';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('check-banner-payment');

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

    const { orderId } = await req.json();

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'Order ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('banner_orders')
      .select(`
        *,
        advertiser:advertiser_accounts(payment_wallet_pubkey, email)
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Already paid - but check if banner_ads entry exists
    if (order.payment_status === 'paid') {
      // If banner_ad_id is missing, create it now (retroactive fix)
      if (!order.banner_ad_id) {
        console.log('Fixing missing banner_ads entry for paid order:', orderId);
        
        const startDate = new Date(order.start_time);
        const endDate = order.end_time ? new Date(order.end_time) : new Date(startDate.getTime() + order.duration_hours * 60 * 60 * 1000);
        
        const { data: bannerAd, error: bannerError } = await supabase
          .from('banner_ads')
          .insert({
            title: order.title || 'Banner Ad',
            image_url: order.image_url,
            link_url: order.link_url,
            position: 1,
            is_active: true,
            start_date: order.start_time,
            end_date: endDate.toISOString(),
            weight: 10,
            notes: `Auto-created from order ${orderId}`,
          })
          .select('id')
          .single();

        if (!bannerError && bannerAd) {
          await supabase
            .from('banner_orders')
            .update({ banner_ad_id: bannerAd.id })
            .eq('id', orderId);
          
          console.log('Created missing banner_ads entry:', bannerAd.id);
          
          return new Response(
            JSON.stringify({ status: 'paid', message: 'Payment confirmed and banner activated', bannerId: bannerAd.id }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      return new Response(
        JSON.stringify({ status: 'paid', message: 'Payment already confirmed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const walletPubkey = order.advertiser?.payment_wallet_pubkey;
    if (!walletPubkey) {
      return new Response(
        JSON.stringify({ error: 'Payment wallet not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check wallet balance on Solana
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    const rpcUrl = heliusApiKey 
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
      : 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl);
    
    const pubkey = new PublicKey(walletPubkey);
    const balance = await connection.getBalance(pubkey);
    const balanceSol = balance / LAMPORTS_PER_SOL;

    console.log(`Checking payment for order ${orderId}:`, {
      wallet: walletPubkey,
      balance: balanceSol,
      required: order.price_sol,
    });

    // Allow 1% tolerance for rounding
    const requiredAmount = order.price_sol * 0.99;

    // Try to detect who sent the payment for refund purposes
    let senderWallet: string | null = null;
    if (balanceSol >= requiredAmount) {
      try {
        // Get recent signatures to find the sender
        const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 5 });
        if (signatures.length > 0) {
          const tx = await connection.getParsedTransaction(signatures[0].signature, { maxSupportedTransactionVersion: 0 });
          if (tx?.transaction?.message?.accountKeys) {
            // The first account that's not our wallet is likely the sender
            for (const key of tx.transaction.message.accountKeys) {
              const addr = typeof key === 'string' ? key : key.pubkey.toBase58();
              if (addr !== walletPubkey) {
                senderWallet = addr;
                console.log('Detected payment sender:', senderWallet);
                break;
              }
            }
          }
        }
      } catch (e) {
        console.error('Error detecting sender wallet:', e);
      }
    }

    if (balanceSol >= requiredAmount) {
      // Payment confirmed!
      
      // First, create a banner_ads entry so it shows on the live page
      const startDate = new Date(order.start_time);
      const endDate = new Date(startDate.getTime() + order.duration_hours * 60 * 60 * 1000);
      const isCurrentlyActive = new Date() >= startDate && new Date() <= endDate;
      
      const { data: bannerAd, error: bannerError } = await supabase
        .from('banner_ads')
        .insert({
          title: order.title || 'Banner Ad',
          image_url: order.image_url,
          link_url: order.link_url,
          position: 1, // Default to position 1 (premium)
          is_active: true, // Will be filtered by date range
          start_date: order.start_time,
          end_date: endDate.toISOString(),
          weight: 10, // Higher weight for paid ads
          notes: `Auto-created from order ${orderId}`,
        })
        .select('id')
        .single();

      if (bannerError) {
        console.error('Error creating banner_ads entry:', bannerError);
        // Continue anyway - we still want to mark payment as confirmed
      }

      // Update the order with payment status, sender wallet, and link to banner_ads
      const { error: updateError } = await supabase
        .from('banner_orders')
        .update({
          payment_status: 'paid',
          payment_confirmed_at: new Date().toISOString(),
          banner_ad_id: bannerAd?.id || null,
          end_time: endDate.toISOString(),
          is_active: isCurrentlyActive,
          payment_sender_wallet: senderWallet, // Store for refunds
        })
        .eq('id', orderId);

      if (updateError) {
        console.error('Error updating order status:', updateError);
        throw updateError;
      }
      
      console.log(`Created banner_ads entry ${bannerAd?.id} for order ${orderId}`);

      // Update advertiser total spent
      await supabase
        .from('advertiser_accounts')
        .update({
          total_spent_sol: supabase.rpc('increment_total_spent', {
            account_id: order.advertiser_id,
            amount: balanceSol,
          }),
        })
        .eq('id', order.advertiser_id);

      // Send confirmation email via Resend if configured
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey && order.advertiser?.email) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'BlackBox <noreply@blackbox.farm>',
              to: [order.advertiser.email],
              subject: 'Banner Payment Confirmed - BlackBox',
              html: `
                <h1>Payment Confirmed!</h1>
                <p>Your banner ad payment has been confirmed.</p>
                <p><strong>Order ID:</strong> ${orderId}</p>
                <p><strong>Amount:</strong> ${balanceSol.toFixed(4)} SOL</p>
                <p><strong>Activation Key:</strong> ${order.activation_key}</p>
                <p><strong>Start Time:</strong> ${new Date(order.start_time).toLocaleString()}</p>
                <p><strong>Duration:</strong> ${order.duration_hours} hours</p>
                <p>Your banner will automatically go live at the scheduled start time.</p>
                <p>Thank you for advertising with BlackBox!</p>
              `,
            }),
          });
          console.log('Confirmation email sent to:', order.advertiser.email);
        } catch (emailError) {
          console.error('Error sending confirmation email:', emailError);
        }
      }

      console.log(`Payment confirmed for order ${orderId}: ${balanceSol} SOL`);

      return new Response(
        JSON.stringify({
          status: 'paid',
          received: balanceSol,
          required: order.price_sol,
          activationKey: order.activation_key,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Partial payment or no payment yet
    return new Response(
      JSON.stringify({
        status: balanceSol > 0 ? 'partial' : 'pending',
        received: balanceSol,
        required: order.price_sol,
        remaining: order.price_sol - balanceSol,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error checking payment:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});