import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { Connection, PublicKey } from "npm:@solana/web3.js@1.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HELIUS_API_KEY = Deno.env.get("HELIUS_API_KEY") || "";
const RPC_URL = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user) throw new Error("User not authenticated");

    const { installation_id } = await req.json();
    if (!installation_id) throw new Error("installation_id is required");

    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify ownership
    const { data: install } = await supabaseService
      .from("channel_installations")
      .select("id, user_id")
      .eq("id", installation_id)
      .single();

    if (!install || install.user_id !== user.id) throw new Error("Not authorized");

    // Get wallet
    const { data: wallet } = await supabaseService
      .from("channel_payment_wallets")
      .select("*")
      .eq("installation_id", installation_id)
      .single();

    if (!wallet) throw new Error("No payment wallet found. Generate one first.");

    // Check on-chain balance
    const connection = new Connection(RPC_URL, "confirmed");
    const pubkey = new PublicKey(wallet.pubkey);
    const balanceLamports = await connection.getBalance(pubkey);
    const balanceSol = balanceLamports / 1e9;

    const requiredSol = wallet.required_sol || 0.25;
    const isPaid = balanceSol >= requiredSol;

    // Update wallet balance
    await supabaseService
      .from("channel_payment_wallets")
      .update({
        current_balance: balanceSol,
        is_paid: isPaid,
        verified_at: isPaid ? new Date().toISOString() : wallet.verified_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", wallet.id);

    // If paid, activate the installation
    if (isPaid) {
      await supabaseService
        .from("channel_installations")
        .update({
          is_paid: true,
          is_active: true,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", installation_id);

      console.log(`Channel ${installation_id} activated! Balance: ${balanceSol} SOL`);
    }

    return new Response(
      JSON.stringify({
        is_paid: isPaid,
        balance: Math.round(balanceSol * 1e6) / 1e6,
        required: requiredSol,
        pubkey: wallet.pubkey,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error verifying channel payment:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
