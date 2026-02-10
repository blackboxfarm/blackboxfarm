import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { SecureStorage } from '../_shared/encryption.ts';
import { decryptWalletSecretAuto } from '../_shared/decrypt-wallet-secret.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - super admin only
    // Auth: require super admin for commit, allow dry-run for testing
    const authHeader = req.headers.get('Authorization');
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'dry-run';
    
    if (action === 'commit') {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Auth required for commit' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Super admin required' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }




    // Fetch all wallet_pools rows
    const { data: wallets, error: fetchErr } = await supabase
      .from('wallet_pools')
      .select('id, pubkey, secret_key, secret_key_encrypted, is_active')
      .order('created_at', { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!wallets || wallets.length === 0) {
      return new Response(JSON.stringify({ message: 'No wallets found', results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const results: any[] = [];

    for (const w of wallets) {
      const result: any = {
        id: w.id,
        pubkey: w.pubkey,
        has_plaintext: !!w.secret_key,
        has_encrypted: !!w.secret_key_encrypted,
        plaintext_length: w.secret_key?.length || 0,
        is_active: w.is_active,
      };

      try {
        const plaintext = w.secret_key;
        if (!plaintext) {
          result.status = 'SKIP_NO_PLAINTEXT';
          results.push(result);
          continue;
        }

        if (w.secret_key_encrypted) {
          // Already encrypted - verify round-trip
          const decrypted = await decryptWalletSecretAuto(w.secret_key_encrypted);
          result.already_encrypted = true;
          result.round_trip_match = decrypted === plaintext;
          result.status = result.round_trip_match ? 'ALREADY_OK' : 'MISMATCH';
          results.push(result);
          continue;
        }

        // Step 1: Encrypt the plaintext key with AES: prefix
        const encrypted = 'AES:' + await SecureStorage.encryptWalletSecret(plaintext);
        result.encrypted_length = encrypted.length;

        // Step 2: Immediately decrypt and verify round-trip
        const decrypted = await decryptWalletSecretAuto(encrypted);
        result.round_trip_match = decrypted === plaintext;
        result.decrypted_preview = decrypted.slice(0, 8) + '...';
        result.plaintext_preview = plaintext.slice(0, 8) + '...';

        if (!result.round_trip_match) {
          result.status = 'ROUND_TRIP_FAILED';
          results.push(result);
          continue;
        }

        if (action === 'commit') {
          // Only write if round-trip verified
          const { error: updateErr } = await supabase
            .from('wallet_pools')
            .update({ secret_key_encrypted: encrypted })
            .eq('id', w.id);
          
          if (updateErr) {
            result.status = 'WRITE_ERROR';
            result.error = updateErr.message;
          } else {
            result.status = 'ENCRYPTED_OK';
          }
        } else {
          result.status = 'DRY_RUN_OK';
        }
      } catch (err) {
        result.status = 'ERROR';
        result.error = err instanceof Error ? err.message : String(err);
      }

      results.push(result);
    }

    const summary = {
      total: results.length,
      ok: results.filter(r => ['DRY_RUN_OK', 'ENCRYPTED_OK', 'ALREADY_OK'].includes(r.status)).length,
      failed: results.filter(r => ['ROUND_TRIP_FAILED', 'MISMATCH', 'ERROR', 'WRITE_ERROR'].includes(r.status)).length,
      skipped: results.filter(r => r.status === 'SKIP_NO_PLAINTEXT').length,
      action,
    };

    return new Response(JSON.stringify({ summary, results }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('encrypt-wallet-pool error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
