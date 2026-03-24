import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

Deno.serve(withRunLog('manual-kyc-override', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify caller is super_admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Not authenticated');
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Invalid auth token');

    const { data: roleCheck } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();
    
    if (!roleCheck) throw new Error('Not authorized — super_admin required');

    const body = await req.json();
    const { action } = body;

    // === ACTION: lookup — check if wallet is a known CEX ===
    if (action === 'lookup') {
      const { walletAddress } = body;
      if (!walletAddress || !BASE58_REGEX.test(walletAddress)) {
        return new Response(JSON.stringify({ error: 'Invalid Solana wallet address' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const { data: cexMatch } = await supabase
        .from('known_cex_wallets')
        .select('cex_name, cex_label, is_verified')
        .eq('wallet_address', walletAddress)
        .maybeSingle();

      return new Response(JSON.stringify({
        walletAddress,
        isKnownCex: !!cexMatch,
        cexName: cexMatch?.cex_name || null,
        cexLabel: cexMatch?.cex_label || null,
        isVerified: cexMatch?.is_verified || false,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === ACTION: add-kyc — manually set KYC root for a target wallet ===
    if (action === 'add-kyc') {
      const { targetWallet, kycWallet, cexName, cexLabel } = body;

      if (!targetWallet || !BASE58_REGEX.test(targetWallet)) {
        return new Response(JSON.stringify({ error: 'Invalid target wallet address' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }
      if (!kycWallet || !BASE58_REGEX.test(kycWallet)) {
        return new Response(JSON.stringify({ error: 'Invalid KYC wallet address' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }
      if (!cexName || typeof cexName !== 'string' || cexName.length > 50) {
        return new Response(JSON.stringify({ error: 'CEX name required (max 50 chars)' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const meshLinks = [];
      const now = new Date().toISOString();

      // 1. Add CEX wallet to known_cex_wallets if not already there
      await supabase
        .from('known_cex_wallets')
        .upsert({
          wallet_address: kycWallet,
          cex_name: cexName,
          cex_label: cexLabel || `${cexName} (manual)`,
          added_by: 'manual_admin',
        }, { onConflict: 'wallet_address', ignoreDuplicates: true });

      // 2. Write mesh: target wallet funded_by CEX wallet
      meshLinks.push({
        source_type: 'wallet',
        source_id: kycWallet,
        linked_type: 'wallet',
        linked_id: targetWallet,
        relationship: 'funded_by',
        confidence: 100,
        discovered_via: 'manual_admin_kyc',
        discovered_at: now,
        evidence: { cexName, addedBy: user.id, manual: true },
      });

      // 3. Mark KYC root
      meshLinks.push({
        source_type: 'wallet',
        source_id: targetWallet,
        linked_type: 'kyc_root',
        linked_id: targetWallet,
        relationship: 'is_kyc_root',
        confidence: 100,
        discovered_via: 'manual_admin_kyc',
        discovered_at: now,
        evidence: { cexName, cexWallet: kycWallet, manual: true },
      });

      // 4. same_kyc_root link
      meshLinks.push({
        source_type: 'kyc_root',
        source_id: targetWallet,
        linked_type: 'wallet',
        linked_id: targetWallet,
        relationship: 'same_kyc_root',
        confidence: 100,
        discovered_via: 'manual_admin_kyc',
        discovered_at: now,
      });

      const { error: meshErr } = await supabase
        .from('reputation_mesh')
        .upsert(meshLinks, {
          onConflict: 'source_type,source_id,linked_type,linked_id,relationship',
          ignoreDuplicates: false, // Overwrite with manual data
        });

      if (meshErr) {
        console.error('[ManualKYC] Mesh write error:', meshErr);
        return new Response(JSON.stringify({ error: `Mesh write failed: ${meshErr.message}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      console.log(`[ManualKYC] ✅ Admin ${user.id} set KYC root for ${targetWallet.slice(0, 8)} → ${cexName} (${kycWallet.slice(0, 8)})`);

      return new Response(JSON.stringify({
        success: true,
        targetWallet,
        kycWallet,
        cexName,
        meshLinksWritten: meshLinks.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === ACTION: add-cex-wallet — add a new known CEX wallet to the lookup table ===
    if (action === 'add-cex-wallet') {
      const { walletAddress, cexName: name, cexLabel: label } = body;

      if (!walletAddress || !BASE58_REGEX.test(walletAddress)) {
        return new Response(JSON.stringify({ error: 'Invalid wallet address' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }
      if (!name || typeof name !== 'string' || name.length > 50) {
        return new Response(JSON.stringify({ error: 'CEX name required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const { error } = await supabase
        .from('known_cex_wallets')
        .upsert({
          wallet_address: walletAddress,
          cex_name: name,
          cex_label: label || `${name} (manual)`,
          added_by: 'manual_admin',
        }, { onConflict: 'wallet_address' });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      return new Response(JSON.stringify({ success: true, walletAddress, cexName: name }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use: lookup, add-kyc, add-cex-wallet' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });

  } catch (err: any) {
    console.error('[ManualKYC] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: err.message.includes('Not authorized') ? 403 : 500,
    });
  }
}));

