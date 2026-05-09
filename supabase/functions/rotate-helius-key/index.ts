import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";

import { enableHeliusTracking } from "../_shared/helius-fetch-interceptor.ts";
enableHeliusTracking("rotate-helius-key");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * ROTATE HELIUS KEY — Validates a new Helius API key and updates the secret.
 * 
 * Flow:
 * 1. Receives new API key from admin UI
 * 2. Validates it with a lightweight Helius health check
 * 3. Updates HELIUS_API_KEY secret via Supabase Management API
 * 4. Updates api_service_config rotation dates
 */
serve(withRunLog('rotate-helius-key', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check — super admin only
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check super admin role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['super_admin', 'admin']);

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { newApiKey, rotationIntervalDays = 7 } = await req.json();

    if (!newApiKey || typeof newApiKey !== 'string' || newApiKey.length < 10) {
      return new Response(JSON.stringify({ error: 'Invalid API key format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 1: Validate the new key with a lightweight Helius call
    console.log('[rotate-helius-key] Validating new API key...');
    const testUrl = `https://mainnet.helius-rpc.com/?api-key=${newApiKey}`;
    const testResponse = await fetch(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'key-validation',
        method: 'getHealth',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!testResponse.ok) {
      const errText = await testResponse.text().catch(() => '');
      console.error(`[rotate-helius-key] Key validation failed: ${testResponse.status} ${errText}`);
      return new Response(JSON.stringify({ 
        error: 'Key validation failed',
        details: `Helius returned ${testResponse.status}. The key may be invalid or expired.`
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const testData = await testResponse.json();
    if (testData.error) {
      return new Response(JSON.stringify({ 
        error: 'Key validation failed', 
        details: testData.error.message || 'RPC returned an error'
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[rotate-helius-key] ✅ New key validated successfully');

    // Step 2: Store the old key reference for rollback logging
    const oldKeyPrefix = (Deno.env.get('HELIUS_API_KEY') || '').slice(0, 8);
    const newKeyPrefix = newApiKey.slice(0, 8);

    // Step 3: Update the secret via Supabase Management API
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1];
    const managementToken = Deno.env.get('SB_ACCESS_TOKEN');

    if (managementToken && projectRef) {
      // Use Management API to update the secret
      const mgmtResponse = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/secrets`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${managementToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([{
            name: 'HELIUS_API_KEY',
            value: newApiKey,
          }]),
        }
      );

      if (!mgmtResponse.ok) {
        const mgmtErr = await mgmtResponse.text().catch(() => '');
        console.error(`[rotate-helius-key] Management API error: ${mgmtResponse.status} ${mgmtErr}`);
        return new Response(JSON.stringify({ 
          error: 'Failed to update secret',
          details: 'Management API returned an error. The key was validated but could not be stored. Please update HELIUS_API_KEY manually in Supabase Edge Function Secrets.',
          keyValidated: true,
          manualUpdate: true,
        }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`[rotate-helius-key] ✅ Secret updated: ${oldKeyPrefix}... → ${newKeyPrefix}...`);
    } else {
      // No management token — return manual instructions
      console.log('[rotate-helius-key] No SUPABASE_ACCESS_TOKEN — manual update required');
      
      // Still update the config dates since key was validated
      const nextRotation = new Date();
      nextRotation.setDate(nextRotation.getDate() + rotationIntervalDays);

      await supabase
        .from('api_service_config')
        .update({
          api_key_last_rotated: new Date().toISOString(),
          api_key_rotation_date: nextRotation.toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .eq('service_name', 'helius');

      return new Response(JSON.stringify({
        success: true,
        keyValidated: true,
        manualUpdate: true,
        message: `Key validated ✅ but auto-update not available. Please update HELIUS_API_KEY in Supabase Edge Function Secrets manually. Rotation timer has been reset to ${rotationIntervalDays} days.`,
        nextRotation: nextRotation.toISOString().split('T')[0],
        secretsUrl: `https://supabase.com/dashboard/project/${projectRef}/settings/functions`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 4: Update rotation config
    const nextRotation = new Date();
    nextRotation.setDate(nextRotation.getDate() + rotationIntervalDays);

    await supabase
      .from('api_service_config')
      .update({
        api_key_last_rotated: new Date().toISOString(),
        api_key_rotation_date: nextRotation.toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq('service_name', 'helius');

    // Step 5: Log the rotation event
    await supabase.from('admin_notifications').insert({
      notification_type: 'api_key_rotated',
      title: 'Helius API Key Rotated',
      message: `API key rotated successfully. Old prefix: ${oldKeyPrefix}..., New prefix: ${newKeyPrefix}... Next rotation: ${nextRotation.toISOString().split('T')[0]}`,
      metadata: {
        service: 'helius',
        old_key_prefix: oldKeyPrefix,
        new_key_prefix: newKeyPrefix,
        next_rotation: nextRotation.toISOString().split('T')[0],
        rotated_by: user.id,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      keyValidated: true,
      manualUpdate: false,
      message: 'Helius API key rotated successfully',
      nextRotation: nextRotation.toISOString().split('T')[0],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('[rotate-helius-key] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}));

