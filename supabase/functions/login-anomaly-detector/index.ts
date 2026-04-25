import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoginEvent {
  user_id: string;
  ip_address?: string;
  device_fingerprint?: string;
  device_name?: string;
  user_agent?: string;
  login_method?: string;
}

serve(withRunLog('login-anomaly-detector', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const event: LoginEvent = await req.json();
    const { user_id, ip_address, device_fingerprint, device_name, user_agent, login_method } = event;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if account is locked
    const { data: lockdown } = await supabase
      .from('account_lockdowns')
      .select('id')
      .eq('user_id', user_id)
      .eq('is_locked', true)
      .maybeSingle();

    if (lockdown) {
      return new Response(JSON.stringify({ 
        blocked: true, 
        reason: 'Account is locked. Check your SMS for unlock instructions.',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Geo-lookup the IP (free ipapi)
    let country = 'unknown';
    let city = 'unknown';
    if (ip_address && ip_address !== '127.0.0.1') {
      try {
        const geoRes = await fetch(`https://ipapi.co/${ip_address}/json/`, {
          signal: AbortSignal.timeout(3000)
        });
        if (geoRes.ok) {
          const geo = await geoRes.json();
          country = geo.country_name || 'unknown';
          city = geo.city || 'unknown';
        }
      } catch (e) {
        console.log('Geo lookup failed:', e);
      }
    }

    // Run anomaly detection checks
    const suspicionReasons: string[] = [];

    // Check 1: Is this a known/trusted device?
    let isNewDevice = false;
    if (device_fingerprint) {
      const { data: trustedDevice } = await supabase
        .from('trusted_devices')
        .select('id, is_trusted')
        .eq('user_id', user_id)
        .eq('device_fingerprint', device_fingerprint)
        .maybeSingle();

      if (!trustedDevice) {
        isNewDevice = true;
        suspicionReasons.push('new_device');
        
        // Record the new device (untrusted until confirmed)
        await supabase
          .from('trusted_devices')
          .upsert({
            user_id,
            device_fingerprint,
            device_name: device_name || user_agent?.substring(0, 100) || 'Unknown',
            ip_address,
            country,
            city,
            is_trusted: false,
            trust_confirmed_via: null,
          }, { onConflict: 'user_id,device_fingerprint' });
      } else {
        // Update last seen
        await supabase
          .from('trusted_devices')
          .update({ last_seen_at: new Date().toISOString(), ip_address, country, city })
          .eq('id', trustedDevice.id);
      }
    }

    // Check 2: New country?
    const { data: recentLogins } = await supabase
      .from('login_history')
      .select('country')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(20);

    const knownCountries = new Set((recentLogins || []).map(l => l.country).filter(Boolean));
    const isNewCountry = country !== 'unknown' && knownCountries.size > 0 && !knownCountries.has(country);
    if (isNewCountry) {
      suspicionReasons.push(`new_country:${country}`);
    }

    // Check 3: Rapid logins from different locations
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: rapidLogins } = await supabase
      .from('login_history')
      .select('ip_address, country')
      .eq('user_id', user_id)
      .gt('created_at', fiveMinAgo);

    const uniqueIPs = new Set((rapidLogins || []).map(l => l.ip_address).filter(Boolean));
    if (uniqueIPs.size >= 3) {
      suspicionReasons.push('rapid_multi_ip');
    }

    const isSuspicious = suspicionReasons.length > 0;

    // Record login in history
    const { data: loginRecord } = await supabase
      .from('login_history')
      .insert({
        user_id,
        ip_address,
        country,
        city,
        device_fingerprint,
        user_agent,
        login_method: login_method || 'password',
        is_suspicious: isSuspicious,
        suspicion_reasons: suspicionReasons.length > 0 ? suspicionReasons : null,
      })
      .select()
      .single();

    // If suspicious, send SMS alert
    let alertSent = false;
    if (isSuspicious) {
      const alertType = isNewDevice ? 'new_device' : 'login_anomaly';
      
      try {
        await supabase.functions.invoke('security-sms-alert', {
          body: {
            user_id,
            alert_type: alertType,
            metadata: {
              ip_address,
              country,
              city,
              device_fingerprint,
              device_name: device_name || 'Unknown Device',
              suspicion_reasons: suspicionReasons,
              login_id: loginRecord?.id,
            }
          }
        });
        alertSent = true;
      } catch (err) {
        console.error('Failed to send security alert:', err);
      }
    }

    return new Response(JSON.stringify({
      suspicious: isSuspicious,
      reasons: suspicionReasons,
      alert_sent: alertSent,
      country,
      city,
      is_new_device: isNewDevice,
      is_new_country: isNewCountry,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Login anomaly detector error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? (error as Error).message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));