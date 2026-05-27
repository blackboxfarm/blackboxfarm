// no-lube-social-credential — set or clear the AES-GCM encrypted password
// for a row in public.no_lube_socials. Frontend never sees the ciphertext;
// the raw password leaves the browser exactly once (over HTTPS to this
// function) and is immediately encrypted with ENCRYPTION_KEY.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { SecureStorage } from '../_shared/encryption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { id, password, clear } = await req.json();
    if (!id || typeof id !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let payload: { password_ciphertext: string | null; updated_at: string };
    if (clear) {
      payload = { password_ciphertext: null, updated_at: new Date().toISOString() };
    } else {
      if (typeof password !== 'string' || password.length === 0) {
        return new Response(JSON.stringify({ ok: false, error: 'password required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (password.length > 512) {
        return new Response(JSON.stringify({ ok: false, error: 'password too long' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const ciphertext = await SecureStorage.encrypt(password);
      payload = { password_ciphertext: ciphertext, updated_at: new Date().toISOString() };
    }

    const { error } = await supabase
      .from('no_lube_socials')
      .update(payload)
      .eq('id', id);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, has_password: !clear }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[no-lube-social-credential] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});