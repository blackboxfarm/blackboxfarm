import { withRunLog } from '../_shared/run-logger.ts';
import { sendAdminSms } from '../_shared/sms-notify.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Keypair } from 'npm:@solana/web3.js@1.87.6';
import bs58 from 'https://esm.sh/bs58@5.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(withRunLog('tg-subscription-payment', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, telegram_user_id, user_id, subscription_id } = await req.json();

    if (action === 'create') {
      // Check for existing pending subscription
      const { data: existing } = await supabase
        .from('tg_sol_subscriptions')
        .select('id, payment_wallet_pubkey, amount_sol, created_at')
        .eq('telegram_user_id', telegram_user_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // If pending sub exists and is less than 1 hour old, return it
      if (existing) {
        const age = Date.now() - new Date(existing.created_at).getTime();
        if (age < 3600_000) {
          return new Response(JSON.stringify({
            success: true,
            subscription_id: existing.id,
            payment_wallet: existing.payment_wallet_pubkey,
            amount_sol: existing.amount_sol,
            existing: true,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Expire old pending ones
        await supabase
          .from('tg_sol_subscriptions')
          .update({ status: 'expired' })
          .eq('id', existing.id);
      }

      // Generate payment wallet
      const keypair = Keypair.generate();
      const pubkey = keypair.publicKey.toBase58();
      const secretKey = bs58.encode(keypair.secretKey);

      // Encrypt secret key
      const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
      if (!encryptionKey) throw new Error('Encryption key not configured');

      const encoder = new TextEncoder();
      const keyData = encoder.encode(encryptionKey.slice(0, 32).padEnd(32, '0'));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt']);
      const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoder.encode(secretKey));
      const combined = new Uint8Array(iv.length + encryptedData.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encryptedData), iv.length);
      const encryptedSecret = btoa(String.fromCharCode(...combined));

      // Get SOL price for record-keeping
      let solPrice: number | null = null;
      try {
        const apiKey = Deno.env.get('COINGECKO_API_KEY');
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (apiKey) headers['x-cg-demo-api-key'] = apiKey;
        const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { headers });
        const priceData = await priceRes.json();
        solPrice = priceData?.solana?.usd || null;
      } catch { /* non-critical */ }

      // Determine amount: 1 SOL default, but if SOL > $100 use 0.9
      let amountSol = 1.0;
      if (solPrice && solPrice > 100) {
        amountSol = 0.9;
      }

      const { data: sub, error: insertErr } = await supabase
        .from('tg_sol_subscriptions')
        .insert({
          user_id: user_id || null,
          telegram_user_id,
          payment_wallet_pubkey: pubkey,
          payment_wallet_secret_encrypted: encryptedSecret,
          amount_sol: amountSol,
          sol_price_at_order: solPrice,
          status: 'pending',
          tier_granted: 'pro',
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      console.log(`[TG-Sub] Created subscription ${sub.id} for TG user ${telegram_user_id}, wallet: ${pubkey}, amount: ${amountSol} SOL`);

      return new Response(JSON.stringify({
        success: true,
        subscription_id: sub.id,
        payment_wallet: pubkey,
        amount_sol: amountSol,
        sol_price: solPrice,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (action === 'check') {
      if (!subscription_id) throw new Error('subscription_id required');

      const { data: sub, error: subErr } = await supabase
        .from('tg_sol_subscriptions')
        .select('*')
        .eq('id', subscription_id)
        .single();

      if (subErr || !sub) throw new Error('Subscription not found');

      if (sub.status === 'paid') {
        return new Response(JSON.stringify({
          status: 'paid',
          expires_at: sub.expires_at,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (sub.status === 'expired') {
        return new Response(JSON.stringify({ status: 'expired' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check on-chain balance
      const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import('npm:@solana/web3.js@1.87.6');
      const { getHeliusRpcUrl, getHeliusApiKey } = await import('../_shared/helius-client.ts');

      const rpcUrl = getHeliusApiKey() ? getHeliusRpcUrl() : 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl);
      const pubkey = new PublicKey(sub.payment_wallet_pubkey);
      const balance = await connection.getBalance(pubkey);
      const balanceSol = balance / LAMPORTS_PER_SOL;

      const requiredAmount = sub.amount_sol * 0.99; // 1% tolerance

      console.log(`[TG-Sub] Checking ${sub.id}: balance=${balanceSol} SOL, required=${sub.amount_sol} SOL`);

      if (balanceSol >= requiredAmount) {
        // Payment confirmed! Activate subscription
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year

        await supabase
          .from('tg_sol_subscriptions')
          .update({
            status: 'paid',
            paid_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
          })
          .eq('id', subscription_id);

        // Upgrade user's tier to 'pro' if they have a linked account
        if (sub.user_id) {
          await supabase
            .from('profiles')
            .update({ cached_tier_key: 'pro' })
            .eq('id', sub.user_id);
        }

        // Insert admin notification for the SOL purchase
        try {
          await supabase.from('admin_notifications').insert({
            notification_type: 'sol_subscription',
            title: '💰 New SOL Subscription Payment',
            message: `TG user ${sub.telegram_user_id} paid ${balanceSol.toFixed(4)} SOL for yearly Pro. Wallet: ${sub.payment_wallet_pubkey}. Expires: ${expiresAt.toLocaleDateString('en-US')}`,
            metadata: {
              subscription_id,
              telegram_user_id: sub.telegram_user_id,
              user_id: sub.user_id,
              amount_sol: balanceSol,
              wallet: sub.payment_wallet_pubkey,
              expires_at: expiresAt.toISOString(),
              payment_method: 'sol',
            },
          });
        } catch (notifErr) {
          console.warn('[TG-Sub] Admin notification insert error:', notifErr);
        }

        console.log(`[TG-Sub] Payment confirmed for ${subscription_id}! Expires: ${expiresAt.toISOString()}`);

        // SMS notification for SOL subscription
        sendAdminSms(
          `💰 NEW SOL SUBSCRIPTION!\n\n📱 TG User: ${sub.telegram_user_id}\n💎 Paid: ${balanceSol.toFixed(4)} SOL\n🏷️ Tier: Pro (Yearly)\n📅 Expires: ${expiresAt.toLocaleDateString('en-US')}\n👛 Wallet: ${sub.payment_wallet_pubkey.slice(0, 8)}...${sub.payment_wallet_pubkey.slice(-4)}\n🔗 Linked account: ${sub.user_id ? 'Yes' : 'No'}\n⏰ ${new Date().toISOString()}`
        );

        return new Response(JSON.stringify({
          status: 'paid',
          received: balanceSol,
          expires_at: expiresAt.toISOString(),
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        status: balanceSol > 0 ? 'partial' : 'pending',
        received: balanceSol,
        required: sub.amount_sol,
        remaining: sub.amount_sol - balanceSol,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else {
      throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: any) {
    console.error('[TG-Sub] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
