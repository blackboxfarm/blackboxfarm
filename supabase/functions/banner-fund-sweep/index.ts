import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from 'npm:@solana/web3.js@1.87.6';
import bs58 from 'https://esm.sh/bs58@5.0.0';

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
    
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY')!;
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY')!;
    
    // Get the main treasury wallet (you can add this as a secret or config)
    const TREASURY_WALLET = 'CWAyVjjSxPDR2Rqq9LGYNjpvhSq8rLVQ1WnPEkcNMQ7L'; // Replace with actual treasury

    // Find all paid banner orders where start_time has passed and funds haven't been swept
    const now = new Date().toISOString();
    
    const { data: orders, error: ordersError } = await supabase
      .from('banner_orders')
      .select(`
        *,
        advertiser_accounts!inner(
          id,
          payment_wallet_pubkey,
          payment_wallet_secret_encrypted
        )
      `)
      .eq('payment_status', 'paid')
      .lte('start_time', now)
      .is('funds_swept_at', null);

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
      throw ordersError;
    }

    console.log(`Found ${orders?.length || 0} orders to sweep funds from`);

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No orders to sweep', swept: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, 'confirmed');
    const sweptOrders: string[] = [];
    const errors: { orderId: string; error: string }[] = [];

    for (const order of orders) {
      try {
        const advertiser = order.advertiser_accounts;
        if (!advertiser?.payment_wallet_secret_encrypted) {
          console.log(`No encrypted secret for order ${order.id}, skipping`);
          continue;
        }

        // Decrypt the wallet secret
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

        // Get balance
        const balance = await connection.getBalance(keypair.publicKey);
        const minRent = 890880; // Minimum for rent exemption
        const txFee = 5000; // Typical transaction fee
        const sweepAmount = balance - txFee;

        if (sweepAmount <= 0) {
          console.log(`Order ${order.id}: No funds to sweep (balance: ${balance / LAMPORTS_PER_SOL} SOL)`);
          continue;
        }

        console.log(`Order ${order.id}: Sweeping ${sweepAmount / LAMPORTS_PER_SOL} SOL to treasury`);

        // Create transfer transaction
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: new PublicKey(TREASURY_WALLET),
            lamports: sweepAmount,
          })
        );

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = keypair.publicKey;

        transaction.sign(keypair);
        const signature = await connection.sendRawTransaction(transaction.serialize());
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });

        console.log(`Order ${order.id}: Swept successfully, tx: ${signature}`);

        // Update order to mark funds as swept
        await supabase
          .from('banner_orders')
          .update({ 
            funds_swept_at: new Date().toISOString(),
            sweep_tx_signature: signature,
            swept_amount_sol: sweepAmount / LAMPORTS_PER_SOL
          })
          .eq('id', order.id);

        sweptOrders.push(order.id);
      } catch (error: any) {
        console.error(`Error sweeping order ${order.id}:`, error);
        errors.push({ orderId: order.id, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Swept funds from ${sweptOrders.length} orders`,
        swept: sweptOrders.length,
        sweptOrders,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in fund sweep:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
