import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Keypair } from "npm:@solana/web3.js@1.87.6";
import bs58 from "https://esm.sh/bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is super admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isSuperAdmin } = await supabaseAdmin.rpc('is_super_admin', { _user_id: user.id });
    
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Super admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { nickname } = await req.json();

    // Generate new keypair
    const keypair = Keypair.generate();
    const pubkey = keypair.publicKey.toBase58();
    const secretKey = bs58.encode(keypair.secretKey);

    console.log(`✅ Generated new airdrop wallet: ${pubkey}`);

    // Encrypt and store
    const { data: encryptedData, error: encryptError } = await supabaseAdmin.functions.invoke('encrypt-data', {
      body: { data: secretKey }
    });

    if (encryptError) {
      console.error('Encryption error:', encryptError);
      throw new Error('Failed to encrypt wallet secret');
    }

    const encryptedSecret = encryptedData?.encrypted || secretKey;

    // Store in database
    const { data: wallet, error: insertError } = await supabaseAdmin
      .from('airdrop_wallets')
      .insert({
        user_id: user.id,
        nickname: nickname || null,
        pubkey,
        secret_key_encrypted: encryptedSecret,
        sol_balance: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      throw new Error('Failed to store wallet');
    }

    return new Response(JSON.stringify({
      success: true,
      id: wallet.id,
      pubkey,
      nickname: wallet.nickname,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});