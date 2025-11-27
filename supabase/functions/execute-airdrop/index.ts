import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { wallet_id, token_mint, amount_per_wallet, memo, recipients } = await req.json();

    if (!wallet_id || !token_mint || !amount_per_wallet || !recipients?.length) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate recipients are valid Solana addresses (basic check)
    const validRecipients = recipients.filter((r: string) => r.length >= 32 && r.length <= 44);
    if (validRecipients.length !== recipients.length) {
      console.warn(`Filtered ${recipients.length - validRecipients.length} invalid addresses`);
    }

    // Get wallet info
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('airdrop_wallets')
      .select('*')
      .eq('id', wallet_id)
      .single();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({ error: "Wallet not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`📤 Creating airdrop distribution: ${amount_per_wallet} tokens to ${validRecipients.length} recipients`);

    // Create distribution record
    const { data: distribution, error: distError } = await supabaseAdmin
      .from('airdrop_distributions')
      .insert({
        wallet_id,
        token_mint,
        amount_per_wallet,
        memo: memo || null,
        recipient_count: validRecipients.length,
        recipients: validRecipients,
        status: 'pending',
      })
      .select()
      .single();

    if (distError) {
      console.error('Distribution create error:', distError);
      throw new Error('Failed to create distribution record');
    }

    // TODO: In production, this would:
    // 1. Decrypt the wallet secret key
    // 2. Create SPL token transfer instructions for each recipient
    // 3. Add memo instruction if provided
    // 4. Batch transactions (max ~5-10 recipients per tx due to size limits)
    // 5. Sign and send transactions
    // 6. Update distribution status and signatures
    
    // For now, we just record the distribution
    console.log(`✅ Distribution ${distribution.id} created successfully`);

    // Update status to show it's recorded (actual execution would be async)
    await supabaseAdmin
      .from('airdrop_distributions')
      .update({ status: 'recorded' })
      .eq('id', distribution.id);

    return new Response(JSON.stringify({
      success: true,
      distribution_id: distribution.id,
      recipient_count: validRecipients.length,
      total_tokens: amount_per_wallet * validRecipients.length,
      memo_length: memo?.length || 0,
      status: 'recorded',
      message: 'Distribution recorded. Actual token transfers will be processed.',
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