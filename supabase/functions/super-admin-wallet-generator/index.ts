import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { SecureStorage } from "../_shared/encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      // Log unauthorized access attempt
      await supabaseClient.rpc('log_wallet_operation', {
        p_wallet_id: '00000000-0000-0000-0000-000000000000',
        p_wallet_type: 'super_admin',
        p_operation: 'unauthorized_access',
        p_user_id: null,
        p_success: false,
        p_error_message: 'Invalid or missing authentication token',
        p_security_flags: {
          ip_address: req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For'),
          user_agent: req.headers.get('User-Agent'),
          timestamp: new Date().toISOString()
        }
      });
      
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'GET') {
      // Log wallet access attempt
      await supabaseClient.rpc('log_wallet_operation', {
        p_wallet_id: '00000000-0000-0000-0000-000000000000',
        p_wallet_type: 'super_admin',
        p_operation: 'list_access',
        p_user_id: user.id,
        p_success: true,
        p_security_flags: {
          ip_address: req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For'),
          user_agent: req.headers.get('User-Agent'),
          timestamp: new Date().toISOString()
        }
      });

      // Load wallets (return only non-sensitive fields)
      const { data: wallets, error } = await supabaseClient
        .from('super_admin_wallets')
        .select('id,label,pubkey,wallet_type,is_active,created_at,updated_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Database error:', error);
        await supabaseClient.rpc('log_wallet_operation', {
          p_wallet_id: '00000000-0000-0000-0000-000000000000',
          p_wallet_type: 'super_admin',
          p_operation: 'list_access',
          p_user_id: user.id,
          p_success: false,
          p_error_message: error.message,
          p_security_flags: { database_error: true }
        });
        throw error;
      }

      const safeWallets = (wallets || []).map((w: any) => ({
        id: w.id,
        label: w.label,
        pubkey: w.pubkey,
        wallet_type: w.wallet_type,
        is_active: w.is_active,
        created_at: w.created_at,
        updated_at: w.updated_at,
      }));

      return new Response(JSON.stringify({ data: safeWallets }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      const { label, wallet_type, pubkey, secret_key_encrypted } = await req.json();

      if (!label || !wallet_type || !pubkey || !secret_key_encrypted) {
        await supabaseClient.rpc('log_wallet_operation', {
          p_wallet_id: '00000000-0000-0000-0000-000000000000',
          p_wallet_type: 'super_admin',
          p_operation: 'create_attempt',
          p_user_id: user.id,
          p_success: false,
          p_error_message: 'Missing required fields',
          p_security_flags: { validation_error: true }
        });
        
        return new Response(JSON.stringify({ 
          error: 'Missing required fields: label, wallet_type, pubkey, secret_key_encrypted' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Additional security: Encrypt the secret using our secure encryption
      let finalEncryptedSecret;
      try {
        finalEncryptedSecret = await SecureStorage.encryptWalletSecret(secret_key_encrypted);
      } catch (encryptError) {
        console.error('Encryption error:', encryptError);
        await supabaseClient.rpc('log_wallet_operation', {
          p_wallet_id: '00000000-0000-0000-0000-000000000000',
          p_wallet_type: 'super_admin',
          p_operation: 'create_attempt',
          p_user_id: user.id,
          p_success: false,
          p_error_message: 'Encryption failed',
          p_security_flags: { encryption_error: true }
        });
        
        return new Response(JSON.stringify({ error: 'Encryption failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Insert the super admin wallet using service role
      const { data, error } = await supabaseClient
        .from('super_admin_wallets')
        .insert({
          label,
          wallet_type,
          pubkey,
          secret_key_encrypted: finalEncryptedSecret,
          created_by: user.id,
          is_active: true
        })
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        await supabaseClient.rpc('log_wallet_operation', {
          p_wallet_id: '00000000-0000-0000-0000-000000000000',
          p_wallet_type: 'super_admin',
          p_operation: 'create_attempt',
          p_user_id: user.id,
          p_success: false,
          p_error_message: error.message,
          p_security_flags: { database_error: true }
        });
        throw error;
      }

      // Log successful creation
      await supabaseClient.rpc('log_wallet_operation', {
        p_wallet_id: data.id,
        p_wallet_type: 'super_admin',
        p_operation: 'create_success',
        p_user_id: user.id,
        p_success: true,
        p_security_flags: {
          wallet_type,
          label,
          pubkey,
          ip_address: req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For'),
          user_agent: req.headers.get('User-Agent'),
          timestamp: new Date().toISOString()
        }
      });

      console.log(`Super admin wallet created successfully: ${data.id} (${wallet_type})`);

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Function error:', error);
    
    // Log critical error
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      await supabaseClient.rpc('log_wallet_operation', {
        p_wallet_id: '00000000-0000-0000-0000-000000000000',
        p_wallet_type: 'super_admin',
        p_operation: 'system_error',
        p_user_id: null,
        p_success: false,
        p_error_message: (error instanceof Error ? error.message : String(error)) || 'Internal server error',
        p_security_flags: {
          critical_error: true,
          timestamp: new Date().toISOString(),
          stack_trace: error instanceof Error ? error.stack : String(error)
        }
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    return new Response(JSON.stringify({ 
      error: (error instanceof Error ? error.message : String(error)) || 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});